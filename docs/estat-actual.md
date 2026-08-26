# Estat actual: bugs, deute tècnic i properes passes

Inventari fet llegint el codi (agost 2026).

**Estat: els onze defectes de la secció següent estan corregits** a la branca
`claude/correccions-defectes-detectats`. Es conserva la descripció de cadascun perquè
expliquen decisions del codi actual i serveixen de referència si tornen a aparèixer.
El deute tècnic de la segona meitat del document continua obert.

---

## Defectes corregits

### 1. `flattenBudget` rep els arguments desplaçats al PDF d'amidaments ✅

`App.jsx:1100`:

```js
const rows = flattenBudget(nodes, 0, '', currentCounter, config,
                           calcChapterTotal, calcItemTotalAmount, priceDatabase);
```

La signatura és `(nodes, level, parentRef, counterObj, config, priceDatabase)`
(`App.jsx:119`). Amb aquesta crida, el paràmetre `priceDatabase` rep **la funció
`calcChapterTotal`**, i els dos últims arguments s'ignoren.

Conseqüència: dins de `flattenBudget`, `calcChapterTotal(node, <funció>)` i
`getItemUnitPrice(node, <funció>)` fan `priceDatabase[code]?.price` sobre una funció → sempre
`undefined` → cauen a `node.price`. **El PDF d'amidaments imprimeix preus de `node.price` en
comptes dels del banc de preus.** Es nota després d'editar preus o d'aplicar un ajust de PEM.

Correcció: `flattenBudget(nodes, 0, '', currentCounter, config, priceDatabase)`.
Probablement són restes d'una signatura antiga que passava les funcions de càlcul com a
paràmetres — el mateix patró queda a les props `calcItemTotalAmount` i `calcChapterTotal`
que es passen a `<PrintView>` (`App.jsx:3499`) i que el component no declara ni usa.

### 2. Les fases d'un BC3 importat no arriben mai a `budget.certifications` ✅

`bc3Parser.js:323` retorna la clau **`phases`**. `finalizeImport` (`App.jsx:2408`) llegeix
**`result.certifications`**, que no existeix, i per tant sempre desa `certifications: []`.

Conseqüència: en importar un BC3 amb certificacions, `buildTree` sí que omple
`node.certifications[<phase.id>]` amb les línies de cada fase, però **no hi ha cap fase a la
llista**, així que:
- la barra de certificacions surt buida,
- les dades per fase queden orfes (indexades per uns UUID que no apunten enlloc),
- i, com que `finalizeImport` en mode *replace* substitueix `budget` sencer, es perden les
  fases que hi hagués abans.

Correcció mínima: `certifications: result.phases || []`. Convé decidir també què passa en
mode *merge*, on ara mateix les fases importades s'ignoren del tot.

### 3. `~Q` per fase a l'exportació BC3 no s'emet mai ✅

`App.jsx:2070`:

```js
const accumulatedQty = calcItemCertifiedQty(
    { code: norm, certifications: budget.certifications }, cert.id, budget.certifications);
```

El primer paràmetre hauria de ser un **node**, amb `certifications` com a **mapa
`{certId: {...}}`**. Aquí s'hi passa l'**array** de fases del pressupost. Dins de
`calcItemCertifiedQty`, `item.certifications[certId]` sobre un array dona `undefined` → 0 →
la condició `if (accumulatedQty > 0)` mai es compleix.

Conseqüència: els `~Q` per fase no s'escriuen. Les línies `~M` amb fase sí que s'escriuen, de
manera que el BC3 exportat és recuperable, però els programes que llegeixen el total
acumulat del `~Q` veuran les certificacions a zero.

Correcció: `generateBC3` hauria de conservar el node (o el seu mapa `certifications`) a
`measurementsByCode` per poder-lo passar aquí.

### 4. `PrintView` es renderitza dues vegades ✅

`App.jsx:3497` i `App.jsx:4354`. Les dues instàncies estan sota `{showPrint && …}`, així que
en obrir la previsualització es munten **dos overlays a pantalla completa superposats**.
La primera no rep `handleExportXLSX`, de manera que si és la que queda a sobre, el botó
**Excel** fa `onClick={undefined}`.

Correcció: esborrar el bloc de la línia 3497 i deixar el complet del final.

### 5. `toggleWaste` crida un setter inexistent ✅

`App.jsx:2873`: `const toggleWaste = (id) => setShowWaste(...)`. No hi ha cap
`useState` per a `showWaste`, i ESLint ho marca com a `no-undef`. La funció no es crida
enlloc, de manera que no peta en execució; és codi mort d'una funcionalitat de "minves"
(*mermas*) que no es va acabar. Esborrar-la, o implementar la funcionalitat.

### 6. Import/preus incoherents entre pantalla i sortides ✅

`calcChapterTotal(chapter, priceDatabase)` i `calcItemTotalAmount(item, priceDatabase)`
cauen a `node.price` si no reben el segon paràmetre. Els llocs on **no** es passa:

| Lloc | Línia |
|---|---|
| Taula de resum de `PrintView` | `App.jsx:435` |
| PDF de resum | `App.jsx:1243` |
| Excel (imports i resum) | `App.jsx:1345`, `1397` |
| Taula principal de l'editor (import i preu unitari) | `App.jsx:3202`, `3239`, `4092` |
| `renderTableRows` mòbil | `App.jsx:3157` |

Mentrestant `budgetTotal` (`App.jsx:1085`) **sí** el passa. Resultat: després d'editar un
preu al banc de preus, el **Total PEM** del capçal i la suma de les files de la taula poden
no quadrar. Correcció: passar `priceDatabase` sempre; a mig termini, fer-lo obligatori
(o injectar-lo per context) perquè no es pugui oblidar.

### 7. `handleNewProject` crea un projecte sense `certifications` ✅

`App.jsx:2250`: `setBudget({ id, name: 'Nou Projecte', chapters: [] })` — sense la clau
`certifications`. La resta del codi fa servir `budget.certifications || []` en molts llocs,
però `createCertification` (`App.jsx:1056`) llegeix `budget.certifications.length`
directament → **`TypeError` en crear la primera certificació d'un projecte nou**.
Correcció: afegir `certifications: []`.

### 8. El BC3 exportat no es podia tornar a importar ✅

Trobat en verificar les correccions anteriors, no llegint el codi. El writer escrivia les
línies de `~M` en blocs de set camps amb aquest ordre:

```
FASE \ TIPO(=2) \ DESC \ U \ L \ A \ H
```

però `processBC3Data`, quan detecta `step === 7`, llegeix `desc` a l'índex 1 i les quantitats
a partir del 2, és a dir:

```
FASE \ DESC \ U \ L \ A \ H \ (separador)
```

El `2` intercalat desplaçava tots els camps una posició. **Un fitxer exportat i tornat a
importar donava amidaments diferents**: en un cas de prova de 3×2 + 4×1 = 10 m², la
reimportació donava 13 i inventava una tercera línia.

Comprovat amb els dos formats sobre el mateix joc de dades abans i després del canvi.
Ara el writer emet blocs de `FASE \ DESC \ U \ L \ A \ H \` i el cicle
exportar → reimportar conserva quantitats, fases i descripcions.

Aquest és el defecte que la comprovació de `CLAUDE.md` ("importar → veure PEM → exportar →
reimportar") havia de detectar, i el motiu pel qual val la pena automatitzar-la.

### 9. El total certificat del capçal ignorava el mètode de la fase ✅

`certifiedTotal` cridava `calcChapterCertifiedTotal(ch, activeCertId, priceDatabase)` **sense
el quart paràmetre**, `certifications`. Amb el valor per defecte `[]`, `calcItemCertifiedQty`
no trobava la fase a la llista i sempre es comportava com si el mètode fos `origin`.

Conseqüència: en una fase amb mètode **PARCIAL**, el total del capçal mostrava només la
quantitat del període en comptes de l'acumulat, mentre que les files de la taula —que sí que
passaven `budget.certifications`— mostraven l'acumulat. Els dos números no quadraven.

Comprovat amb una partida de 100 € certificada 3 i 4 en dues fases: amb mètode `partial`
el total ha de ser 70 € (3+4 acumulats) i abans en donava 40.

Ara `certifiedTotal` surt de `buildCertificationSummary`, que rep sempre la llista de fases.

### 10. Les etiquetes del commutador Pressupost/Certificació no es veien mai ✅

Els dos botons de mode del capçal amagaven el text amb `hidden xs:inline`, però
`tailwind.config.js` no definia cap breakpoint `xs`. Tailwind descarta la variant desconeguda,
de manera que el `hidden` no es revertia **en cap amplada** i el commutador es quedava només
amb les icones, sense text, també en escriptori.

Es va detectar en no poder seleccionar el botó per nom accessible en provar l'aplicació amb un
navegador: sense text, el botó no en tenia. Corregit definint `screens: { xs: '475px' }`.

---

## Funcionalitats afegides

### Resum de certificació

El mode certificació ja no és només d'entrada de dades: incorpora una **barra de resum en viu**
sota la barra de fases i un **detall per capítols**. Tots dos surten de
`buildCertificationSummary`.

### PDF de certificació

Document complet per fase: resum per capítols, quadre de liquidació amb G.G. / B.I. / IVA,
import en lletres, signatures i detall per partides opcional. A `src/utils/certificationPdf.js`,
fora d'`App.jsx` — és la primera passa del refactor d'exportadors que hi ha més avall.

Detalls de tots dos a `docs/certificacions.md`.

### 11. Els fitxers exportats es descarregaven com a «download» ✅

`doc.save()` i `a.download` rebien el nom del projecte sense sanejar. **Chromium descarta
l'atribut `download` sencer si conté qualsevol caràcter no ASCII** i desa el fitxer com a
`download`, sense extensió. Amb noms de projecte en català ("Reforma d'habitatge",
"Certificació 2") passava pràcticament sempre.

Comprovat amb el navegador: `"Simple 2.pdf"` arriba bé, `"Certificació 2.pdf"` arriba com a
`"download"`. Afectava **totes** les exportacions: PDF d'amidaments, PDF de resum, Excel, BC3
i el projecte JSON.

Corregit amb `safeFileName` (`src/utils/fileName.js`), que translitera els accents
(`Certificació 2` → `Certificacio 2`) i elimina els caràcters no vàlids. Es perd el diacrític,
però el nom continua essent llegible i el fitxer conserva l'extensió.

---

## Deute tècnic

### `App.jsx` és un monòlit de 4.380 línies

Conté 30+ `useState`, tota la lògica de negoci que no s'ha extret i tota la UI. Ja hi ha una
direcció començada (`utils/`, `hooks/`, `components/`) que val la pena continuar. Ordre
suggerit, de menys a més arriscat:

1. **Components de presentació pura**, que ja estan aïllats dins del fitxer:
   `PrintView`, `PrintConfigModal`, `PemAdjustmentModal`, `ItemCreator`, `ImportConfirmModal`
   → `src/components/`.
2. **Exportadors**: `handleExportPDF`, `handleExportSummaryPDF`, `handleExportXLSX` i
   `flattenBudget` → `src/utils/export/`. Són funcions que només necessiten
   `(budget, priceDatabase, config)`. `numberToTextCatalan` i el PDF de certificació ja
   estan extrets (`utils/numberToText.js`, `utils/certificationPdf.js`) i serveixen de
   model: reben dades, retornen un `jsPDF`, i es poden provar sense muntar React.
3. **`generateBC3`** → `src/utils/bc3Writer.js`, al costat de `bc3Parser.js`.
4. **Mutacions de l'arbre** → un `useBudgetTree(budget, setBudget)` amb un únic helper
   `mapNode(nodes, id, fn)` que substitueixi les ~15 còpies del mateix `updateInTree`.
5. **Importació** (`startImportProcess` / `finalizeImport` / `mergeTreeBranches` /
   `handleDrop` / `importFromUrl`) → `useProjectImport`.

### Sense tests

No hi ha cap test ni cap runner. Les funcions de `calculations.js` i `bc3Parser.js` són pures
i deterministes: és el lloc evident per començar (Vitest s'integra directament amb Vite).
Casos que val la pena fixar abans de tocar res:

- `calcItemTotalQty` amb línies d'increment;
- `getItemUnitPrice` amb línies `%` i amb preferència de `priceDatabase`;
- `calcItemCertifiedQty` en mètode `origin` i `partial`;
- `processBC3Data` sobre `REFORMA ESPORLES_MEDICIONES_AJUSTADO.bc3` (nombre de capítols,
  PEM total, nombre de línies d'amidament d'una partida coneguda);
- **round-trip**: `processBC3Data(generateBC3(projecte))` ≈ `projecte`.

### Lint ✅ (resolt) i migració pendent a flat config

`eslint .` amb ESLint 8 només agafa `.js` per defecte, de manera que cap `.jsx` no s'analitzava
i els 30 errors d'`App.jsx` quedaven amagats. El script ara és `eslint . --ext .js,.jsx` i
l'arbre està **net: 0 errors**, amb un únic avís preexistent de `react-refresh` a
`DriveConfigContext.jsx`.

En el procés es va eliminar codi mort (`renderTreeNodes`, `toggleWaste`, `toggleJustification`,
`showJustification`, `lastSaved`, `utf8Array`, `generateBC3Ref` i els paràmetres
`getBc3Content`/`budgetRef` de `useGoogleDrive`), es van embolcallar els `case` de
`bc3Parser.js` amb claus i es va desactivar `react/no-unescaped-entities`, que en una UI en
català només genera soroll.

**Continua pendent** migrar a *flat config* (`eslint.config.js`): és el format que exigeix
ESLint ≥ 9, i amb un ESLint global més nou instal·lat `npm run lint` falla.

### Altres

- **`base` duplicat en tres llocs**: `vite.config.js`, `public/manifest.json` i `public/sw.js`
  tenen `/amidaments/` escrit a mà. Canviar de path implica tocar-los tots tres.
- **Service worker cache-first sense versionat d'assets**: `sw.js` només cacheja el shell i
  serveix qualsevol cosa cachejada abans de la xarxa. Els bundles amb hash no hi són, però
  `index.html` sí, de manera que un desplegament nou pot quedar servint l'HTML antic fins
  que canviï `CACHE_NAME` a mà.
- **Bundle d'1 MB** (319 kB gzip) en un sol chunk. jsPDF + html2canvas + SheetJS són la major
  part i només calen en exportar: candidats clars a `import()` dinàmic.
- **`corsproxy.io`** com a dependència externa per a la importació des d'URL (`App.jsx:2427`).
- **Sense confirmació en sortir amb canvis sense desar**: `beforeunload` desa a `localStorage`
  però no avisa. Com que el desat local és fiable, és acceptable, però un projecte obert des
  de Drive es pot perdre si no s'hi ha tornat a desar.
- **`lastSaved`** es calcula i no es mostra: seria un indicador útil al capçal.
- **`expandedSidebarSections`** no inclou la clau `unit` a l'estat inicial (`App.jsx:960`),
  així que la secció "Unitat" del sidebar arrenca plegada mentre les altres surten obertes.
- **`node_modules/` i `dist/` estan versionats** (5.724 i 3 fitxers) tot i figurar al
  `.gitignore`: es van afegir abans que les regles d'ignorar, i el `.gitignore` no desindexa
  el que ja està seguit. Cada `npm install` embruta el `git status` amb centenars de fitxers.
  Cal `git rm -r --cached node_modules dist` en un commit dedicat.
- **Fitxers a l'arrel que no hi haurien de ser**: dues captures de pantalla `.jpg` i el BC3 de
  mostra. El BC3 val la pena conservar-lo com a *fixture* — moure'l a `test/fixtures/`.

---

## Propostes de treball

Per ordre de relació valor/esforç:

1. ~~Arreglar els punts 1–11.~~ ✅ Fet.
2. ~~Activar el lint sobre `.jsx`.~~ ✅ Fet (queda la migració a flat config).
3. **Vitest + tests de `calculations.js` i `bc3Parser.js`**, amb el BC3 de mostra com a
   fixture. És ara la prioritat: les correccions 2, 3 i 8 es van validar amb scripts d'un sol
   ús que no han quedat al repositori, i el cicle exportar → reimportar hauria de ser una
   prova automàtica, no un ritual manual.
4. **Extreure els exportadors i el writer BC3** d'`App.jsx` (passes 2 i 3 del refactor).
5. **Bloqueig real de fases aprovades** al hook `useCertification`.
6. ~~Informe de certificació en PDF.~~ ✅ Fet.
7. **Code-splitting** de jsPDF / SheetJS.
8. **`git rm -r --cached node_modules dist`** en un commit dedicat.
