# Tests

```bash
npm test          # una passada
npm run test:watch
```

**Vitest**, 297 tests en setze fitxers, poc més d'un segon. `vitest.config.js` és a part de
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
| `formules.test.js` | Sintaxi de les fórmules, errors, paràmetres amb cicles i en cadena, línies amb fórmula (una dimensió a 0 val 0), vincles sobre fórmules, reanomenar, comparacions i lògica, límits i condicions dels paràmetres |
| `sistemes.test.js` | Un sistema de prova (un mur genèric) amb les xifres fetes a mà; línia de zona de cada instància (no canvia cap quantitat, no es copia en extreure, es treu amb la instància); esquema del document a la instància i de tornada, i què es descarta; crear un sistema d'un projecte, inserir-lo (reanomenar, enllaçar, respostes amb fórmula, vincles), filtrar, extreure i treure instàncies, condicions, ometre les partides a zero i el cicle BC3 ×3 amb fórmules |
| `assistent.test.js` | Lectura de la navegació i les fitxes de CYPE, els camps de la petició i el cost de cada model, validació dels inputs, les eines d'edició (quantitats, descomposat, errors de fórmula, condicions) i la importació d'una partida de CYPE amb `cype-pilar.bc3` (fusió de capítols, preus del projecte que manen). La xarxa s'injecta |
| `adjunts.test.js` | Imatges i PDF de l'assistent: la mida a què es redueixen les imatges (2576 px, 3,75 MP), el contingut del missatge (adjunts davant del text) i els límits d'imatges i de pes de tota la conversa |
| `traduccio.test.js` | Traducció contra el BC3 de referència amb una «traducció» que marca els textos: arriba a descripcions, textos llargs, descomposat i base de preus; el PEM, els codis i les quantitats no es mouen; només l'abast triat |
| `plantilles.test.js` | Rendiments amb fórmula (el preu segueix els paràmetres: 35,02 → 28,84 €/m fet a mà; error a 0; BC3 amb el preu i el rendiment calculats). Títols i descripcions amb variables: números i `si()` amb textos, errors, reanomenar, dins d'un sistema (es demanen, es reanomenen en inserir i tornen en extreure), BC3 i porta-retalls amb el text omplert |
| `cadSistemes.test.js` | Del CAD a un sistema, amb un porta-retalls v2 fet a mà (tres sales, una amb dues polilínies i una trama amb illa): rètols i nom de sala, zones per rètol, capa, entitat o totes, inserció d'una instància per sala amb les partides compartides (64,75 m² i 63 m fets a mà), i el vincle que actualitza els paràmetres amb el dibuix modificat |
| `cad.test.js` | El text del LISP `AMIDA` i què en surt segons la unitat (m2, m, ud, m3). Sense fitxer real: el text el genera el LISP |

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
