# Sistemes constructius

Un **sistema constructiu** és un conjunt de partides que s'amida soles a partir d'uns quants
paràmetres. El primer (i de moment l'únic) és una piscina: amb les dimensions interiors del vas,
el gruix del mur i quatre detalls de coronament i equipament, genera el capítol sencer amb les
línies d'amidament de cada partida.

S'obre amb el botó **Sistema**, al costat de «Nova entrada». A l'esquerra hi ha els paràmetres;
a la dreta, en viu, una fila per **paper** (la llosa, el mur, la impermeabilització...) amb la
partida que el fa, la quantitat i l'import. Si es toca una fila, se'n despleguen les línies amb
les dimensions, per veure d'on surt cada xifra. El capítol va dins del capítol seleccionat, o a
l'arrel si no n'hi ha cap.

## Triar la partida de cada paper

El botó ⇄ de cada fila obre el selector (`components/TriaPartida.jsx`). Hi surten:

- **«La del sistema»**: la partida del joc per defecte.
- **«Sense partida»**: el paper no surt al capítol (per exemple, si no es vol arrebossat).
- **Les partides del projecte**, amb el seu descomposat, i després **els conceptes del banc de
  preus** que no hi són, que valen el preu del concepte (el banc no porta descomposat).

Per defecte només es mostren les de la unitat del paper. Les línies que genera el sistema són
en aquella unitat: una llosa en m³ on el paper s'amida en m² donaria un import sense sentit. Es
poden mostrar totes; si se'n tria una d'una altra unitat, la fila i el peu ho avisen (no ho
impedeix: pot ser una qüestió de notació, «ml» i «m» ja es consideren iguals).

El que es tria es desa com una **instantània** `{ partida, prices }` —descripció, unitat,
descomposat, residus i els preus que la fan valer—, no com un codi. Així funciona igual en un
altre projecte que no tingui aquella partida. La tria es recorda **en aquest navegador**
(`utils/sistemes/triaDesada.js`, a `localStorage`): és una comoditat, no una dada del projecte.
Si el navegador no deixa desar, es torna a les partides del sistema sense cap error.
«Partides del sistema (N canviades)», sota els paràmetres, ho torna tot a la del sistema.

Dues coses a saber:

- **Dos papers poden compartir partida.** Si al mateix subcapítol tots dos fan servir el mateix
  codi, en surt una sola partida amb les línies dels dos, cadascuna amb el nom del paper al
  davant. Dues partides amb el mateix codi al mateix capítol no poden ser: la fusió de la
  importació es quedaria amb la primera i les línies de la segona es perdrien.
- **Una partida triada del projecte ja hi és**, i en inserir surt el diàleg de duplicats.
  «Afegir com a nova» conserva les línies generades (amb un sufix al codi); «mantenir
  l'existent» les descarta.

## Com està fet

| Fitxer | Què hi ha |
|---|---|
| `src/utils/sistemes/index.js` | El generador (`generaSistema`), la validació i la llista `SISTEMES` |
| `src/utils/sistemes/piscina.js` | La definició de la piscina: paràmetres, regles d'amidament i el perquè de cada regla |
| `src/utils/sistemes/piscina.partides.json` | Les partides i els preus (format de fragment del porta-retalls) |
| `src/utils/sistemes/triaDesada.js` | La tria de partides de cada paper, recordada al navegador |
| `src/components/SistemaModal.jsx` | El quadre de diàleg |
| `src/components/TriaPartida.jsx` | El selector de la partida d'un paper |
| `test/sistemes.test.js` | Les quantitats fetes a mà, la validació, la tria de partides i el cicle BC3 |

Una definició és declarativa: `parametres` (amb valor per defecte i límits), `capitols` (per a
cada partida, el `paper` que fa, amb nom i unitat, el `codi` de la partida per defecte i una
funció `linies(p, g)` que torna línies Ud × Ll × Am × Al) i `joc` (les partides amb descomposat
i preus).

**El resultat és un subarbre normal.** Entra al projecte per `insereixNodes` (`App.jsx`), el
mateix camí que una partida enganxada d'una altra finestra: `embolcallaPerEnganxar` el posa al
capítol de destí i `startImportProcess` pregunta pels codis repetits, amb `conservaPreus` perquè
un preu que el projecte ja té no es toqui. Un cop dins, no en queda cap rastre: es pot editar,
exportar a BC3 i certificar com qualsevol altra partida. El preu d'això és que **canviar les
dimensions vol dir tornar-lo a generar**; els paràmetres no es desen enlloc.

Altres decisions:

- **El codi del capítol no xoca mai.** `PISC` si és lliure; si no, `PISC_2`, `PISC_3`... Sense
  això, la fusió per codis de la importació ficaria la segona piscina dins de la primera.
- **Les partides no porten components fills**, només el descomposat. El descomposat és el que
  fa el preu, i amb els fills la importació preguntaria per cada material i cada hora de mà
  d'obra que el projecte ja tingués.
- **Una línia amb Ud 0 no es genera**, i una partida sense línies tampoc: posar 0 focus treu la
  partida dels focus.
- **Les partides repetides es resolen com en enganxar.** Si el projecte ja té `RF22.01.07`, el
  quadre ho avisa abans i en inserir surt el diàleg de duplicats. «Mantenir l'existent» descarta
  la partida generada **amb les seves línies**; per tenir-les totes dues cal «Afegir com a nova».
- **Els preus que el projecte ja té manen**, com en enganxar. Si el projecte té `mo021` a un
  altre preu, el suport de tubs (que el porta al descomposat) valdrà diferent que al joc: amb
  el projecte de referència d'Esporles passa de 52,85 a 36,56 €/m². La vista prèvia ja mostra
  el preu que quedarà.

## Les regles de la piscina

Estan explicades a la capçalera de `piscina.js`. En resum: les parets interiors amb la fondària
mitjana (que, amb fons inclinat, dona l'àrea exacta), el fons amb la llargària real del pla
inclinat, el mur per l'eix, la llosa per l'exterior dels murs, la neteja amb un sobreample per
costat i el coronament allargat a cada extrem.

Amb els valors per defecte (8,00 × 1,78 m, fondària 1,30–1,44 m) el capítol fa
**16.362,97 €**. El capítol de referència, amidat a mà, en feia 16.474,24 €. La diferència ve de
l'estructura: a mà s'havia pres una amplada exterior una mica més gran (2,40 m de llosa en lloc
dels 2,28 que surten d'1,78 + 2 × 0,25).

## El mur del capítol de referència

Les partides i els preus surten del capítol 22 d'un projecte real. La partida `RF22.01.03` (mur
de bloc de formigó armat) hi portava el **descomposat amb tots els rendiments a 1**: un bloc, un
quilo d'acer, un metre cúbic de formigó i una hora d'oficial per m². Amb aquell descomposat
l'aplicació en calcula **268,61 €/m²**, no els 91,35 €/m² del concepte, i el capítol suma
21.511,97 € en lloc de 16.474,24 €. Al joc de la piscina es desa sense descomposat, i un test
comprova que cada partida del joc val el preu del seu concepte.

## Què falta

- **Afegir les línies a la partida existent** en comptes de crear-ne una de nova quan es tria
  una partida del projecte. Vol decidir on van (la partida és en un altre capítol).
- **Desar els paràmetres** al capítol per poder-lo regenerar sense tornar a entrar les mides.
  Vol un camp nou al model (i `migrateBudget`); el BC3 no el pot portar.
- **Més sistemes:** murs de tancament per capes (amb descompte d'obertures) i cobertes. Les
  cobertes són les més difícils: pendent, carenes, aiguafons i plantes no rectangulars.
- **Geometries que no encaixen:** una piscina amb esglaó, zona fonda en punta o planta no
  rectangular. Ara es genera la rectangular i les línies es retoquen a mà.
