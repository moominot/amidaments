# Càlculs

Totes les funcions pures viuen a `src/utils/calculations.js`. Són l'únic lloc del projecte
sense JSX ni estat, i per tant el lloc natural per afegir-hi tests.

## Arrodoniment

```js
round2(v) = Math.round((v + Number.EPSILON) * 100) / 100
```

S'aplica de manera **agressiva i en cascada**: cada parcial, cada línia de descomposat i cada
subtotal s'arrodoneixen a 2 decimals abans de sumar-se. Això imita el comportament dels
programes de pressupostos (Presto, Arquímedes) i és intencionat, però vol dir que
`suma(arrodonits) ≠ arrodonit(suma)`. No "optimitzis" traient els `round2` intermedis:
canviarà els totals respecte del que espera un aparellador.

## Quantitat d'una partida — `calcItemTotalQty(item)`

```
subtotal   = Σ (units × length × width × height)   sobre línies amb isIncrement != true
increments = Σ (subtotal × units/100)              sobre línies amb isIncrement === true
total      = round2(subtotal + increments)
```

Sense línies d'amidament, retorna `0` (no `1`).

## Preu unitari — `getItemUnitPrice(item, priceDatabase)`

Dos camins:

**1. Amb descomposat** (`item.breakdown.length > 0`):

```
base = Σ round2( preu(línia) × yield )        només línies NO percentuals
preu = round2( Σ per cada línia:
          si percentual → round2( base × (yield/100 si és realment %, si no yield) )
          si no         → round2( preu(línia) × yield ) )
```

on `preu(línia)` = `priceDatabase[normalizeCode(line.code)]?.price` si existeix, si no `line.price`.

**2. Sense descomposat**: `priceDatabase[normalizeCode(item.code)]?.price ?? item.price ?? 0`.

> **La BD de preus mana.** Si un codi existeix a `priceDatabase`, el `price` guardat al node
> s'ignora. `node.price` només és un fallback (i el que s'exporta a BC3).

## Import d'una partida — `calcItemTotalAmount(item, priceDatabase)`

```
total = calcItemTotalQty × getItemUnitPrice
si item.unit === '%' i no té descomposat → total / 100
```

El cas especial de `unit === '%'` cobreix partides alçades expressades com a percentatge
del capítol.

## Import d'un capítol — `calcChapterTotal(chapter, priceDatabase)`

Suma recursiva de `items` + `subChapters`. **No aplica `round2` al resultat final**
(a diferència de `calcChapterCertifiedTotal`, que sí).

## PEM

`budgetTotal` (`App.jsx:1085`) = `Σ calcChapterTotal(cap, priceDatabase)` sobre `budget.chapters`.
És la xifra del capçal i la base de tots els percentatges.

## Certificat — `calcItemCertifiedQty(item, certId, certifications)`

Primer resol la quantitat d'una fase concreta:

```
si node.certifications[certId].measurements té línies → es calcula com un amidament normal
si no                                                 → s'usa node.certifications[certId].quantity
```

Després, segons el `method` de la fase:

- **`origin`**: retorna directament la quantitat de `certId`. És l'acumulat.
- **`partial`**: suma les quantitats de totes les fases des de l'índex 0 fins a l'índex de `certId`.

Derivats a la UI (`CertificationSidebar`, `renderTableRows`):

```
originQty = calcItemCertifiedQty(node, activeCertId, certs)
prevQty   = calcItemCertifiedQty(node, getPreviousCertId(certs, activeCertId), certs)
actQty    = round2(originQty - prevQty)      // quantitat del període
```

`calcItemCertifiedAmount` i `calcChapterCertifiedTotal` són els equivalents en import, amb la
mateixa excepció de `unit === '%'`.

## Introducció per percentatge

`updateCertificationPercentage` (`useCertification.js`) converteix el % a quantitat i crida
`updateCertificationQty`:

```
qty = round2( calcItemTotalQty(node) × percentatge / 100 )
```

`updateCertificationQty` **esborra el detall d'amidament** de la fase (`measurements: []`).
És deliberat: la quantitat manual preval sobre el detall, i la UI ho avisa. Si algú introdueix
un percentatge i després vol el detall, l'ha de tornar a crear.

## Ajust global de PEM — `adjustPem(targetTotal)` (`App.jsx:1653`)

```
factor = targetTotal / budgetTotal
```

S'aplica multiplicant:
- tots els `price` de `priceDatabase` amb codi que **no contingui `%`**,
- els `node.price` de totes les partides,
- els `breakdown[].price` amb codi que no contingui `%`.

És **destructiu i no reversible**: no es guarda ni el factor ni els preus originals.
Aplicar-lo dos cops multiplica els factors. Els percentatges es respecten perquè es
recalculen sobre la nova base.

## Agregació de recursos — `aggregatedResources` (`App.jsx:1461`)

Recorre l'arbre, i per cada partida amb quantitat > 0 explota el seu descomposat
multiplicant els rendiments per la quantitat de la partida. Si un component del descomposat
té al seu torn un `breakdown` a `priceDatabase`, hi baixa recursivament (preus descompostos
de segon nivell). Agrupa el resultat en `material` / `labor` / `machinery` / `others`.

Diferència important amb `calcItemTotalQty`: aquí la quantitat de la partida es calcula
**sense aplicar les línies d'increment** (`calculateNodeQty`, `App.jsx:1465`). Per a partides
amb `isIncrement` el llistat de recursos quedarà per sota del pressupost.
