# Tests

```bash
npm test          # una passada
npm run test:watch
```

**Vitest**, 113 tests en set fitxers, poc més d'un segon. `vitest.config.js` és a part de
`vite.config.js` a posta: els tests són tots de lògica de càlcul i no munten cap component, de
manera que no els cal ni el plugin de React ni l'entorn de navegador.

El desplegament (`.github/workflows/deploy.yml`) passa `npm run lint` i `npm test` abans de
construir, de manera que una regressió no arriba a GitHub Pages.

## Contra fitxers de veritat

No hi ha maquetes. Els tests treballen amb tres BC3 reals:

| Fitxer | Què és | Per a què serveix |
|---|---|---|
| `REFORMA ESPORLES_MEDICIONES_AJUSTADO.bc3` (arrel) | Export de Presto 8.7 | PEM 135.202,54 €, 24 capítols, 248 partides |
| `test/fixtures/cype-demolicio.bc3` | CYPE `DCE010` | Residus per components addicionals |
| `test/fixtures/cype-pilar.bc3` | CYPE `EHS010` | Residus de col·locació i embalatge, i petjada de carboni |

**Les xifres que hi ha fixades es van contrastar a mà contra el fitxer**, aplicant les fórmules
de la norma, abans d'escriure el codi que les calcula. Si en toques cap, para't a pensar si el
que has canviat és correcte abans de moure el número esperat.

## Què cobreix cada fitxer

| Fitxer | Cobreix |
|---|---|
| `calculations.test.js` | `round2` a cada pas, línies de percentatge, precedència de `priceDatabase`, certificat sempre a origen |
| `bc3.test.js` | El cicle importar → exportar → reimportar ×3, la forma del `~V` i el `~M`, les certificacions com a fitxer propi, els fitxers antics |
| `residus.test.js` | Les dues menes de component del `~R`, l'agregació, els llindars del RD 105/2008 |
| `petjada.test.js` | `ce` i `eCO2` a la base de preus, el càlcul i el cicle |
| `vincles.test.js` | Amidaments vinculats: a la partida, a una línia, factor, cicles, cadenes |
| `certificacions.test.js` | Anterior, període i origen; el període és una resta, no una dada |
| `projecte.test.js` | El fitxer `.amid`, `safeFileName` i la migració d'esquema |

## Per què aquests i no uns altres

Cada test fixa un comportament **que s'ha trencat de veritat alguna vegada**. Els comentaris
remeten al § del registre de `docs/estat-actual.md`. Els casos que més s'hi repeteixen:

- **`round2` a cada pas intermedi.** És deliberat i imita Presto. Treure'l «per netedat»
  canviaria tots els totals: hi ha un test que compara les dues maneres.
- **`priceDatabase` mana sobre `node.price`.** Passar-la no és opcional, i oblidar-se'n ha
  estat l'origen de tres defectes.
- **El cicle d'exportació, tres vegades.** Amb una sola volta no s'hi veuen ni la duplicació
  de l'embalatge (§31) ni la deriva dels preus (§25).
- **Comprovar només les quantitats no basta.** Els defectes §25 i §26 les deixaven intactes
  mentre el PEM es triplicava i els capítols es reordenaven.

## Què no cobreixen

- **Els components de React.** No hi ha cap test de UI; el que s'ha fet aquesta sessió s'ha
  verificat conduint el navegador de veritat amb Playwright, cosa que no queda al repositori.
  El dia que calgui, la manera d'afegir-los és posar `environment: 'jsdom'` i el plugin de
  React a `vitest.config.js`, no barrejar-ho amb la configuració de la construcció.
- **Els PDF.** Es van comprovar llegint-ne el text i la geometria amb pdfjs, però `jsPDF`
  necessita canvas i afegiria una dependència pesant només per a això.
- **Google Drive.** Tot és crida de xarxa i OAuth.
