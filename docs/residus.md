# Residus de construcció i demolició

L'aplicació estima els residus que generarà l'obra a partir de les dades que ja porta el fitxer
BC3, i els agrega per **codi LER** (Llista Europea de Residus, Ordre MAM/304/2002). És la
xifra de partida de l'estudi de gestió de residus que demana el **RD 105/2008**.

Es veu a la pestanya **Residus**, al costat de la base de preus i del llistat de recursos.

## D'on surten les dades

De dos registres del BC3 que abans s'ignoraven. Els porten els fitxers del Generador de Preus
de CYPE; les partides creades a mà, no.

> **Del Generador de Preus, només l'enllaç «BC3 estàndard» porta residus.** Els dos enllaços
> que ofereix CYPE per a la mateixa partida no duen el mateix:
>
> | | `_bc3_2_din` (estàndard) | `_bc3_din_u` (Arquímedes) |
> |---|---|---|
> | `~R` (descomposició de residus) | 1 | **cap** |
> | `~X` (propietats) | 17, amb `ler`, `m` i `v` | 3, i són blocs `INFORMACION_GENERADOR` de CYPE |
> | `~M` (amidament) | total 1 | total **0** |
> | Resultat a l'aplicació | 62.722 kg · 45,78 m³ | sense residus i sense amidament |
>
> El fitxer d'Arquímedes és una entrada de banc de preus: hi ha el preu (10.946 €) i el
> descomposat, però ni amidament ni residus. No és cap defecte de lectura; simplement no hi
> són. Contrastat fent el cens de registres dels dos fitxers de la mateixa partida `DCE010`.

### `~R` — descomposició de residus

Lliga una partida amb els components que en generen:

```
~R | PARE | {TIPUS \ FILL \ {PROPIETAT \ VALOR \ [UM] \ } | }
```

**Hi ha dues menes de component, i es calculen diferent.** La norma ho explica a l'apartat
«Compound-element waste»; una partida de demolició fa servir només la primera i una de
construcció, totes dues. Llegint-ne només una, les partides de construcció donaven zero.

**1. Components addicionals** (tipus 1 demolició, 2 excavació, 3 embalatge). No són al `~D`.
La quantitat és directament el seu rendiment:

```
~R|DCE010|1\ruo170101\r\21580\\|1\ruo170504\r\17886\\|…
        └─ 21.580 kg de formigó per unitat de partida
```

**2. Components de col·locació** (tipus 0): el material que es llença en executar. Aquests
**sí** que són al `~D`, i la quantitat surt de combinar les dues coses:

```
quantitat = rendiment del descomposat × factor de residu
```

```
~D|EHS010|…mt07aco010c\1\120…       120 kg d'acer per m³
~R|EHS010|0\mt07aco010c\rp\0.0075\\|   se'n llença el 0,75 % → 0,9 kg
```

La norma anomena el factor `wf` (*waste factor*); CYPE hi escriu `rp`. El parser accepta tots
dos, i igual amb `o`/`r` per al rendiment.

**3. I un tercer camí**: l'embalatge sol penjar **del material**, no de la partida, de manera que
cal multiplicar-lo per la quantitat d'aquell material a la partida:

```
~R|mt07sep010ac|3\re150101\r\0.072\\|   0,072 kg de cartró per separador
                                        × 12 separadors/m³ = 0,864 kg
```

El **TIPUS** classifica l'origen del residu, i no és decoratiu: el reial decret separa la terra
d'excavació de la resta, i els envasos no van al mateix gestor que la runa.

| Tipus | Significat |
|---|---|
| 0 | Col·locació — material que es llença en el procés d'execució |
| 1 | Demolició — runa procedent d'enderrocs |
| 2 | Excavació — terres i pedres |
| 3 | Embalatge — envasos i embolcalls |

La norma anomena la propietat de quantitat `o` (*output*); CYPE hi escriu `r`. El parser
accepta totes dues.

### `~X` — propietats del concepte

El primer `~X`, amb el codi buit, és la **capçalera**: declara què vol dir cada propietat.
Sense ella, `ler`, `m` i `v` no volen dir res per a qui llegeixi el fitxer.

```
~X||ce\Cost energètic\MJ\eCO2\Emissió de CO2\kg\ler\Codi LER\\m\Massa de l'element\kg\v\Volum\m3\|
~X|ruo170101|ler\17 01 01\m\1.000000\v\0.000667\|
```

De les cinc propietats que declara CYPE, ara se'n fan servir tres: `ler`, `m` (massa per unitat
de component) i `v` (volum per unitat). El cost energètic i les emissions de CO₂ **hi són al
fitxer i no es llegeixen encara**: si algun dia cal una petjada de carboni, la matèria primera
ja hi és.

## Com es desa

A `node.waste`, amb les magnituds **primitives**, no amb el producte ja fet:

```jsonc
"waste": [
  {
    "code": "ruo170101",
    "description": "Formigó (formigons, morters i prefabricats).",
    "unit": "kg",
    "type": "1",
    "ler": "17 01 01",
    "quantity": 21580,        // component per unitat de partida, ja resolt
    "massPerUnit": 1,         // kg per unitat de component  (~X m)
    "volumePerUnit": 0.000667, // m³ per unitat de component  (~X v)
    "origin": "direct"        // direct · placement · packaging
  }
]
```

`origin` diu d'on ha sortit la quantitat, i és el que permet **tornar-la a escriure bé**:

| `origin` | Com s'ha calculat | Com s'exporta |
|---|---|---|
| `direct` | rendiment del `~R` de la partida | `tipus\codi\r\quantitat` |
| `placement` | rendiment del `~D` × factor (`wasteFactor`) | `0\codi\wf\factor` |
| `packaging` | rendiment del `~R` del material × quantitat del material | **no s'escriu** |

Un component de col·locació s'ha de reescriure amb el **factor**, no amb la quantitat resolta:
escrivint-hi la quantitat, un altre programa la tornaria a multiplicar pel rendiment.

L'embalatge no es reescriu a la partida perquè el material també és un node de l'arbre —el
parser el crea a partir del `~D`— i ja porta el seu propi `~R`. Escrivint-lo a totes dues
bandes, cada cicle d'exportació hi sumava una altra vegada l'embalatge: 19,99 kg passaven a
21,44, a 22,89…

Guardar-hi directament la massa i el volum ja multiplicats semblava més còmode, però perd els
components declarats amb quantitat zero —els envasos ho són sovint— i llavors en exportar no
es pot refer el `~X`.

## Els tres estats de la pestanya

Un zero pot voler dir dues coses molt diferents, i des de fora no es distingeixen. Per això
cada cas té el seu missatge en comptes d'una taula buida:

| Estat | Quan | Què diu |
|---|---|---|
| Sense dades | cap partida no porta `waste` | Que l'estimació surt del `~R` i el `~X`, i quin dels dos enllaços de CYPE els porta |
| Amb dades però a zero | totes les partides amb dades tenen amidament 0 | Que el fitxer és correcte i el que falta és entrar l'amidament, amb la llista de partides |
| Amb dades | almenys una aporta massa | La taula, i una nota al peu si n'hi ha alguna a zero |

`buildWasteSummary` ho retorna separat: `ambDades` (porten registres), `ambAportacio` (aporten
massa), `senseAmidament` (porten registres però amidament zero) i `sense` (cap dada).

## Com es calcula

```
massa del component al projecte = quantity × massPerUnit × amidament de la partida
volum  del component al projecte = quantity × volumePerUnit × amidament de la partida
```

`buildWasteSummary` (`src/utils/waste.js`) recorre l'arbre i agrega per codi LER, per tipus i
per partida. Rep **`resolvedChapters`**, no `budget.chapters`: si no, les partides amb amidament
vinculat comptarien zero.

En arribar a una partida s'atura i no baixa als seus fills: són els components del descomposat,
no subpartides. El parser els crea com a `items` a partir del `~D`, i baixant-hi els materials
d'una partida de construcció es comptaven com a partides pròpies («9 de 15» quan només n'hi
havia una).

Les files amb massa i volum zero no surten al resum —serien soroll—, però **sí que s'escriuen
al BC3**: el fitxer ha de conservar el que declarava l'original.

### Comprovació amb dades reals

**Demolició.** `DCE010` (demolició completa d'un edifici de 100 m²) dona **62.722 kg i
45,78 m³ per unitat**, repartits en 16 components. La densitat implícita del formigó de runa
surt a 1/0,000667 ≈ 1.500 kg/m³, que és la que toca.

**Construcció.** `EHS010` (pilar de formigó armat) dona **19,99 kg i 0,0152 m³ per m³**:

| Origen | Component | Quantitat | kg |
|---|---|---:|---:|
| col·locació | xapa d'encofrat | 0,32 m² | 10,24 |
| col·locació | matavius PVC | 17,8 U | 3,20 |
| col·locació | formigó | 0,00136 m³ | 3,19 |
| col·locació | acer | 0,9 kg | 0,90 |
| embalatge | paper i cartró | 1,434 kg | 1,43 |
| …i quatre més | | | |
| **Total** | | | **19,99** |

Els dos números s'han comprovat també a mà contra el fitxer, aplicant les fórmules de la norma.

## Exportació

`generateBC3` escriu la capçalera `~X`, un `~X` per component i el `~R` de cada partida, amb
les regles de la taula d'`origin` de més amunt. Comprovat encadenant el cicle tres vegades amb
els dos fitxers: `DCE010` es queda a 62,72 t / 45,79 m³ / 11 codis LER, i `EHS010` a 19,99 kg /
0,02 m³ / 6 codis.

## L'estudi de gestió de residus (RD 105/2008)

El botó **Estudi PDF**, a la pestanya Residus, genera el document de l'article 4.1.a) amb els
seus set apartats, en aquest ordre i amb aquests títols, que és com el revisa qui el visa:

| Apartat | D'on surt |
|---|---|
| 1. Estimació de la quantitat, en tones i m³, codificada segons la LER | **calculat** |
| 2. Mesures per a la prevenció de residus | redactat estàndard |
| 3. Operacions de reutilització, valorització o eliminació | redactat, amb la taula de fraccions |
| 4. Mesures per a la separació en obra (article 5.5) | **calculat** |
| 5. Plànols de les instal·lacions | remissió als plànols del projecte |
| 6. Prescripcions del plec de condicions tècniques particulars | redactat estàndard |
| 7. Valoració del cost previst de la gestió | **calculat** amb les tarifes introduïdes |

L'apartat 5 no es pot generar: els plànols són del projecte. S'hi deixa la remissió, que és el
que la norma demana que hi consti.

### Els llindars de l'article 5.5

La separació en obra és obligatòria quan la quantitat prevista per al total de l'obra supera:

| Fracció | Llindar | Codis LER |
|---|---:|---|
| Formigó | 80 t | 17 01 01 |
| Maons, teules i materials ceràmics | 40 t | 17 01 02, 17 01 03 |
| Metall | 2 t | 17 04 (tota la família) |
| Fusta | 1 t | 17 02 01 |
| Vidre | 1 t | 17 02 02 |
| Plàstic | 0,5 t | 17 02 03 |
| Paper i cartró | 0,5 t | 15 01 01, 20 01 01 |

Són els valors **vigents**: el reial decret en va fixar uns de dobles amb una reducció a partir
del 14 de febrer de 2010, i els que hi ha al codi són els reduïts.

Les **mescles** (17 01 07, 17 09 04…) i tot el que no encaixa en cap fracció van a «Altres
residus i mescles» i **no compten per a cap llindar**: per definició no estan separades, i
comptar-les faria saltar una obligació que la norma no imposa.

### Les tarifes

L'apartat 7 necessita el preu per tona del gestor, que el programa no pot saber. **No s'hi
posen valors per defecte a propòsit**: inventar-se un preu de gestió i que acabi a un projecte
visat seria pitjor que deixar l'apartat pendent. Sense cap tarifa, el document escriu que
l'apartat queda per completar i per què.

### Què és calculat i què és redactat

Els apartats 2, 3, 5 i 6 són text estàndard, pensat perquè l'autor l'ajusti al seu projecte.
El peu de cada pàgina ho diu: *«Estimació calculada a partir dels amidaments del projecte.
Requereix la revisió del tècnic que la signa.»* El document no substitueix el criteri de qui
signa i no ha de pretendre'l.

## Editar-los

Al panell de detall d'una partida hi ha la secció **Residus**, sota la justificació de preu.
S'hi poden afegir components de dues maneres:

- **Del projecte** — obre el selector amb els components de residu que ja hi ha al projecte,
  amb el seu codi LER, massa i volum ja posats. El catàleg no es desa enlloc: `catalegResidus`
  el dedueix de les partides importades. Un cop entra una partida del Generador de Preus, el
  projecte ja té els seus disset components i una partida feta a mà els pot reaprofitar.
  Al selector només hi surten els que aquesta partida encara no porta.
- **Nou** — una fila en blanc per teclejar-hi codi, descripció, codi LER, quantitat per unitat
  de partida, kg per unitat de component i m³ per unitat.

La columna de la dreta mostra la **massa resultant** ja multiplicada per l'amidament de la
partida, que és la manera ràpida de veure si el número té sentit: una densitat absurda salta a
la vista de seguida.

Esborrant l'últim component, el camp `waste` desapareix del node en comptes de quedar-hi com a
llista buida: així la partida torna a comptar com a «sense dades» i no com a «dades a zero».

## Què falta

- Les propietats `ce` i `eCO2`, que ja arriben al fitxer i permetrien una petjada de carboni.
- Que el cost de l'apartat 7 pugui entrar al pressupost com a **capítol independent**, que és
  el que demana la norma; ara surt al document però no al projecte.
