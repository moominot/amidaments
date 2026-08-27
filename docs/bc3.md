# Format BC3 (FIEBDC-3)

BC3 és el format estàndard d'intercanvi de bases de preus i pressupostos a Espanya. És text
pla en **Windows-1252**, amb registres separats per `~` i camps per `|`. Dins d'un camp, les
subllistes es separen per `\`.

## Registres que l'aplicació entén

| Registre | Nom | Importació (`bc3Parser.js`) | Exportació (`generateBC3`) |
|---|---|---|---|
| `~V` | Versió / propietat | ✔ (tipus, núm. i data de certificació) | ✔ amb tots els camps a lloc |
| `~K` | Coeficients | ignorat | escrit amb valors fixos |
| `~C` | Concepte (codi, ud, resum, preu) | ✔ | ✔ |
| `~D` | Descomposició (pare → fills) | ✔ | ✔ |
| `~T` | Text descriptiu llarg | ✔ | ✔ |
| `~M` | Línies d'amidament | ✔ (amb heurística) | ✔ |
| `~F` | **Document adjunt** | llegit com a fase només si en té la forma antiga | ja no s'escriu |
| `~Q` | — | — | ja no s'escriu (veure avís) |
| `~R` | Descomposició de residus | ✔ | ✔ |
| `~X` | Propietats del concepte (codi LER, massa, volum, cost energètic, CO₂) | ✔ | ✔ |
| `~L`, `~P`, `~W`, `~A`, `~G`, `~E`, `~O` | plecs, paramètrics, entitats… | no suportats | no s'escriuen |

> **El `~Q` existeix, però és el registre de PLECS DE CONDICIONS**, no de quantitats:
> `~Q | <CODI_CONCEPTE\> | {CODI_SECCIO_PLEC \ CODI_PARAGRAF \ {AMBIT;}\} |`.
> L'exportador n'escrivia `~Q|codi|quantitat|fase`, que un altre programa hauria intentat
> llegir com a assignació de plecs. S'ha eliminat. El total autoritzat viu al camp
> **MEDICION_TOTAL** del `~M`.
>
> Verificat contra
> [l'especificació oficial FIEBDC-3/2020](https://www.fiebdc.es/web2/datos/uploads/Standard-exchange-format-FIEBDC-3-2020v2_eng-.pdf).

> **Cada certificació és un fitxer BC3 propi.** Segons la norma, una certificació és un
> fitxer sencer i independent, idèntic en estructura a un pressupost, que se'n distingeix pel
> registre `~V`: `TIPUS_INFORMACIO = 3` (*cost real*) més `NUM_CERTIFICACIO` i
> `DATA_CERTIFICACIO`. El nom del fitxer és el del pressupost més `#certification NNNN`.
>
> Fins a l'agost de 2026 l'aplicació ho feia amb un sol fitxer, declarant les fases amb `~F` i
> posant el número de fase al primer subcamp de cada línia de `~M`. No era conforme i xocava
> amb dos usos reals del format: `~F` és el registre de **documents adjunts** i el primer
> subcamp de la línia de `~M` és el **TIPUS** de línia («1» subtotal parcial, «2» subtotal
> acumulat, «3» expressió), de manera que Presto llegia les nostres línies de certificació com
> a files de subtotal. Veure `docs/estat-actual.md` §24 i `docs/fiebdc-norma.md`.

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

## Exportació — `src/utils/bc3Writer.js`

```js
generateBC3({ budget, chapters, priceDatabase, certification })
```

Un fitxer per document: **sense `certification` escriu el pressupost, amb `certification`
escriu aquella certificació**. L'estructura és la mateixa —els mateixos `~C`, `~D`, `~T` i un
`~M` per partida—; el que canvia és el `~V` i d'on surten els amidaments.

|  | Pressupost | Certificació |
|---|---|---|
| `~V` TIPUS_INFORMACIO | 2 | 3, amb `NUM_CERTIFICACIO` i `DATA_CERTIFICACIO` |
| Nom del fitxer | el del projecte | `<projecte>#certification NNNN` (`nomFitxerCertificacio`) |
| Línies del `~M` | `node.measurements` | les de `node.certifications[certId]`, o una sola línia amb la quantitat entrada a mà |
| Partida sense dades | sense línies | `~M\|codi\|\|0\|`, amb el zero escrit |

`App.jsx` només decideix **què** s'exporta: `seleccioBC3` mira si hi ha una certificació activa
en mode certificació, i `documentBC3()` en retorna el contingut, el nom i una etiqueta que el
menú ensenya («Certificació 1 · Certificació juliol») perquè no sigui una sorpresa en clicar.
El mateix parell de botons —disc i Drive— serveix per als dos documents.

### Com es construeix

1. **Recol·lecció**: `processNode` recorre l'arbre i omple tres `Map`:
   - `concepts` (amb un flag `isDecomposed` si el node té fills o descomposat),
   - `relationships` (pare → fills, o pare → components del descomposat),
   - `measurementsByCode` (línies i total per concepte).
   També s'hi afegeixen com a conceptes les entrades de `priceDatabase` que no hi siguin ja.

2. **Escriptura** de `~V`, `~K`, el concepte arrel `##`, els `~C` i `~T`, els `~D`, els `~X` i
   `~R` de residus, i els `~M`.

Detalls a tenir en compte:

- **El descomposat mana sobre els fills.** En importar una partida amb descomposat, el parser
  en penja els components a `breakdown` (amb el rendiment) i **també** a `items`, perquè tots
  dos surten del mateix `~D`. Si s'escriuen primer els fills, el rendiment es perd i tots
  surten a 1: en reimportar, el preu unitari passa a ser la suma dels components sense
  multiplicar-los pel rendiment. Va ser el defecte §25.
- **Sufix `#`**: `getExportCode` afegeix `#` als codis de conceptes descompostos, com marca
  la norma per distingir capítols i preus descompostos.
- **Percentatges**: els conceptes amb unitat `%` s'escriuen amb el preu i el rendiment
  dividits per 100, perquè la norma els expressa en tant per u.
- **Números**: el punt decimal es converteix a coma (`fNum`).
- **Forma del `~M`**: `~M|codi||TOTAL|{\TIPUS buit\comentari\u\l\a\h\}|`. El primer
  subcamp de cada bloc és el **TIPUS** de línia, i es deixa buit: no és la fase.
- **Codificació**: `handleExportBC3` converteix a Windows-1252 amb `toWindows1252Bytes`
  (`src/utils/googleDrive.js`), una taula manual limitada als accents catalans i castellans,
  `€`, `ç`, `ñ`, `°`. Qualsevol altre caràcter fora d'ASCII es converteix en `?`. La funció
  la comparteixen l'exportació a disc i la de Drive: si hi afegeixes caràcters, n'hi ha prou
  amb tocar-la en un lloc.
- **Noms de fitxer**: tot passa per `safeFileName`, que conserva el `#` de la convenció.
- **Residus**: els `~X` i `~R` es reescriuen tal com van entrar, inclosos els components amb
  quantitat zero. Veure `docs/residus.md`.

### Importar una certificació

Quan `processBC3Data` troba un `~V` amb `TIPUS_INFORMACIO = 3` i hi ha un projecte obert,
`startImportProcess` desvia el fitxer a `importCertification` en comptes de tractar-lo com un
projecte nou: fa coincidir els codis, penja les línies a `node.certifications[certId]` —que ja
és l'acumulat a origen, que és el que la norma diu que porta el fitxer— i activa la fase. El
número de certificació és la posició de la fase; si ja n'hi ha una en aquella posició, es
demana si se'n substitueixen els amidaments.

Sense projecte obert s'importa com qualsevol altre fitxer, que és tot el que se'n pot fer.

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

`importFromUrl` és el camí de l'enllaç arrossegat des del [Generador de Preus de
CYPE](https://www.generadordepreus.info/): s'arrossega l'enllaç del BC3 a la finestra i la
partida entra al projecte sense passar per la carpeta de descàrregues. Funciona tant amb
l'enllaç «BC3 estàndard» com amb el «BC3 d'Arquímedes».

El servidor de CYPE **no envia `Access-Control-Allow-Origin`**, de manera que el navegador no
en pot llegir la resposta i cal un proxy pel mig. La descàrrega viu a `utils/corsProxy.js`, que
prova diversos serveis en ordre i es queda amb el primer que respon un BC3 de veritat.

> **Ja ens ha caigut un cop.** L'agost de 2026 corsproxy.io va canviar l'API: el format antic
> `?<url>` va passar a respondre `403 keyless_legacy_url` i la importació va deixar de
> funcionar sense que aquí hagués canviat res. El format bo és `?url=<url codificada>`, i amb
> el pla gratuït només respon a peticions de navegador —des d'un script diu «Server-side
> requests are not allowed on your plan».
>
> Per no dependre'n, a **`worker/`** hi ha un Worker de Cloudflare a punt de desplegar
> (`npx wrangler deploy`), amb llista blanca de dominis d'origen i de llocs que el poden
> cridar. La seva URL va a `VITE_CORS_PROXY`, amb `{url}` allà on hi vagi la URL codificada,
> i es prova primer. Veure `worker/README.md`.

Cada intent té un límit de 15 segons i es comprova que la resposta comenci per un registre
BC3: gairebé tots aquests serveis contesten `200` amb un JSON d'error a dins quan et refusen,
i sense la comprovació el text d'error acabava al parser. Si no se'n surt cap, el missatge
diu què es pot fer —descarregar el fitxer i arrossegar-lo— i el detall de cada intent va a
la consola.

## Fitxer de mostra

`REFORMA ESPORLES_MEDICIONES_AJUSTADO.bc3` (arrel del repositori) és un export de Presto 8.7
amb ~500 conceptes, útil com a joc de proves de regressió per al parser.
