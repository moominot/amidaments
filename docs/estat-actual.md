# Estat actual: bugs, deute tècnic i properes passes

Inventari fet llegint el codi (agost 2026).

**Estat: els vint-i-nou defectes estan corregits.** Es conserva la descripció de cadascun
perquè expliquen decisions del codi actual i serveixen de referència si tornen a aparèixer.
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

## Usabilitat i ús des del mòbil

Auditoria feta conduint l'aplicació en un mòbil emulat (390 px, tàctil) i contra el build de
producció. Tots els punts següents estan corregits.

### 12. Sense cobertura, l'aplicació no arrencava ✅

El service worker precachava només `/amidaments/`, `index.html` i `manifest.json`: els bundles
amb hash, que és on hi ha tota l'aplicació, quedaven fora. Comprovat contra el `dist` real: en
línia carregava; sense xarxa, **pàgina en blanc**. A peu d'obra, tancar i tornar a obrir l'app
era perdre-la.

No n'hi havia prou amb cachejar al vol: durant la primera càrrega el worker encara no controla
la pàgina, de manera que aquelles peticions no passen pel handler de `fetch`. Ara, en
instal·lar-se, llegeix l'`index.html` i en precacha els `<script>` i `<link>`. Les navegacions
van a xarxa primer amb l'`index.html` cachejat de reserva; la resta d'assets propis, cache
primer amb actualització en segon pla. Les peticions externes (Drive, proxy CORS) no es
cachegen mai.

### 13. La coma decimal es perdia en silenci ✅

Tots els camps eren `type="number"`. En un teclat català el separador decimal és la coma, i el
navegador la descarta: escrivint `12,5` el camp es quedava amb **`125`**. Deu vegades més
certificat, sense cap avís.

Corregit amb `components/NumberInput.jsx`: camp de text amb `inputMode="decimal"` (al mòbil
surt igualment el teclat numèric) i conversió pròpia (`utils/decimal.js`). Mentre s'escriu es
conserva el text tal qual, perquè `12,` sigui un estat vàlid, i el valor numèric es va
notificant a mesura que es pot interpretar, de manera que els totals segueixen en directe.
Substituït als 22 camps d'entrada de dades; només queda com a `number` el selector de nivells
de jerarquia, que és un enter amb fletxes.

### 14. 45 controls eren invisibles i inabastables al tacte ✅

El patró `opacity-0 group-hover:opacity-100`, en sis llocs. En un dispositiu tàctil no hi ha
hover: l'opacitat calculada era 0. Des del mòbil no es podia esborrar cap línia d'amidament,
ni cap partida, ni cap línia de certificació. A més feien 12×12 px.

Ara són `opacity-60 md:opacity-0 md:group-hover:opacity-100` — visibles al mòbil, i a
l'escriptori es mantenen discrets fins que hi passes el cursor — amb l'àrea de toc ampliada.

### 15. Navegar per l'arbre des del mòbil ✅

Tocar la fila d'un capítol no l'expandia: obria el panell de detall. L'única manera de desplegar
era encertar el chevron, de 24×31 px, que és el gest més freqüent de tots. Ara la fila sencera
desplega el capítol; les partides continuen obrint el panell.

Els objectius tàctils han passat de 20-27 px a 40-43 px als controls d'ús constant (pestanyes,
fases, desfer/refer, detall). Les accions ocasionals de la segona línia de la barra es queden
entre 26 i 29 px: pujar-les també costaria una altra franja d'alçada en una pantalla on el
"chrome" ja ocupa gairebé la meitat.

### 16. S'obria per una fase aprovada ✅

`activeCertId` requeia sempre a `certifications[0]`, que normalment és una fase antiga i
aprovada: obrir l'app per certificar et deixava en una pantalla bloquejada. Ara comença per
l'última fase oberta.

### 17. Les pestanyes de fase sortien de pantalla ✅

"Certificació 2" ocupava x=308..422 en una pantalla de 390 px, sense cap indici que hi hagués
més fases. Ara la fase activa es desplaça sola dins del seu contenidor.

> Compte amb `scrollIntoView`: arrossega també els contenidors superiors i desplaçava tota la
> interfície 13 px cap a l'esquerra. Cal desplaçar el contenidor a mà (`scrollTo`).

### 18. La data de la certificació no es podia posar ✅

S'assignava el dia que es creava la fase i no es mostrava ni s'editava enlloc, però encapçala el
document i va al registre `~F` del BC3. Una certificació es data a final de període. Ara hi ha
un camp de data a la barra, i **el PDF fa servir la data de la fase, no la del dia que
s'imprimeix** — abans una certificació de març impresa al juny sortia amb data de juny.

### 19. Aprovar era irreversible i les fases no es podien gestionar ✅

No es podia esborrar, reanomenar ni desaprovar una fase: un clic per error només se solucionava
editant el JSON. S'hi afegeixen `reopenCertification`, `renameCertification`,
`deleteCertification` i `updateCertificationDate`.

Esborrar una fase també la treu de `node.certifications` de tot l'arbre; si no, hi quedarien
dades orfes que es tornarien a escriure al BC3.

El bloqueig de les fases aprovades **ara es comprova al hook**, no només al component: abans
cap camí de la interfície hi arribava, però era un forat defensiu.

### 20. No hi havia desfer ✅

Cap acció es podia revertir, i l'ajust de PEM reescriu tots els preus del projecte.

`hooks/useHistory.js` observa `budget` i `priceDatabase` i en guarda les instantànies anteriors.
No substitueix els `useState` existents: hi ha desenes de crides a `setBudget` repartides per
l'aplicació i reescriure-les totes seria una font de regressions. Guardar instantànies és barat
perquè totes les mutacions són immutables — la pila conté referències, no còpies. Els canvis
seguits es fusionen en una sola entrada perquè escriure una xifra no deixi una entrada per tecla.
Ctrl+Z / Ctrl+Maj+Z, i botons al capçal per al mòbil.

### 21. «Nou projecte» destruïa la feina ✅

Només hi havia un projecte viu i l'única xarxa de seguretat era haver exportat un JSON abans.
`utils/projectLibrary.js` en manté una còpia de cada obra amb què s'ha treballat, accessible des
d'Obrir → Projectes recents.

Cada projecte va sota la seva pròpia clau, amb un índex a part només amb les metadades. Això
importa: l'autodesat es dispara a cada pausa d'escriptura i, amb tots els projectes en una sola
entrada, cada desat obligaria a serialitzar-los tots — uns quants MB en un telèfon. Quan la
quota de `localStorage` s'exhaureix, es descarten els més antics abans de rendir-se.

### 22. Commutar entre PARCIAL i A ORIGEN movia els imports ✅

El valor desat a `node.certifications[certId]` era **ambigu**: significava l'acumulat o el del
període segons el `method` de la fase. Commutar el mètode no esborrava res, però reinterpretava
les mateixes dades i l'import certificat canviava sol. Reproduït amb dues fases de 30 i 40 sobre
una partida de 100 m² a 10 €/m²:

| Mètode | Anterior | Període | Origen |
|---|---|---|---|
| `partial` | 300 € | 400 € | **700 €** |
| `origin` | 300 € | 100 € | **400 €** |

Des del punt de vista de qui certifica és indistingible de perdre amidaments.

**Ara el valor desat sempre és l'acumulat a origen**, i el `method` només tria quin camp es
destaca al panell. Els dos camps —«Del període» i «A origen»— són editables sempre: s'escriu
en el que convingui i l'altre es recalcula. Commutar el mètode ja no altera cap xifra,
comprovat al navegador amb tres commutacions seguides sobre el projecte de mostra.

`calcItemCertifiedQty` deixa de dependre de la llista de fases, de manera que desapareix un dels
paràmetres opcionals que fallaven en silenci (§9).

**Migració.** `utils/migrateBudget.js` converteix una sola vegada els projectes amb fases en
`partial`, de manera que els totals no es mouen, i marca `schemaVersion: 2`. S'aplica a tot
projecte que arribi de fora: `localStorage`, JSON de disc, Drive, biblioteca i BC3. Quan una
fase té detall d'amidament s'hi afegeix una línia «Certificat anterior (acumulat)» al davant,
que conserva alhora el total i les línies introduïdes. La conversió arrossega uns cèntims de
diferència en projectes grans (5 cèntims sobre 173.600 € en la prova), perquè `round2` s'aplica
partida a partida com a la resta de l'aplicació.

> **Limitació coneguda, no introduïda aquí:** en importar un BC3, les línies `~M` amb fase es
> llegeixen com l'acumulat d'aquella fase. Si el fitxer d'origen les escriu com a mesurament
> del període, la lectura serà incorrecta. Veure §23.

### 23. L'exportació `~M` no tenia la forma de la norma ✅

L'exportador escrivia `~M|codi|linies`: les línies queien al camp de la **POSICIO** i el
**MEDICION_TOTAL** no s'escrivia. El nostre parser ho tolerava perquè escaneja els camps 1..4
buscant les línies —de fet, la heurística existeix en part per llegir la nostra pròpia
sortida—, però qualsevol altre programa ho llegia malament. Ara s'escriu
`~M|codi||TOTAL|linies|`.

També s'eliminen els registres **`~Q`** que escrivia l'exportador. Contrastat amb
[l'especificació oficial](https://www.fiebdc.es/web2/datos/uploads/Standard-exchange-format-FIEBDC-3-2020v2_eng-.pdf):
`~Q` existeix, però és el registre de **plecs de condicions**
(`~Q | <CODI_CONCEPTE\> | {CODI_SECCIO_PLEC \ CODI_PARAGRAF \ {AMBIT;}\} |`), no de
quantitats. Escriure-hi `~Q|codi|quantitat|fase` feia que un altre programa intentés llegir-ho
com a assignació de plecs.

En importar, el MEDICION_TOTAL passa a fer de **xarxa de seguretat**: si les línies llegides no
en reprodueixen el valor (tolerància 0,02), es descarten i es deixa una sola línia amb el total
del fitxer. Sobre el fitxer de mostra els 144 registres quadren, de manera que no salta; provat
a part amb línies il·legibles, amb línies que no sumen el total i sense total declarat.

### 24. Les certificacions en BC3 no eren conformes a la norma ✅

Contrastat amb l'especificació oficial FIEBDC-3/2020 (extracte a `docs/fiebdc-norma.md`).
**Segons la norma, una certificació és un fitxer BC3 sencer i independent**, idèntic en
estructura a un pressupost, distingit pel registre `~V`:

```
~V | PROPIETAT | VERSIO\DATA | PROGRAMA | CAPÇALERA | JOC_CARÀCTERS | COMENTARI
   | TIPUS_INFORMACIO | NUM_CERTIFICACIO | DATA_CERTIFICACIO | URL_BASE |
```

amb `TIPUS_INFORMACIO = 3` (*cost real*). El nom del fitxer és el del pressupost més
`#certification NNNN`, de manera que un programa pot importar el pressupost i les
certificacions que vulgui alhora.

L'aplicació ho feia d'una altra manera —un sol fitxer amb les fases declarades a `~F` i el
número de fase al primer subcamp de cada línia de `~M`— i **xocava amb dos usos reals**:

| Ús nostre | Què diu la norma |
|---|---|
| `~F\|num\|data\|nom` com a declaració de fase | `~F` és **document adjunt**: `~F \| CODI_CONCEPTE \| {TIPUS\FITXER.EXT;}...` |
| Primer subcamp de la línia `~M` = número de fase | És **TIPUS**: «1» subtotal parcial, «2» subtotal acumulat, «3» expressió |

Un altre programa llegia les nostres línies de certificació com a files de subtotal, i les
declaracions de fase com a adjunts d'un concepte inexistent. A més, el `~V` que escrivíem
(`~V|FIEBDC-3/2016|PreuArq BIM|ANSI`) tenia els camps desplaçats una posició: la versió al
camp de la propietat, el programa al de la versió i el joc de caràcters al del programa.

**Correcció.** L'exportador s'ha extret a `src/utils/bc3Writer.js` i escriu **un fitxer per
document**: `generateBC3({...})` sol fa el pressupost (`TIPUS_INFORMACIO = 2`) i amb
`certification` fa aquella certificació (`= 3`, amb número i data). Els registres `~F` i el
subcamp de fase desapareixen. En importar, un `~V` de tipus 3 sobre un projecte obert va a
`importCertification`, que fa coincidir els codis i penja els amidaments a la fase.

**Un botó, el document actiu.** No cal exportar-les totes: la norma preveu explícitament
importar «només les seleccionades», i el que ha de ser correcte és el nom del fitxer i el `~V`.
El mateix parell de botons (disc i Drive) exporta el pressupost o la certificació activa segons
el mode, i el menú diu quin dels dos sortirà.

Els fitxers exportats amb el format antic es continuen llegint: el cas `~F` del parser només
els accepta com a fase quan el registre en té la forma exacta (número curt de fase i data de
vuit xifres), cosa que un adjunt de veritat no té mai.

### 25. L'exportació perdia el rendiment del descomposat ✅

En importar una partida amb descomposat, el parser en penja els components a `breakdown` (amb
el seu rendiment) i **també** a `items`, perquè tots dos surten del mateix registre `~D`.
L'exportador mirava primer els fills:

```js
if (hasChildren)      { /* fills, tots amb rendiment 1 */ }
else if (hasBreakdown) { /* descomposat, amb el rendiment bo */ }
```

Com que una partida importada amb descomposat sempre té les dues coses, sempre queia a la
primera branca i escrivia tots els rendiments a 1. En reimportar, `getItemUnitPrice` calcula el
preu com la suma de `preu × rendiment` dels components: amb tots els rendiments a 1, una
partida de 15,01 €/m² en tornava **201,72**.

Sobre el fitxer de mostra, el cicle exportar → reimportar donava un PEM de **394.955,33 €** en
comptes de 135.202,54 €. Les quantitats es conservaven —que és el que es comprovava— i per això
havia passat desapercebut: el que es movia eren els preus.

Ara s'escriu primer el descomposat, amb el seu rendiment, i després els fills que no hi siguin.

### 26. El registre arrel `~D|##|` es perdia en reimportar ✅

`normalizeCode` treu els coixinets finals d'un codi, de manera que `##` (el concepte arrel del
pressupost) queda com a cadena buida. El parser feia:

```js
const pCode = normalizeCode(fields[0]);
if (pCode && rawChildren) { ... }
```

i descartava el registre com si no tingués codi. Amb ell es perdia la llista de capítols del
projecte: els capítols es quedaven sense pare, passaven a ser arrels i sortien en l'ordre en què
`Object.keys` retorna les claus —les que semblen índexs primer— de manera que reimportar un
fitxer propi els reordenava a `10#`, `11#`… `23#`, `00#`, `01#`…

Del mateix cicle sortien dos residus més, que ara també es filtren:

- el concepte arrel entrava a la base de preus amb la clau buida, i la següent exportació
  n'escrivia un `~C` sense codi que desmuntava el fitxer sencer (al tercer cicle el projecte
  es quedava en un sol capítol amb el codi `#`);
- l'arrel d'un projecte anterior que s'hagués quedat a la base de preus s'afegia com a capítol
  buit a cada cicle.

Comprovat encadenant tres cicles sobre el fitxer de mostra: PEM, nombre de capítols i ordre es
conserven.

### 27. Obrir un projecte des del sistema no feia res ✅

El manifest declarava `file_handlers` només per a `.bc3`, de manera que un projecte natiu no
s'associava mai a l'aplicació. I encara que s'hi hagués associat, el consumidor del
`launchQueue` comprovava:

```js
if (projectData.budget && projectData.projectMetadata) { ... }
```

i `projectMetadata` **no s'escrivia enlloc**: el que desem és `{budget, priceDatabase,
exportDate, version}`. La condició sempre era falsa i el codi no tenia branca `else`, o sigui
que el fitxer s'obria, es llegia, es descartava i no passava res ni sortia cap avís.

L'arrel era que hi havia **tres comprovacions diferents** del mateix: el selector de fitxers
demanava `budget && priceDatabase`, la File Handling API `budget && projectMetadata`, i Drive
`budget && priceDatabase`. Ara totes tres passen per `llegeixProjecte` (`utils/projectFile.js`),
que a més accepta un projecte sense base de preus pròpia —abans es descartava— i qui la crida
ha d'avisar l'usuari quan retorna `null`.

De passada, l'arrossegament de fitxers donava per fet que tot el que es deixava caure era un
BC3: un projecte arrossegat es llegia com a Windows-1252 i acabava amb «Format BC3 no
reconegut». Ara també passa per `obreFitxer`.

### 28. La importació des d'URL va deixar de funcionar ✅

Arrossegar l'enllaç d'un BC3 del Generador de Preus donava un `403 (Forbidden)` a la consola.
No havia canviat res ni aquí ni a CYPE: **corsproxy.io va canviar l'API**. El format que
fèiem servir,

```js
`https://corsproxy.io/?${encodeURIComponent(url)}`
```

ara respon `{"success":false,"status":403,"error":"keyless_legacy_url"}`. El bo és
`?url=<url codificada>`, i amb el pla gratuït només respon a peticions de navegador; des d'un
script diu «Server-side requests are not allowed on your plan».

A sobre, `importFromUrl` no mirava `response.ok`: el cos de l'error se n'anava al parser i
l'usuari veia «Format BC3 no reconegut», que apunta a un lloc que no és.

La descàrrega passa a `utils/corsProxy.js`, amb tres coses que abans no hi eren:

- **Una llista de proxys**, provats per ordre, en comptes d'un de sol. Ja ens n'ha caigut un;
  amb un de sol tornarà a passar.
- **`VITE_CORS_PROXY`** per posar-hi un proxy propi, que es prova primer. Un Worker de
  Cloudflare són quinze línies i no depèn de ningú.
- **Comprovació que la resposta és un BC3** (que comenci per un registre `~`), perquè
  gairebé tots aquests serveis contesten `200` amb un JSON d'error a dins quan et refusen.

### 29. Importar una partida de CYPE n'arrossegava disset de residus ✅

Un BC3 del Generador de Preus porta, a més de la partida, els conceptes de gestió de residus
(`re150101`, `ruo170101`…) i el concepte de percentatge «Costos directes complementaris». No
els referencia ningú i no tenen amidament: són entrades de banc de preus, no partides d'obra.
Com que el filtre d'arrels acceptava qualsevol concepte orfe **amb unitat**, entraven tots al
projecte com a partides de primer nivell. Arrossegar una partida n'afegia divuit.

Ara una arrel només és un node del projecte si es descompon —és un capítol— o si porta
amidament —és una partida. I un concepte de percentatge no ho és mai: com a fill ja s'excloïa,
com a arrel s'hi colava.

Els fitxers que són una llista plana de partides sense estructura continuen entrant, perquè
cadascuna porta el seu amidament. Comprovat: el fitxer de mostra segueix a 135.202,54 € amb
24 capítols, i arrossegar l'enllaç de CYPE deixa un sol capítol, `D# DEMOLICIONS`, amb la
partida `DCE010` a dins.

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

1. ~~Arreglar els punts 1–23.~~ ✅ Fet.
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
