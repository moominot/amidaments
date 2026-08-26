# Model de dades

Tot l'estat de l'aplicació són **dos objectes** al `useState` d'`App`: `budget` i `priceDatabase`.
No hi ha esquema ni validació: el que arriba del parser BC3 o d'un JSON desat s'accepta tal qual.

## `budget`

```js
{
  id: "uuid",
  name: "Reforma Esporles",
  chapters: [ Node, ... ],          // arrel de l'arbre
  certifications: [ Certification, ... ]   // llista ORDENADA de fases
}
```

L'ordre de `certifications` és semànticament rellevant: defineix què és "l'anterior"
(`getPreviousCertId`) i, en mètode `partial`, quines fases s'acumulen.

## `Node` — capítol o partida

Un mateix tipus serveix per als dos. **El discriminador és `unit`**:

- `node.unit` amb valor → **partida** (fulla amidable)
- `node.unit` buit / `null` → **capítol** o subcapítol

Aquesta convenció (`!node.unit === isChapter`) apareix literalment a tot el codi. Si mai
s'introdueix un tipus explícit, s'ha de canviar en desenes de llocs.

```js
{
  id: "uuid",                    // clau de React i de totes les mutacions
  code: "RE02.08",               // codi original (pot dur '#' final en capítols BC3)
  description: "Demolició de fàbrica de bloc…",   // resum d'una línia
  fullDescription: "Demolició amb compressor…",   // text llarg (~T del BC3)
  unit: "m2",                    // '' o null en capítols
  price: 17.27,                  // preu unitari "congelat"; el viu és a priceDatabase

  breakdown: [ BreakdownLine, ... ],   // descomposat (justificació de preu)
  measurements: [ Measurement, ... ],  // línies d'amidament del pressupost

  subChapters: [ Node, ... ],    // fills capítol
  items: [ Node, ... ],          // fills partida

  certifications: {              // MAPA per id de certificació (no llista!)
    "<certId>": { quantity: Number, measurements: [ Measurement, ... ] }
  }
}
```

> **Atenció al nom repetit.** `budget.certifications` és un **array** de fases.
> `node.certifications` és un **objecte** indexat per `certId`. Confondre'ls és una font
> real de bugs al repositori (veure `docs/estat-actual.md`).

Els fills es guarden en dues llistes separades i gairebé sempre es recorren com
`[...(node.subChapters || []), ...(node.items || [])]`, cosa que fa que els subcapítols
sempre surtin abans que les partides germanes, independentment de l'ordre d'inserció.

## `Measurement` — línia d'amidament

```js
{
  id: "uuid",
  description: "sala estar",
  units: 1,        // Ud
  length: 4,       // Ll
  width: 1,        // Am
  height: 3.14,    // Al
  isIncrement: false   // si true, `units` és un % sobre el subtotal de les línies normals
}
```

Parcial = `units × length × width × height`, arrodonit a 2 decimals (`calcMeasureTotal`).
Els valors buits es tracten com **1** per a Ll/Am/Al i com **0** per a Ud, de manera que una
línia `{units: 5}` val 5.

Les línies amb `isIncrement: true` (creades per `addIncrementLine`) representen un percentatge
d'increment: `subtotal_línies_normals × units / 100`. S'apliquen sempre després de sumar
totes les línies normals.

### Línies vinculades

Una línia pot prendre l'amidament d'una altra partida en comptes de tenir dimensions pròpies:

```js
{ id: "uuid", description: "Igual que la solera", refCode: "SOLERA", factor: 1 }
```

El seu parcial és `factor × quantitat(partida amb aquest codi)`. El cas típic és una terrassa,
on solera, formació de pendents, impermeabilització, aïllant i paviment comparteixen superfície:
s'entra un cop i les altres hi apunten. El `factor` cobreix les proporcions (dues capes = 2).

`node.measurements` desa el **vincle**, no el valor. La resolució la fa
`utils/measurementRefs.js` abans de calcular res, i és el que fa que la resta de
`calculations.js` no s'hagi d'assabentar de l'existència dels vincles. Veure
`docs/arquitectura.md`.

## `BreakdownLine` — component del descomposat

```js
{
  code: "mo001",              // el prefix determina la categoria
  description: "Oficial 1a",
  unit: "h",
  yield: 0.35,                // rendiment
  price: 21.4,                // preu de la línia; priceDatabase té preferència
  total: 7.49                 // informatiu, no és font de veritat
}
```

Categoria segons `getComponentCategory(code)`:

| Prefix / patró | Categoria | Ús |
|---|---|---|
| `mo…` | `labor` | Mà d'obra |
| `mt…`, `mq…` | `material` | Materials (i maquinària, si `mq`, al llistat de recursos) |
| conté `%` | `percent` | Costos indirectes; s'apliquen sobre la base de la resta |
| altres | `directCost` | Cost directe |

Les línies `percent` es calculen sobre la suma de totes les línies **no percentuals** del
mateix descomposat. Es divideix per 100 només si la unitat és realment `%`
(unitat de la BD de preus, unitat de la línia, o codi literal `%`).

## `priceDatabase`

```js
{
  "<codiNormalitzat>": {
    code: "RE02.08",     // codi original, amb '#' si en tenia
    price: 17.27,
    summary: "Demolició de fàbrica…",
    unit: "m2",
    breakdown: [ BreakdownLine, ... ]   // opcional; el parser BC3 NO l'omple
  }
}
```

La clau és `normalizeCode(code)` = codi sense espais i sense `#` finals. Aquest és el
banc de preus viu del projecte: **`getItemUnitPrice` sempre prefereix `priceDatabase[code].price`
per sobre de `node.price`** quan existeix.

## `Certification` — fase d'obra

```js
{
  id: "1738972800000",     // Date.now() si es crea a la UI; crypto.randomUUID() si ve d'un ~F del BC3
  name: "Certificació 1",
  date: "2026-02-08",      // YYYY-MM-DD; encapçala el PDF i va al ~F del BC3
  approved: false,         // true = bloquejada (comprovat al hook, no només a la UI)
  method: "origin" | "partial"   // només preferència d'entrada
}
```

El projecte porta `schemaVersion` per saber quines migracions cal aplicar
(`utils/migrateBudget.js`). S'hi passa qualsevol projecte que arribi de fora: `localStorage`,
JSON de disc, Drive, biblioteca i importació BC3.

El valor desat a `node.certifications[certId]` és **sempre l'acumulat a origen**. El `method`
només decideix **per quin camp s'introdueix** la xifra al panell, no què val:

- **`origin`**: es destaca el camp «A origen».
- **`partial`**: es destaca el camp «Del període»; en escriure-hi, es desa `anterior + període`.

Tots dos camps són editables sempre, de manera que es pot passar d'un valor a l'altre sense
cap risc, i **commutar el mètode no altera cap import**.

> Fins a `schemaVersion: 2` no era així: el valor desat significava una cosa o una altra
> segons el `method`, i commutar-lo reinterpretava les dades — 30 i 40 valien 700 € en parcial
> i 400 € en origen, sense esborrar res i sense avisar. `utils/migrateBudget.js` converteix els
> projectes antics una sola vegada, conservant els totals.

## Fitxer de projecte `.json`

El que produeixen "Desar JSON" i "Desar a Drive":

```js
{
  budget: { ... },
  priceDatabase: { ... },
  exportDate: "2026-08-26T…",
  version: "1.0"
}
```

En obrir-lo només es comprova que existeixin `budget` i `priceDatabase`
(`App.jsx:2208`). No hi ha migració de versions.
