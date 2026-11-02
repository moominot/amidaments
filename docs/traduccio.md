# Traducció

Botó **Tradueix** al capçal del projecte (tot el projecte) i a la capçalera del detall (un
capítol amb tot el que conté, o una partida). Fa servir l'API de Claude amb la mateixa clau que
l'assistent (`utils/assistent/clau.js`).

| Fitxer | Què fa |
|---|---|
| `src/utils/traduccio.js` | Recollir els textos, partir-los en trossos i tornar-los a posar. Sense xarxa |
| `src/utils/assistent/tradueixApi.js` | Les crides a l'API (es carrega a part, amb el SDK) |
| `src/components/TraduccioModal.jsx` | El quadre: idioma, model, esforç, estimació, progrés |
| `test/traduccio.test.js` | Contra el BC3 de referència: arriba a tots els camps i el PEM no es mou |

## Què es tradueix

- Capítols i partides: `description` i `fullDescription`.
- Descomposat (`breakdown[].description`) i residus (`waste[].description`).
- Base de preus: `summary` dels codis de l'abast. Un material compartit amb partides de fora
  de l'abast es tradueix per a totes: és el mateix concepte.
- Línies d'amidament, si es marca (per defecte, sí).
- Amb tot el projecte, també la descripció dels paràmetres i el missatge de les condicions.

Codis, unitats, preus, rendiments i fórmules no es toquen.

## Com

**Per valor, no per lloc**: es recullen els textos diferents, es tradueixen una vegada i després
es recorre l'arbre substituint els camps que hi coincideixen (`aplicaTraduccions`). Un text
repetit en vint partides costa una traducció, i el que l'usuari toqui mentre es tradueix no es
perd: s'aplica sobre l'estat del moment.

Els textos van en trossos d'uns 12.000 caràcters, tres peticions alhora, amb sortida estructurada
(`output_config.format`, un JSON amb l'índex i la traducció de cada text) i en streaming (amb
`max_tokens` alt el SDK no deixa fer-ho d'una peça). Si un tros es talla per llargada, es parteix
en dos. Les indicacions demanen la terminologia del sector, coherència, conservar codis, unitats,
normativa i salts de línia, i tractar els textos com a dades.

Tot s'aplica al final en un sol canvi (es desfà d'un cop), també si s'atura: amb el que s'hagi
fet. El que no s'ha pogut traduir es pot tornar a provar sol.

Per defecte, el model de l'assistent amb esforç **baix**: traduir no demana gaire raonament i
l'esforç alt el multiplica. L'estimació del cost és orientativa (uns 3,5 caràcters per tòquen).
