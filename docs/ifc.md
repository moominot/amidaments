# Importació d'IFC

Estat: **fase 1** (lectura de les quantitats declarades). Encara no hi ha UI ni inserció al
pressupost.

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
