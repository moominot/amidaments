# Certificacions d'obra

L'aplicació té dos modes, commutats des del capçal (`appMode`):

- **`budget`** — edició del pressupost (amidaments previstos, preus, descomposats).
- **`certification`** — estat d'execució: quant s'ha fet realment de cada partida, per fases.

En mode certificació la taula principal canvia de columnes i el capçal mostra
**Total Certificat** en comptes de **Total PEM**.

## Model mental (estil Presto)

Una **certificació** (o *fase*) és una foto de l'obra en una data. Cada partida hi té una
quantitat executada. Dues maneres d'introduir-la, per fase:

El valor desat és **sempre l'acumulat a origen**. El mètode només tria quin dels dos camps
del panell es destaca:

| `method` | Camp destacat | Què es desa en escriure-hi |
|---|---|---|
| `origin` (per defecte) | «A origen» | el valor tal qual |
| `partial` | «Del període» | `anterior + el que has escrit` |

Tots dos camps són editables en qualsevol moment: escrius en el que et vagi bé i l'altre es
recalcula. Com que el que es desa no canvia, **commutar el mètode no altera cap import**.

La UI sempre mostra les tres xifres: **Anterior**, **Actual** (període) i **Origen** (acumulat),
amb el percentatge sobre la quantitat pressupostada.

> Abans de `schemaVersion: 2` el mètode canviava el significat del que hi havia desat i, en
> commutar-lo, l'import certificat es movia sol. Ara ja no: veure `docs/estat-actual.md` §22.

## Recorregut per la UI

1. **Barra de certificacions** (`CertificationBar`, visible només en mode certificació):
   pestanyes de fases, botó "Nova", commutador `A ORIGEN` / `PARCIAL` i botó **Aprovar FASE**.
2. **Resum en viu** (`CertificationSummary`), just a sota: el percentatge certificat a origen
   com a xifra principal, un mesurador amb l'anterior i el període sobre el pressupost, i les
   xifres d'anterior / període / pendent. Es recalcula a cada canvi, de manera que el
   percentatge total es veu mentre s'introdueixen amidaments. Vegeu més avall.
3. **Taula principal**: per cada partida, Previst / Ant.% / Act.% / Cert. Origen / % / Import.
   Els **capítols** també mostren els seus percentatges, calculats sobre l'import (no sobre la
   quantitat: barrejar m², kg i unitats no tindria sentit).
4. **Sidebar** (`CertificationSidebar`), en seleccionar una partida:
   - resum Anterior / Actual / Origen,
   - import certificat (a origen o del període, segons el mètode),
   - accions ràpides **25% / 50% / 100%**,
   - **Copiar Amidament Pressupost** (clona les línies del pressupost a la fase),
   - camp de **percentatge** i camp de **quantitat manual**,
   - **detall d'amidament de la certificació** (mateixes columnes Ud/Ll/Am/Al que el pressupost).

## El resum de certificació

Dues vistes que surten del **mateix càlcul**, `buildCertificationSummary`
(`src/utils/calculations.js`), de manera que no poden divergir:

- **La barra en viu** (`CertificationSummary`) — sempre visible mentre es treballa.
- **El detall per capítols** (`CertificationSummaryModal`) — s'obre amb el botó **Detall** de
  la barra, o clicant el total del capçal. Una fila per capítol amb pressupost, anterior,
  període, origen, % i pendent, i un mesurador per fila per comparar l'avenç d'un cop d'ull.

`buildCertificationSummary(chapters, certId, priceDatabase, certifications)` retorna
`{ rows, totals, prevCertId }`, on cada fila i el total porten:

| Camp | Significat |
|---|---|
| `budget` | import pressupostat del capítol (PEM) |
| `previous` | certificat a origen de la fase anterior |
| `period` | `origin − previous`, el que aporta aquesta fase |
| `origin` | certificat acumulat a origen |
| `pending` | `budget − origin` |
| `originPct`, `previousPct`, `periodPct` | percentatges sobre `budget` |

Es compleix sempre que `previous + period = origin` i `origin + pending = budget`.

Els percentatges passen per `safePct`, que retorna 0 quan la base és 0: un capítol sense
import (o un projecte buit) no ha de produir `NaN` ni `Infinity` a la UI.

**El mesurador** és d'un sol to, verd maragda, amb la rampa monòtona clar → fosc: pista
(pendent) → període → anterior. Els dos trams van separats per 2 px perquè es llegeixin com a
dos, i cada etiqueta duu el seu quadret de color, així que la identitat no depèn només del
color. Si el certificat supera el 100%, el tram es satura però la xifra segueix mostrant el
valor real i passa a color ambre.

Els imports són sempre **PEM**: no hi entren despeses generals, benefici industrial ni IVA.
Aquests només s'apliquen al PDF.

## El PDF de certificació

S'hi arriba de dues maneres, totes dues al mateix lloc: el botó **Imprimir** del capçal —que
segueix el mode actiu, de manera que en certificació porta al document de la fase i no al
pressupost— i el botó **Detall** de la barra de resum. D'allà, **Exporta PDF**.

El genera `exportCertificationPDF` (`src/utils/certificationPdf.js`). Estructura:

1. **Resum per capítols** — pressupost, anterior, període, origen, % i pendent, amb totals.
2. **Quadre de liquidació** del període.
3. **Import a certificar en lletres** (`numberToTextCatalan`, a `src/utils/numberToText.js`).
4. **Signatures**: propietat, direcció facultativa i empresa constructora.
5. **Detall per partides**, opcional, a partir de pàgina nova: previst, anterior, període,
   origen, % i import de cada partida, amb els capítols com a separadors.

### Com es liquida

Els percentatges **s'apliquen sobre l'import del període**, que és el que es factura:

```
IMPORT D'AQUESTA CERTIFICACIÓ (PEM) = origen − anterior
  + G.G. %   sobre el període
  + B.I. %   sobre el període
  = P.E.C.
  + I.V.A. % sobre el P.E.C.
  = TOTAL A CERTIFICAR
```

Com que són percentatges lineals, això dona el mateix que restar la cascada a origen menys
la cascada anterior, i evita arrossegar diferències d'arrodoniment entre fases.

Els tres percentatges surten de `printConfig`, el mateix objecte que fa servir el pressupost,
i es poden activar i ajustar des del mateix peu del modal. Si estan tots desactivats, el total
a certificar és el PEM del període.

### Noms de fitxer

Passen per `safeFileName` (`src/utils/fileName.js`), que **translitera els accents**. No és
cosmètic: Chromium descarta l'atribut `download` sencer si porta caràcters no ASCII i desa el
fitxer com a `download`, sense extensió. Amb noms de projecte en català passava sempre. Ho fan
servir totes les exportacions de l'aplicació, no només aquesta.

## Aprovació i bloqueig

`approveCertification(certId)` posa `approved: true`. A partir d'aquí `CertificationSidebar`
amaga tots els controls d'edició i mostra un cartell de fase bloquejada.

**El bloqueig és només visual.** No hi ha cap comprovació d'`approved` a `useCertification.js`:
qualsevol crida a `updateCertificationQty`, `addCertificationLine`, etc. modificarà una fase
aprovada sense queixar-se. Tampoc hi ha manera de desaprovar-la des de la UI (cal editar el
JSON). Si es vol un bloqueig real, el lloc és el hook, no el component.

## Precedència: quantitat manual vs detall

`node.certifications[certId]` pot tenir `quantity` i/o `measurements`:

- si `measurements` té línies → es calcula a partir d'elles i s'ignora `quantity`;
- si no → s'usa `quantity`.

`updateCertificationQty` (i per tant els botons 25/50/100% i el camp de percentatge)
**buida `measurements`** en escriure una quantitat manual. És deliberat, i la UI ho indica
amb la nota "El valor manual preval sobre el detall d'amidament".

## Relació amb BC3

Les certificacions viatgen en BC3 com a **fases**:

- a l'exportació, cada certificació genera un `~F|<n>|<data>|<nom>`, i les seves línies
  d'amidament s'escriuen dins del `~M` amb el número de fase al primer camp de cada bloc;
- a la importació, cada `~F` es converteix en un objecte `Certification` dins de `phases`,
  i les línies `~M` amb fase > 0 van a `node.certifications[<id de la fase>]`.

> **Bug conegut:** el pont entre `phases` (el que retorna el parser) i `budget.certifications`
> (el que espera l'aplicació) no està connectat. Veure `docs/estat-actual.md` § 2.

## On és cada cosa

| Peça | Fitxer |
|---|---|
| Càlcul de quantitats i imports certificats | `src/utils/calculations.js` |
| Mutacions d'estat (qty, línies, %, aprovar, mètode) | `src/hooks/useCertification.js` |
| Barra de fases | `src/components/Certification/CertificationBar.jsx` |
| Panell de detall | `src/components/Certification/CertificationSidebar.jsx` |
| Resum (càlcul) | `buildCertificationSummary` a `src/utils/calculations.js` |
| Resum en viu | `src/components/Certification/CertificationSummary.jsx` |
| Detall per capítols | `src/components/Certification/CertificationSummaryModal.jsx` |
| PDF de certificació | `src/utils/certificationPdf.js` |
| Files del detall per partides | `buildCertificationDetail` a `src/utils/calculations.js` |
| Import en lletres | `src/utils/numberToText.js` |
| Noms de fitxer segurs | `src/utils/fileName.js` |
| Creació de fases, `activeCertId`, `certifiedTotal` | `src/App.jsx` |
| Columnes de la taula en mode certificació | `renderTableRows`, a `src/App.jsx` |
