# Importació d'IFC

Estat: **fases 1 i 2**. Un `.ifc` obert per qualsevol camí (selector, arrossegament) passa per
`obreFitxer`, que obre `components/IfcImportModal.jsx`; el que s'hi accepta s'insereix pel flux
d'`insereixNodes`, a l'arrel i a preu 0. **Fase 3** (vinculació al banc de preus), **fase 4** (reimportació per `GlobalId`) i
**fase 5** (manifest, fitxers compartits i lectura del fitxer) fetes.

## Què hi ha

| Fitxer | Responsabilitat |
|---|---|
| `src/utils/ifc/step.js` | Sintaxi STEP (ISO 10303-21): text → mapa `#id → { tipus, args }`. No sap res d'IFC. |
| `src/utils/ifc/lector.js` | `llegeixIfc(text)`: elements, plantes, tipus i `IfcElementQuantity`, amb les unitats convertides a SI. |
| `test/ifc.test.js` | Sobre `test/fixtures/ingetrazo-prova.ifc` (IngeTrazo 0.6.3.2, IFC4). |

El lector és JS pur, sense WASM: es prova a Vitest i no toca el service worker. `web-ifc` només
entrarà si cal calcular quantitats des de la geometria (models sense Qto).

## Model que retorna

```js
{
  info: { esquema, programa, projecte: { nom, descripcio } },
  unitats: { longitud, area, volum, massa },      // factors a m, m², m³, kg
  plantes: [{ id, guid, nom, elevacio }],
  elements: [{ id, guid, classe, nom, tipus, planta, espai,
               quantitats: [{ conjunt, nom, magnitud, valor }] }],
  avisos: [string]
}
```

`magnitud` és `longitud | area | volum | recompte | pes`; `valor` ja va en SI. `guid` és el
`GlobalId`, la clau prevista per a la reimportació.

## El que cal saber

- **El Qto no és sempre el que l'amidament vol.** Al fixture, el `GrossArea` de l'`IfcCovering`
  val 8,4 m² perquè és la superfície total de la caixa (2×2×0,05); la cara revestida fa 4 m². El
  lector porta el número tal com és: la validació contra la geometria és de la fase 2.
- La rampa és un `IfcShellBasedSurfaceModel` obert: no té volum i el seu `GrossArea` (6,231 m²,
  base + cara inclinada) no es pot contrastar.
- El pilot és un cilindre de 12 cares: el volum del Qto (0,36 m³) és el del polígon, no el del
  cercle (0,377).
- Les portes i finestres d'aquest model no estan allotjades en cap mur: els murs no en descompten
  els buits.
- Els textos poden portar escapaments (`\X2\00F3\X0\` = «ó»); `decodificaText` els resol.
- Les entitats complexes (`#1=(A() B())`) s'ometen: no se'n fa servir cap.

## Pla

1. **Fet**: lector de quantitats.
2. Taula classe→magnitud, avisos de coherència (Qto contra geometria), agrupació i modal.
3. Vinculació amb classificacions i banc de preus.
4. Reimportació per `GlobalId`.
5. `obreFitxer`, manifest, service worker i fitxers compartits.

## Fase 2: geometria i pressupost

| Fitxer | Responsabilitat |
|---|---|
| `src/utils/ifc/geometria.js` | Volum, superfície i cara més gran d'un element: `IfcFacetedBrep`, `IfcShellBasedSurfaceModel`, `IfcTriangulatedFaceSet` i `IfcExtrudedAreaSolid` (perfil rectangular, circular o polilínia). Res de booleans: l'element surt amb `parcial: true`. |
| `src/utils/ifc/pressupost.js` | `muntaPressupost(model, opcions)`: capítols per classe, una partida per tipus, una línia per element amb `ifc.guid`. `quantitatDeElement` tria i contrasta la quantitat. |

Regles (`CLASSES`): mur → m² (`NetSideArea`), llosa/coberta/revestiment → m² (`NetArea`),
pilar/biga/baranes/pilot/element → m (`Length`), sabata → m³, escala/rampa/porta/finestra → ud,
armadura → kg. Les classes que no hi són (proxys, mobiliari, xemeneies…) surten **desactivades**;
els espais i les zones, mai.

**Contrast amb la geometria.** Una àrea declarada que coincideix (±0,5%) amb la superfície total
d'un sòlid tancat és sospitosa: s'hi han comptat totes les cares. Es fa servir la cara més gran
—al fixture d'IngeTrazo, 4 m² en lloc de 8,4— i s'avisa; `usa[guid] = 'qto'` ho torna al valor
declarat. Un volum que difereix més d'un 2% de la geometria es manté i s'avisa. Sense volum
declarat, es pren de la geometria.

**Conjunts.** Si un element té parts (una coberta amb lloses) i no porta quantitats pròpies,
compten les parts; si en porta, les parts no hi compten. Ho va destapar `Building-Architecture`
de buildingSMART, on la coberta és buida i les lloses porten els Qto.

**Provat amb** els 35 IFC de [buildingSMART/Certification-datasets](https://github.com/buildingSMART/Certification-datasets)
(IFC2x3, IFC4 i IFC4.3): el lector els llegeix tots sense errors, en menys de 70 ms cada un. Un
d'ells es manté a `test/fixtures/bsi-building-architecture.ifc` (CC BY 4.0, © buildingSMART
International). Molts models d'infraestructura no porten cap Qto: caldria la geometria, que només
es pot calcular per als casos de dalt.

## El quadre d'importació

`IfcImportModal` és només una vista sobre `muntaPressupost`: llista les classes (marcar-les o no,
i la unitat de cada una), el mode de capítols, les quantitats sospitoses amb la tria *Geometria /
Declarat al model* i les partides que entraran. Cada canvi recalcula el pressupost sencer. No
desa res a `localStorage`: les tries es perden en tancar.

Provat a 390 px amb emulació tàctil (sense desbordament horitzontal) i inserint el fixture
d'IngeTrazo: 15 capítols amb una partida cada un.

## Fase 3: classificacions i banc de preus

- El lector llegeix `IfcRelAssociatesClassification` (IFC4 i IFC2x3) i desa a cada element
  `classificacions: [{ sistema, codi, nom }]`: la de l'element o, si no en té, la del seu tipus
  (és com ho fa Revit) o la del conjunt del qual és part. La classificació de l'`IfcBuilding` no
  baixa als elements.
- `muntaPressupost(model, { banc, codis })` vincula cada partida a un concepte del banc si el codi de
  la classificació (o el triat a mà a `codis[clau]`) hi és; la coincidència admet majúscules
  diferents. La partida en pren **codi, resum, unitat i preu**, i no es torna a posar a
  `prices` (el preu del projecte mana). `detall` diu què s'ha vinculat i amb quin codi.
- **Unitat del banc**: si el concepte amida en una altra unitat, s'hi passa només si tots els
  elements en tenen la quantitat (un mur amb àrea però sense volum no es pot posar en m³: es queda
  en la seva i s'avisa).
- Dues partides al mateix concepte es fusionen, però només si s'amiden en la mateixa unitat; si no,
  la segona queda amb codi propi i s'avisa.
- El concepte arrel (`root##`) mai no és un destí vàlid.
- Al quadre, cada partida porta un camp de codi amb la llista del banc; buit = sense vincle.

Provat amb una classificació sintètica al tipus (els IFC de buildingSMART només classifiquen
l'edifici) i amb el fixture d'IngeTrazo, que no en porta cap.

## Fase 4: reimportar per GlobalId

`utils/ifc/actualitza.js` + `components/IfcActualitzaModal.jsx` (triat per `IfcImportacio.jsx`).
Si el projecte ja té línies amb `linia.ifc.guid`, un IFC nou obre «Actualitza des de l'IFC» en
lloc de la importació; hi ha l'enllaç *Importa-ho com a nou* per saltar-s'ho.

| Cas | Què passa |
|---|---|
| Canvia la quantitat | S'actualitzen `units` i `length` de la línia i el seu `ifc.valor`. |
| Canvia, però la línia s'havia editat a mà o té fórmula | **Conflicte**: no es toca si no es marca *Sobreescriu*. |
| El `GlobalId` ja no és al model | Es llista; **només s'esborra** si es marca *Treu*. |
| Element nou d'un tipus que ja hi és | Línia nova a la partida on ja van els seus germans. |
| Element nou d'un tipus que no hi era | Partida nova, per `insereixNodes`, amb codis i capítols que no trepitgen els del projecte. |

- No es toca mai un preu, un descomposat, una descripció ni un vincle al banc.
- **La quantitat es recalcula en la unitat de la partida del projecte**, no en la que
  proposaria la importació: una partida vinculada al banc en m³ s'actualitza en m³. I es reutilitza
  la xifra que es va triar en importar (`ifc.origen`: Qto o geometria).
- «Editada a mà» vol dir que l'import actual de la línia ja no és `ifc.valor`, la xifra que
  va escriure la importació. Per això cada línia la desa.
- Si el model no ha canviat, una línia editada a mà **no** és cap conflicte.
- La descripció d'una línia és ara `nom · planta` també quan el nom coincideix amb la de la
  partida (abans en quedava només la planta).
- Provat a 390 px: s'importa el fixture, es torna a obrir amb el mur de 5 a 6 m² (1 canvi, 14
  iguals), s'actualitza i a la tercera obertura ja no hi ha res a fer.

## Fase 5: obrir des del sistema

- `public/manifest.json`: un `file_handlers` nou per a `.ifc` (`application/x-step`, `model/ifc`) i
  els mateixos tipus al `share_target`. El service worker no calia tocar-lo: no mira l'extensió,
  desa el fitxer amb el nom en una capçalera i `obreFitxer` decideix.
- `utils/ifc/fitxer.js`: llegeix en UTF-8 estricte i, si no hi cap, en Windows-1252 (alguns
  programes escriuen els accents en cru). **Límit de 150 MB**: el lector corre al fil principal.
- **No hi ha Web Worker**: un model gran bloqueja la pàgina mentre es llegeix. Els 35 de
  buildingSMART (fins a 140 kB) triguen menys de 70 ms; amb un model real de desenes de MB no ho
  he mesurat. Si es nota, el lector (`llegeixIfc`) és pur i es pot moure a un worker sense canvis.
- Com a la resta, una vegada instal·lada la PWA s'han de tornar a instal·lar perquè el sistema
  reconegui l'associació nova: el manifest el llegeix l'instal·lador, no la pàgina.
