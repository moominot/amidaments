# Estat actual: bugs, deute tècnic i properes passes

Inventari fet llegint el codi (agost 2026). Els punts 1–7 són **defectes concrets i
localitzats**, verificables llegint les línies indicades. Cap no s'ha corregit encara:
aquest document és el punt de partida per fer-ho.

---

## Defectes

### 1. `flattenBudget` rep els arguments desplaçats al PDF d'amidaments

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

### 2. Les fases d'un BC3 importat no arriben mai a `budget.certifications`

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

### 3. `~Q` per fase a l'exportació BC3 no s'emet mai

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

### 4. `PrintView` es renderitza dues vegades

`App.jsx:3497` i `App.jsx:4354`. Les dues instàncies estan sota `{showPrint && …}`, així que
en obrir la previsualització es munten **dos overlays a pantalla completa superposats**.
La primera no rep `handleExportXLSX`, de manera que si és la que queda a sobre, el botó
**Excel** fa `onClick={undefined}`.

Correcció: esborrar el bloc de la línia 3497 i deixar el complet del final.

### 5. `toggleWaste` crida un setter inexistent

`App.jsx:2873`: `const toggleWaste = (id) => setShowWaste(...)`. No hi ha cap
`useState` per a `showWaste`, i ESLint ho marca com a `no-undef`. La funció no es crida
enlloc, de manera que no peta en execució; és codi mort d'una funcionalitat de "minves"
(*mermas*) que no es va acabar. Esborrar-la, o implementar la funcionalitat.

### 6. Import/preus incoherents entre pantalla i sortides

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

### 7. `handleNewProject` crea un projecte sense `certifications`

`App.jsx:2250`: `setBudget({ id, name: 'Nou Projecte', chapters: [] })` — sense la clau
`certifications`. La resta del codi fa servir `budget.certifications || []` en molts llocs,
però `createCertification` (`App.jsx:1056`) llegeix `budget.certifications.length`
directament → **`TypeError` en crear la primera certificació d'un projecte nou**.
Correcció: afegir `certifications: []`.

---

## Deute tècnic

### `App.jsx` és un monòlit de 4.380 línies

Conté 30+ `useState`, tota la lògica de negoci que no s'ha extret i tota la UI. Ja hi ha una
direcció començada (`utils/`, `hooks/`, `components/`) que val la pena continuar. Ordre
suggerit, de menys a més arriscat:

1. **Components de presentació pura**, que ja estan aïllats dins del fitxer:
   `PrintView`, `PrintConfigModal`, `PemAdjustmentModal`, `ItemCreator`, `ImportConfirmModal`
   → `src/components/`.
2. **Exportadors**: `handleExportPDF`, `handleExportSummaryPDF`, `handleExportXLSX`,
   `numberToTextCatalan`, `flattenBudget` → `src/utils/export/`. Són funcions que només
   necessiten `(budget, priceDatabase, config)`; extreure-les força a arreglar el punt 1.
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

### `npm run lint` no analitza els `.jsx`

`eslint .` amb ESLint 8 només agafa `.js` per defecte. Per això `App.jsx` (30 errors i
5 avisos) no apareix a la sortida del script. Arreglar amb `eslint . --ext .js,.jsx`, o
migrant a *flat config* (`eslint.config.js`), que és el format que espera ESLint ≥ 9.

Errors reals que amaga: `no-undef` de `setShowWaste`, variables sense usar
(`utf8Array`, `renderTreeNodes`, `toggleJustification`), escapades innecessàries a la regexp
de sanejat de noms de full Excel, i un `catch {}` buit a `handleDrop`.

Els 21 errors que sí que es veuen són gairebé tots `no-case-declarations` a `bc3Parser.js`
(cal embolcallar cada `case` amb claus) i variables mortes a `googleDrive.js` i
`useGoogleDrive.js`.

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

1. **Arreglar els punts 1–7.** Són petits, aïllats i afecten sortides que l'usuari veu.
2. **Activar el lint sobre `.jsx`** i netejar el que surti.
3. **Vitest + tests de `calculations.js` i `bc3Parser.js`**, amb el BC3 de mostra com a fixture.
4. **Extreure els exportadors i el writer BC3** d'`App.jsx` (passes 2 i 3 del refactor).
5. **Bloqueig real de fases aprovades** al hook `useCertification`.
6. **Informe de certificació** (PDF per fase amb Anterior / Actual / Origen): és la peça que
   falta perquè el mode certificació sigui autònom — ara mateix es pot certificar però no
   se'n pot treure un document.
7. **Code-splitting** de jsPDF / SheetJS.
