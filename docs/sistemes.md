# Paràmetres, fórmules i sistemes constructius

Tres peces que van juntes:

1. **Paràmetres** del projecte (`budget.parametres`), a la barra de l'esquerra.
2. **Fórmules** a les línies d'amidament: qualsevol camp (Ud, Ll, Am, Al) pot ser `L+2*e`.
3. **Sistemes**: un document sencer amb paràmetres que es desa a una galeria i s'insereix en
   altres projectes demanant-ne els paràmetres. Pot ser un detall (un envà, un banc d'obra) o un
   edifici sencer. La idea és estandarditzar sistemes i detalls que es repeteixen entre obres.
   L'aplicació no en porta cap de sèrie: cadascú fa els seus i els reaprofita entre projectes.

## Paràmetres i fórmules

| Fitxer | Què hi ha |
|---|---|
| `src/utils/formules.js` | L'analitzador i avaluador de fórmules, sense `eval` |
| `src/utils/parametres.js` | Resolució dels paràmetres i de les línies amb fórmula; reanomenar |
| `src/components/ParametresPanel.jsx` | La barra de paràmetres |
| `src/components/FormulaInput.jsx` | El camp que accepta número o fórmula |
| `test/formules.test.js` | Sintaxi, errors, paràmetres, cicles i línies |

**Sintaxi.** Números amb coma o punt (`2,5` = `2.5`); per això els arguments de les funcions van
amb **punt i coma**: `max(2,5;A)`. Operadors `+ - * / ^` (i `×`, `÷`), parèntesis i signe menys
(`-2^2` = −4). Funcions: `min`, `max`, `abs`, `arrel` (`sqrt`), `sostre` (`ceil`), `terra`
(`floor`), `arrod(x;decimals)` (`round`) i la constant `pi`. Un `=` al davant s'ignora. Els noms
de paràmetre comencen per lletra o `_` i poden dur lletres (amb accents i `·`), xifres i `_`.

**Model.** Un paràmetre és `{ id, nom, valor, formula, unitat, descripcio, grup }`: valor fix o
fórmula d'altres paràmetres. Una línia porta `formules: { units, length, width, height }` amb el
text de cada camp que en tingui. **Quan un camp té fórmula, mana la fórmula**: el número desat
al camp pot ser antic. No es reescriu en desar: una línia amb error es resol a Ud 0, i desant-ho
es perdria el valor bo el dia que es corregís.

**Resolució.** Com els vincles, abans de calcular: `resolvedChapters` és
`resolveMeasurementRefs(resolveFormules(budget.chapters, budget.parametres))`. Primer fórmules i
després vincles, perquè un vincle pren la quantitat d'una partida que pot tenir fórmules. La
resta de `calculations.js` no se n'assabenta.

Tres decisions:

- **Una dimensió que dona 0 deixa la línia a 0.** A tota l'aplicació (i al BC3) una dimensió
  buida o a zero val 1: és el que permet escriure `5` a Ud i deixar la resta en blanc. Una
  fórmula que dona 0 diu, en canvi, que no hi ha res a amidar (un costat que no existeix). La
  línia resolta passa a Ud 0, i així el parcial és 0 a la pantalla, al PDF, al BC3 i en
  reimportar-lo (hi ha un test que ho comprova).
- **Un error no para res.** Un paràmetre desconegut, una divisió per zero o un cicle deixen la
  línia a Ud 0, marcada en vermell amb el missatge al `title`. Un paràmetre que depèn d'un altre
  amb error diu «El paràmetre X té un error».
- **Canviar el nom d'un paràmetre reescriu totes les fórmules** que el fan servir, de línies i
  d'altres paràmetres, sense tocar res més (`L` no toca `L2`). Esborrar-ne un que es fa servir
  demana confirmació.

El porta-retalls (copiar entre finestres) **congela** les fórmules com els vincles: els
paràmetres són del projecte d'origen.

Al mòbil, el teclat decimal no té lletres: el camp fa servir el teclat de text quan el projecte
té paràmetres.

## Condicions

Dues menes, totes dues opcionals (`comprovaCondicions`, a `utils/parametres.js`):

- **Límits de cada paràmetre**: `min`, `max` i `enter`. Es posen des de la barra, amb el botó
  «límits» de cada paràmetre, sense escriure cap fórmula.
- **Condicions entre paràmetres** (`budget.condicions`): `{ id, expressio, missatge }`, on
  `expressio` és una fórmula que ha de donar cert (diferent de 0): `P2>=P1`,
  `o(hT>0; tLlargs+tCurts=0)`. Van a la secció «Condicions entre paràmetres» de la barra.

Per escriure-les, les fórmules tenen comparacions (`= <> < > <= >=`, també `≠ ≤ ≥ !=`), que
donen 1 o 0, i les funcions `si(c; a; b)`, `i(...)`, `o(...)` i `no(x)` (`if`, `and`, `or`,
`not`). `si` només calcula la branca que toca. La igualtat i els límits tenen marge per al soroll
de la coma flotant (`0,1+0,2=0,3` és cert). No es poden encadenar comparacions (`1<A<3`): es
fa amb `i(A>1; A<3)`.

**Al projecte són avisos**: el paràmetre o la condició es marquen en ambre, la barra en mostra
el recompte i el botó de paràmetres porta un triangle, però el càlcul continua. **En inserir un
sistema, bloquegen**: el quadre marca en vermell els camps que no compleixen els seus límits i
els que surten en una condició que falla, posa el missatge al peu i no deixa inserir fins que
tot es compleix.

Les condicions viatgen amb el sistema: en inserir-lo es reanomenen com els paràmetres
(`H_2<=L`) i es marquen amb la instància; extreure-la les recupera amb els noms originals i
treure-la les esborra. Un paràmetre enllaçat amb el del projecte no es comprova pels límits del
sistema (és del projecte), però sí per les condicions entre paràmetres.

## Sistemes

| Fitxer | Què hi ha |
|---|---|
| `src/utils/sistemesDoc.js` | Crear un document, inserir-lo (instància), filtrar, extreure i treure |
| `src/utils/galeriaSistemes.js` | La galeria, al navegador |
| `src/components/SistemesModal.jsx` | Galeria, paràmetres i desar |
| `test/sistemes.test.js` | Un sistema de prova amb xifres fetes a mà, inserir, instàncies, condicions, BC3 |

**Un sistema és un document.** `{ format: 'amidaments/sistema', nom, descripcio, parametres,
chapters, prices }`: l'arbre sencer (amb les fórmules i els vincles) i els preus que fa servir.
No és BC3: la norma admet una expressió per línia (`~M` tipus 3, annex 2), però l'extracte que
tenim no hi preveu paràmetres compartits amb nom.

**Crear-ne un** és desar el projecte com a sistema (botó **Sistema › Desa aquest projecte com a
sistema**): a la galeria del navegador o a un fitxer `.amid`. El fitxer és un projecte normal,
que també es pot obrir com a tal; la descripció hi va a `budget.descripcioSistema`. Des de la
galeria, **Obre per editar** el carrega com a projecte i, en tornar-lo a desar, proposa
substituir l'original (`budget.sistemaGaleria`).

**Inserir-lo** (botó **Sistema**, triar-ne un) demana els paràmetres que declara, agrupats com
al sistema. Els que són fórmula d'altres (una superfície `L*H`) no es demanen. Per a cadascun:

- es pot escriure un valor o una **fórmula sobre els paràmetres del projecte** (`H-0,3`);
- si el projecte ja té un paràmetre **amb el mateix nom**, es pot fer servir aquest. Per
  defecte es fa així si el del projecte és **propi del projecte** (una «alçada de planta»
  comuna), i no si és d'una altra instància: la segona instància d'un sistema no ha de tenir per
  força les mides de la primera.

En inserir:

- els paràmetres nous entren a la barra amb el grup `«nom de la instància» · «grup»`, i si el
  nom ja hi és es reanomenen (`L_2`), reescrivint les fórmules del sistema;
- tot l'arbre rep ids nous; els vincles a una línia concreta segueixen la seva línia;
- **cada línia porta la marca `sistema`** amb l'id de la instància, i `budget.sistemes` en desa
  la llista (`{ id, nom, sistema }`);
- l'arbre entra per `insereixNodes` (el camí d'enganxar), a l'arrel amb els seus capítols o dins
  del capítol seleccionat. Els capítols amb el mateix codi es fusionen: un sistema amb el
  capítol `04 COBERTES` va a parar al `04` del projecte;
- si una partida ja hi és, el quadre de duplicats té una opció nova, **«Afegir-hi les
  línies»**: la partida és la mateixa i només s'hi sumen les línies (marcades). És el que es vol
  en inserir per segon cop el mateix sistema. Serveix també per enganxar;
- amb **«No insereixis les partides que surten a zero»**, les partides que amb els valors triats
  tenen quantitat 0 (i els capítols que es queden buits per això) no entren. És per als
  sistemes amb variants: un paràmetre `perfil` i, a cada partida de perfil, Ud =
  `si(perfil=48;1;0)`. El codi i la descripció d'una partida no canvien amb els paràmetres (un
  codi és un concepte, amb una descripció i un preu), així que cada variant és una partida. El
  preu de l'opció: si després es canvia el paràmetre, la partida que no s'ha inserit no
  apareix i cal tornar a inserir el sistema;
- els paràmetres i la instància viatgen amb la importació i només s'afegeixen si s'acaba:
  cancel·lar el quadre de duplicats no deixa paràmetres orfes.

**Filtrar per instància.** Amb instàncies al projecte surt un desplegable al costat de la cerca.
L'editor mostra només les línies d'aquella instància i les partides i capítols que les contenen,
amb el total. Des de la barra del filtre:

- **Desa com a sistema** torna a fer el sistema amb la instància (`extreuInstancia`): les seves
  línies amb fórmules, els seus paràmetres amb el nom original (`L` en comptes de `L_2`) i els
  paràmetres del projecte que fan servir, amb el valor d'ara;
- **BC3** n'exporta només aquesta part;
- **Treu-la** n'esborra les línies, els paràmetres i les partides que només tenien línies seves.
  Una partida que ja hi era es queda amb les que tenia.

La galeria és al `localStorage`, com la biblioteca de projectes: hi caben uns quants MB entre
tot. Un sistema gran s'ha d'exportar a fitxer.

## Sistemes a partir del Generador de Preus

Un sistema es pot muntar amb partides del Generador de Preus de CYPE: cada partida té un BC3
descarregable que ja porta l'arbre de capítols de CYPE i el descomposat, i el parser el llegeix
tal qual. Fusionant els arbres per codi de capítol, el sistema conserva l'estructura de CYPE i,
en inserir-lo, va a parar als mateixos capítols del projecte.

Dos límits trobats:

- **Les opcions d'una partida** (mida de la peça, classe de lliscabilitat...) es trien en una
  pàgina amb verificació de seguretat. El BC3 que es baixa sense passar-la és el de la
  configuració per defecte. Per a una altra configuració cal triar-la al navegador i fer servir
  l'enllaç del BC3 que en surt (el botó del script de Tampermonkey el copia).
- **No hi és tot.** Hi ha elements sense partida (per exemple, un focus per encastar a paret
  exterior): van com a partida pròpia, sense preu i marcada com a pendent, en comptes d'una
  partida que no hi correspon o d'un preu inventat.

Aquests sistemes porten dades de CYPE i no s'han de posar al repositori: van a la galeria de
cadascú o a un fitxer.

## Què falta

- **Desar a Drive** la galeria, per tenir-la a tots els dispositius.
- **Vincle amb AutoCAD**: una galeria de detalls constructius amb el seu amidament.
- Un sistema dins d'un altre: ara les instàncies d'un projecte desat com a sistema es
  converteixen en grups de paràmetres normals.

## Títols i descripcions amb variables

El títol (`description`) i la descripció tècnica (`fullDescription`) d'una partida o d'un capítol
poden portar expressions entre claus que es resolen amb els paràmetres (`utils/plantilles.js`):

    Biga de formigó armat de {B*100}x{H*100} cm, {si(acabat=1; "encofrat vist"; "per revestir")}

- `{expressió}`: una fórmula com les de les línies; el número surt amb coma i sense zeros sobrers.
- `{si(condició; "text"; "altre text")}`: tria un text. Les branques poden ser text entre cometes,
  un altre `si(...)` o una fórmula.
- El que no es pot resoldre es deixa amb les claus i el detall ho diu en vermell.

Així, d'una partida fixa de CYPE se'n fa una de variable: s'hi substitueixen les mides del text per
variables, les quantitats per fórmules i els rendiments que depenen de les mides també (veure més
avall).

Com les fórmules de les línies: **es desa i s'edita el text amb les claus** (`budget.chapters`), i
`resolveFormules` en posa el resolt a `resolvedChapters` (amb l'original a `plantilles`, que és el
que mostren els camps del detall). Per això l'arbre, la impressió, l'exportació BC3 i l'assistent
veuen el text omplert. Els paràmetres que només surten al text també es demanen en inserir el
sistema, i `reescriuFormules` els reanomena també dins de les claus. Copiar a una altra finestra
porta el text omplert, no les variables (els paràmetres poden no existir-hi).

## Rendiments amb fórmula

El rendiment d'un component del descomposat pot ser una fórmula (`breakdown[].formulaRendiment`),
que s'escriu al mateix camp de la justificació de preu: `B*H` m³ de formigó per metre de biga.
Com que el preu d'una partida amb descomposat surt dels rendiments, **el preu segueix els
paràmetres**. Les regles són les de les línies d'amidament:

- Mana la fórmula; el número desat a `yield` pot ser antic. `resolveFormules` en posa el valor a
  `resolvedChapters`, i qualsevol càlcul de preu ha d'anar sobre el resolt.
- Una fórmula amb error deixa el component a rendiment 0 (no compta al preu) i l'error a
  `errorRendiment`; el camp es veu en vermell.
- `reescriuFormules` la reanomena, `usosDeParametres` la compta i els sistemes la tenen en compte.
- El BC3 porta el rendiment calculat al `~D` i, al `~C` d'una partida amb descomposat, el preu
  que en surt (no el desat al node, que pot haver quedat antic).

## Esquema del sistema

Un sistema pot portar un **esquema**: una imatge o un SVG amb les cotes dels paràmetres, que es
veu en inserir-lo i al bloc de la instància del panell de paràmetres (`utils/esquema.js`,
`components/Esquema.jsx`). S'afegeix des del panell de paràmetres del projecte que es desarà
com a sistema.

**Viabilitat i on es desa.** Es desa com a data URL dins de `budget.esquema` (`{ dades, nom }`),
del document de sistema (`doc.esquema`) i de cada instància (`budget.sistemes[].esquema`), així
que viatja amb el `.amid` sense cap fitxer a part. El límit real és l'espai: la biblioteca de
projectes i la galeria de sistemes comparteixen el `localStorage`, uns 5 MB. Per això:

- les imatges es redueixen a 1600 px i es desen en PNG o JPEG, el que pesi menys, fins a 400 kB;
  un esquema de línies queda en uns 20-60 kB;
- un SVG va tal qual fins a 400 kB. Es mostra sempre amb `<img>`, que no executa scripts ni
  carrega res de fora, de manera que no cal netejar-lo;
- `esquemaValid` descarta qualsevol cosa que no sigui un data URL d'imatge.

El BC3 no el porta (el FIEBDC només hi pot fer referència a fitxers externs). Un DWG o un DXF
no es pot llegir: s'ha d'exportar a SVG o PNG des del CAD.

## Zona de cada instància

En inserir un sistema es demana el **nom de la zona o del detall** (el nom de la instància) i,
per defecte, cada partida amb línies en porta una al davant amb aquest nom, a 0 i marcada amb
`zona: true`. A les partides on s'ajunten línies de diverses instàncies es veu de quina zona és
cada grup. La línia té `sistema`, així que es filtra i es treu amb la instància; en extreure la
instància no es copia (en tornar-la a inserir se'n posa una de nova). A la impressió surt només
el nom.

Si una partida variable (text amb variables o rendiments amb fórmula) ja és al projecte i s'hi
afegeixen les línies d'una altra instància, el títol i el preu continuen sent els de la primera:
el quadre de duplicats ho avisa i recomana afegir-la com a partida nova.

## Panell de paràmetres

Els paràmetres del projecte van al davant, agrupats per grup. Cada instància de sistema té un
bloc plegable propi amb el seu esquema, els seus paràmetres (agrupats pel grup que tenien al
sistema) i les seves condicions; el bloc diu si alguna condició no es compleix. La instància
que s'acaba d'inserir s'obre i plega les altres.
