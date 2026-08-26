# Sortides: impressió, PDF, Excel

Totes les sortides es llancen des de la **vista d'impressió** (`PrintView`, `App.jsx:177`),
un overlay a pantalla completa amb dos modes:

- **Amidaments** — llistat complet amb línies d'amidament i, opcionalment, descomposats.
- **Resum** — una fila per capítol amb import i %, i el quadre de totals (PEM → PEC → PVP).

## Configuració (`printConfig`)

Definit a `App.jsx:931`, editable des de `PrintConfigModal`:

| Opció | Efecte |
|---|---|
| `maxLevels` | Fins a quin nivell de subcapítols es mostra capçalera pròpia (per defecte 5) |
| `showLongDesc` | Inclou `fullDescription` sota cada concepte |
| `showMeasurements` | Mostra les línies d'amidament |
| `showBreakdown` | Mostra la taula de descomposat sota cada partida |
| `useCorrelativeCodes` | Substitueix els codis originals per numeració 1, 1.1, 1.1.2… |
| `chaptersOnNewPage` | Salt de pàgina per capítol (i, a l'Excel, **un full per capítol**) |
| `ge` / `ip` / `iva` | Despeses Generals (13%), Benefici Industrial (6%), IVA (21%) — només al Resum |

Els percentatges G.G. / B.I. / IVA **només s'apliquen al PDF de resum**
(`handleExportSummaryPDF`). La previsualització HTML del resum té el bloc de PEC/PVP
comentat al codi (`App.jsx:466`), de manera que a pantalla només es veu el PEM.

## Impressió del navegador

`window.print()` sobre el mateix HTML de `PrintView`. Els estils d'impressió estan en un
`<style>` inline al final del component (`App.jsx:497`): `@page { size: A4; margin: 1.5cm }`,
`page-break-inside: avoid` a les files, i `break-before: page` per als capítols.

## PDF d'amidaments — `handleExportPDF` (`App.jsx:1094`)

jsPDF + `jspdf-autotable`. L'arbre s'aplana amb `flattenBudget` a files tipades
(`chapter`, `item`, `item-long-desc`, `measurement`, `item-total`, `chapter-total`) i el hook
`didParseCell` aplica l'estil segons el tipus. `didDrawPage` pinta capçalera, títol del
projecte, data i número de pàgina.

Amb `chaptersOnNewPage` es genera una taula independent per capítol, cadascuna en una pàgina.

> **Bug obert.** La crida a `flattenBudget` (`App.jsx:1100`) passa vuit arguments a una
> funció que n'accepta sis, i `priceDatabase` acaba en la posició equivocada. Veure
> `docs/estat-actual.md` § 1.

## PDF de resum — `handleExportSummaryPDF` (`App.jsx:1231`)

Una fila per capítol de primer nivell, i després el quadre de totals dibuixat a mà amb
`drawTotalLine`. Tanca amb l'import en lletres via `numberToTextCatalan` (`App.jsx:72`),
que cobreix fins a milions i escriu en majúscules ("CENT VINT-I-TRES MIL … EUROS AMB … CÈNTIMS").

## Excel — `handleExportXLSX` (`App.jsx:1334`)

SheetJS. La particularitat és que **no escriu valors calculats sinó fórmules**, de manera que
el full es pot seguir editant:

- parcial de cada línia: `=C{n}*D{n}*E{n}*F{n}`
- quantitat de la partida: `=ROUND(SUM(G{inici}:G{fi}), 2)`
- import: `=ROUND(H{n}*I{n}, 2)`

Amb `chaptersOnNewPage` activat es genera un full "Resum" més un full per capítol
(nom del full = codi del capítol, retallat a 31 caràcters i sanejat).

## Consistència de preus a les sortides

Aquest és el punt a vigilar quan es toca qualsevol exportació. `calcChapterTotal` i
`calcItemTotalAmount` accepten `priceDatabase` com a segon paràmetre, i **si no se'ls passa
cauen a `node.price`**, que pot estar desfasat respecte del banc de preus.

Ara mateix el passen:

- `flattenBudget` i `renderPrintNode` (línies 129 i 195) ✔

I **no** el passen:

- la taula de resum de `PrintView` (`App.jsx:435`),
- el PDF de resum (`App.jsx:1243`),
- l'Excel (`App.jsx:1345`, `1397`),
- la taula principal de l'editor (`App.jsx:3239`, `3202`, `4092`).

Mentre `node.price` i `priceDatabase` coincideixin no es nota. Es noten quan s'edita un preu
al banc de preus o s'aplica un ajust de PEM. Veure `docs/estat-actual.md` § 3.
