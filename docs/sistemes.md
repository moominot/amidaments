# Paràmetres, fórmules i sistemes constructius

Tres peces que van juntes:

1. **Paràmetres** del projecte (`budget.parametres`), a la barra de l'esquerra.
2. **Fórmules** a les línies d'amidament: qualsevol camp (Ud, Ll, Am, Al) pot ser `L+2*e`.
3. **Sistemes**: un document sencer amb paràmetres que es desa a una galeria i s'insereix en
   altres projectes demanant-ne els paràmetres. Pot ser un detall (un envà, una piscina) o un
   edifici sencer. La idea és estandarditzar sistemes i detalls que es repeteixen entre obres.

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
(`P2_2>=P1`) i es marquen amb la instància; extreure-la les recupera amb els noms originals i
treure-la les esborra. Un paràmetre enllaçat amb el del projecte no es comprova pels límits del
sistema (és del projecte), però sí per les condicions entre paràmetres.

La piscina porta els mateixos límits que tenia el generador anterior i dues condicions:
`P2>=P1` i que el suport de tubs tingui alçada si n'hi ha.

## Sistemes

| Fitxer | Què hi ha |
|---|---|
| `src/utils/sistemesDoc.js` | Crear un document, inserir-lo (instància), filtrar, extreure i treure |
| `src/utils/galeriaSistemes.js` | La galeria: integrats i desats al navegador |
| `src/utils/sistemes/piscina.sistema.json` | La piscina, sistema integrat |
| `src/components/SistemesModal.jsx` | Galeria, paràmetres i desar |
| `test/sistemes.test.js` | Piscina amb xifres fetes a mà, inserir, instàncies, BC3 |

**Un sistema és un document.** `{ format: 'amidaments/sistema', nom, descripcio, parametres,
chapters, prices }`: l'arbre sencer (amb les fórmules i els vincles) i els preus que fa servir.
No és BC3: la norma admet una expressió per línia (`~M` tipus 3, annex 2), però l'extracte que
tenim no hi preveu paràmetres compartits amb nom.

**Crear-ne un** és desar el projecte com a sistema (botó **Sistema › Desa aquest projecte com a
sistema**): a la galeria del navegador o a un fitxer `.amid`. El fitxer és un projecte normal,
que també es pot obrir com a tal; la descripció hi va a `budget.descripcioSistema`. Des de la
galeria, **Obre per editar** el carrega com a projecte i, en tornar-lo a desar, proposa
substituir l'original (`budget.sistemaGaleria`). Els integrats no es poden sobreescriure: se'n
desa una còpia.

**Inserir-lo** (botó **Sistema**, triar-ne un) demana els paràmetres que declara, agrupats com
al sistema. Els que són fórmula d'altres (la fondària mitjana) no es demanen. Per a cadascun:

- es pot escriure un valor o una **fórmula sobre els paràmetres del projecte** (`H-0,3`);
- si el projecte ja té un paràmetre **amb el mateix nom**, es pot fer servir aquest. Per
  defecte es fa així si el del projecte és **propi del projecte** (una «alçada de planta»
  comuna), i no si és d'una altra instància: la segona piscina no ha de tenir per força les
  mides de la primera.

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
  en inserir la segona piscina. Serveix també per enganxar;
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

## La piscina

És el primer sistema integrat (`piscina.sistema.json`). Les partides i els preus surten del
capítol 22 d'un projecte real; les regles d'amidament són:

| Partida | Línies |
|---|---|
| Neteja | `(L+2*e+2*s) × (A+2*e+2*s)` |
| Llosa | `(L+2*e) × (A+2*e)` |
| Mur (per l'eix) | `2 × (L+e) × Pm`, `(A+e) × P1`, `(A+e) × P2` |
| Arrebossat | parets: `2 × L × Pm`, `A × P1`, `A × P2` |
| Impermeabilització i gres | parets + fons `Lf × A` |
| Coronament | `nAmple × (L+2*v)`; `(2-nAmple) × (L+2*v)` i `2 × (A+2*v)` |
| Suport de tubs | `tLlargs × (L+2*e) × hT`, `tCurts × (A+2*e) × hT` |

amb `Pm = (P1+P2)/2` (amb el fons inclinat dona l'àrea exacta de les parets llargues) i
`Lf = arrel(L^2+(P2-P1)^2)` (la llargària real del fons). Amb els valors per defecte
(8,00 × 1,78 m, fondària 1,30–1,44 m) fa **16.362,97 €**, la mateixa xifra que donava el
generador anterior escrit en JavaScript, que s'ha tret.

La partida del mur (`RF22.01.03`) portava, al projecte d'origen, el descomposat amb tots els
rendiments a 1: l'aplicació hi calculava 268,61 €/m² en lloc dels 91,35 del concepte. Al sistema
va sense descomposat, i un test comprova que cada partida valgui el preu del seu concepte.

## Què falta

- **Desar a Drive** la galeria, per tenir-la a tots els dispositius.
- **Vincle amb AutoCAD**: una galeria de detalls constructius amb el seu amidament.
- Un sistema dins d'un altre: ara les instàncies d'un projecte desat com a sistema es
  converteixen en grups de paràmetres normals.
