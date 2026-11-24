# Importació d'IFC

Estat: **fases 1 i 2**. Un `.ifc` obert per qualsevol camí (selector, arrossegament) passa per
`obreFitxer`, que obre `components/IfcImportModal.jsx`; el que s'hi accepta s'insereix pel flux
d'`insereixNodes`, a l'arrel i a preu 0. Falten la vinculació amb preus, la reimportació i el
manifest/service worker (fases 3 a 5).

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
