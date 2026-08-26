# Format BC3 (FIEBDC-3)

BC3 és el format estàndard d'intercanvi de bases de preus i pressupostos a Espanya. És text
pla en **Windows-1252**, amb registres separats per `~` i camps per `|`. Dins d'un camp, les
subllistes es separen per `\`.

## Registres que l'aplicació entén

| Registre | Nom | Importació (`bc3Parser.js`) | Exportació (`generateBC3`) |
|---|---|---|---|
| `~V` | Versió / propietat | ignorat | escrit: `~V\|FIEBDC-3/2016\|PreuArq BIM\|ANSI` |
| `~K` | Coeficients | ignorat | escrit amb valors fixos |
| `~C` | Concepte (codi, ud, resum, preu) | ✔ | ✔ |
| `~D` | Descomposició (pare → fills) | ✔ | ✔ |
| `~T` | Text descriptiu llarg | ✔ | ✔ |
| `~M` | Línies d'amidament | ✔ (amb heurística) | ✔ |
| `~F` | **Document adjunt** (no fases) | llegit com a fase — **no conforme** | escrit com a fase — **no conforme** |
| `~Q` | — | — | ja no s'escriu (veure avís) |
| `~L`, `~P`, `~W`, `~A`, `~G`, `~E`, `~O` | plecs, paramètrics, entitats… | no suportats | no s'escriuen |

> **El `~Q` existeix, però és el registre de PLECS DE CONDICIONS**, no de quantitats:
> `~Q | <CODI_CONCEPTE\> | {CODI_SECCIO_PLEC \ CODI_PARAGRAF \ {AMBIT;}\} |`.
> L'exportador n'escrivia `~Q|codi|quantitat|fase`, que un altre programa hauria intentat
> llegir com a assignació de plecs. S'ha eliminat. El total autoritzat viu al camp
> **MEDICION_TOTAL** del `~M`.
>
> Verificat contra
> [l'especificació oficial FIEBDC-3/2020](https://www.fiebdc.es/web2/datos/uploads/Standard-exchange-format-FIEBDC-3-2020v2_eng-.pdf).

> **Les certificacions no es transmeten com a fases dins d'un fitxer.** Segons la norma, una
> certificació és **un fitxer BC3 sencer i independent**, idèntic en estructura a un pressupost,
> que es distingeix pel registre `~V`: `INFORMATION TYPE = 3` (*actual cost*) més
> `CERTIFICATION NUMBER` i `CERTIFICATION DATE`. La convenció de nom és la del pressupost
> més `#certification NNNN`.
>
> El que fa aquesta aplicació —declarar fases amb `~F` i posar el número de fase al primer
> subcamp de cada línia de `~M`— **no és conforme**, i a més xoca amb dos usos reals:
> `~F` és el registre de **documents adjunts** (`~F | CODI_CONCEPTE | {TIPUS\FITXER.EXT;}...`)
> i el primer subcamp de la línia de `~M` és **TYPE**, on «1» vol dir subtotal parcial i «2»
> subtotal acumulat. Un altre programa llegiria les nostres línies de certificació com a files
> de subtotal.
>
> Funciona per al cicle intern d'aquesta aplicació (exportar i reimportar aquí conserva
> quantitats i fases) però no per intercanviar amb Presto o Arquímedes. Veure
> `docs/estat-actual.md` §24.

## Importació

`processBC3Data(text)` (`src/utils/bc3Parser.js`) retorna:

```js
{
  name: "…",        // descripció del concepte arrel (el que porta '##')
  chapters: [Node], // arbre construït recursivament amb buildTree()
  phases: [Certification],
  prices: { … }     // priceDatabase
}
```

### Com es construeix l'arbre

1. Es recullen tots els `~C` a `concepts` (clau = codi normalitzat, sense `#`).
2. Es recullen totes les `~D` a `relations` (pare → `[{child, factor, yield}]`).
3. L'**arrel** és tot concepte que no aparegui com a fill de ningú. Si el node arrel té `##`
   al codi (convenció FIEBDC per al concepte de projecte), s'aplana: els seus fills passen a
   ser els capítols de primer nivell i la seva descripció passa a ser el nom del projecte.
4. `buildTree` baixa recursivament, amb un `Set` d'anti-cicles. Per a cada concepte:
   - si té `unit` → es tracta com a **partida**, i els fills de la `~D` van a `breakdown`;
   - si no en té → **capítol**, i els fills es reparteixen entre `subChapters` (sense unitat)
     i `items` (amb unitat).
   - els conceptes amb unitat `%` s'exclouen dels fills (només queden al descomposat).
5. Si una partida no té descomposat però sí preu, se li fabrica una línia
   `pa<codi>` amb rendiment 1 (partida alçada).

### Estructura del registre `~M`

```
~M | PARE\FILL | POSICIO | MEDICIO_TOTAL | {TIPUS\COMENTARI\U\L\A\H\}... | ETIQUETA
```

El camp 2, **MEDICION_TOTAL**, és el total que declara el fitxer, i és el valor autoritzat:
qui el llegeix no l'hauria de deduir sumant línies.

### Heurística de les línies `~M`

És la part més fràgil del parser i la que més esforç hi té posat. El problema: `~M` pot
venir amb blocs de 5, 6 o 7 camps segons el programa que l'ha generat, i el camp de fase
pot existir o no.

**Xarxa de seguretat:** després de llegir les línies, se'n compara la suma amb el
MEDICION_TOTAL declarat. Si no quadren (tolerància de 0,02), es descarten les línies llegides
i es deixa una sola línia «Amidament total (segons BC3)» amb el valor del fitxer, de manera que
la quantitat importada sempre reprodueix el PEM del document d'origen. Només s'aplica als
registres sense fases: amb fases, el MEDICION_TOTAL no diu a quina correspon.

Sobre el fitxer de mostra els 144 registres quadren, o sigui que la heurística hi funciona i
la xarxa no arriba a saltar.

`bc3Parser.js:80-160`:

1. Dels camps 1..4 del registre, tria el que sembla contenir les línies: cal com a mínim
   4 barres `\`, i es puntua més el que tingui una llargada múltiple de 5, 6 o 7.
2. Per determinar el pas (`step`), prova 5, 6 i 7 i puntua **quants dels camps que haurien de
   ser numèrics (Ud, Ll, Am, Al) realment ho són**, penalitzant fort (−10) trobar text on
   toca un número. Guanya la puntuació més alta, amb 6 com a desempat.
3. Amb `step === 7` s'assumeix que el primer camp del bloc és la **fase** (`offset = 1`).
4. Les línies amb `units === 0` i sense descripció es descarten; les que tenen descripció es
   conserven (són títols/subtotals dins l'amidament).
5. Si no s'ha trobat cap camp amb pinta de línies, es busca un únic valor numèric als camps
   1..4 i es crea una línia "Amidament base".

Les línies amb `phase === 0` van a `node.measurements`; les de fase > 0 s'agrupen a
`node.certifications[<phase.id>]`.

> **Si un BC3 s'importa amb amidaments estranys, aquest és el primer lloc a mirar.**
> Val la pena instrumentar `testStep()` amb un `console.log` de les puntuacions abans de
> tocar res.

## Exportació — `generateBC3()` (`App.jsx:1898`)

Dues passades:

1. **Recol·lecció**: `processNode` recorre l'arbre i omple tres `Map`:
   - `concepts` (amb un flag `isDecomposed` si el node té fills o descomposat),
   - `relationships` (pare → fills, o pare → components del descomposat),
   - `measurementsByCode` (línies del pressupost com a fase 0, línies de cada certificació
     com a fase 1, 2, 3… segons l'ordre de `budget.certifications`).
   També s'hi afegeixen com a conceptes totes les entrades de `priceDatabase` que no hi
   siguin ja.

2. **Escriptura** de `~V`, `~K`, `~F` (una per certificació), el concepte arrel `##`, els `~C`
   i `~T`, els `~D`, i finalment els `~Q` i `~M`.

Detalls a tenir en compte:

- **Sufix `#`**: `getExportCode` afegeix `#` als codis de conceptes descompostos, com marca
  la norma per distingir capítols/preus descompostos.
- **Percentatges**: els conceptes amb unitat `%` s'escriuen amb el preu dividit per 100 i el
  rendiment dividit per 100, perquè la norma els expressa en tant per u.
- **Números**: el punt decimal es converteix a coma (`fNum`).
- **Forma del `~M`**: `~M|codi||TOTAL|linies|`. Abans s'escrivia `~M|codi|linies`, amb les
  línies al camp de la POSICIO i sense total. El nostre parser ho tolerava perquè escaneja els
  camps 1..4 buscant-les, però qualsevol altre programa ho llegia malament.
- **Codificació**: `handleExportBC3` converteix a Windows-1252 amb `toWindows1252Bytes`
  (`src/utils/googleDrive.js`), una taula manual limitada als accents catalans i castellans,
  `€`, `ç`, `ñ`, `°`. Qualsevol altre caràcter fora d'ASCII es converteix en `?`. La funció
  la comparteixen l'exportació a disc i la de Drive: si hi afegeixes caràcters, n'hi ha prou
  amb tocar-la en un lloc.

## Vies d'entrada d'un BC3

Cinc camins acaben tots a `processBC3Data` → `startImportProcess`:

| Via | Codi | Mode |
|---|---|---|
| Botó "Obrir" → disc | `handleFileSelect` (`App.jsx:2199`) | **replace** (substitueix el projecte) |
| Botó "Importar" | input `#bc3-import-input` (`App.jsx:3818`) | **merge** (fusiona) |
| Arrossegar fitxer a la finestra | `handleDrop` (`App.jsx:2485`) | merge |
| Arrossegar/enganxar una URL `.bc3` | `importFromUrl` (`App.jsx:2422`) | merge |
| Google Drive | `handleBC3FromDrive` (`App.jsx:987`) | replace |
| PWA "Obrir amb…" | `launchQueue` (`App.jsx:2446`) | merge |

En mode **merge**, `startImportProcess` busca partides amb codi ja existent i obre
`ImportConfirmModal` per a cadascuna: o s'afegeix amb sufix `_1`, `_2`… o es descarta la
importada i s'expandeix la que ja hi havia. Després, `mergeTreeBranches` fusiona els arbres
per codi normalitzat.

### Importació des d'URL

`importFromUrl` passa per `https://corsproxy.io/?<url>` perquè el navegador no pot llegir
directament les URL de tercers. **És una dependència externa no controlada**: si corsproxy.io
cau o canvia d'API, la funció deixa de funcionar en silenci (només queda un `notify` d'error).
Està pensada sobretot per a arrossegar preus des del Generador de Preus de CYPE
(el codi busca literalment `generadordepreus` a les URL candidates).

## Fitxer de mostra

`REFORMA ESPORLES_MEDICIONES_AJUSTADO.bc3` (arrel del repositori) és un export de Presto 8.7
amb ~500 conceptes, útil com a joc de proves de regressió per al parser.
