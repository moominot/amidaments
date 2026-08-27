# Residus de construcció i demolició

L'aplicació estima els residus que generarà l'obra a partir de les dades que ja porta el fitxer
BC3, i els agrega per **codi LER** (Llista Europea de Residus, Ordre MAM/304/2002). És la
xifra de partida de l'estudi de gestió de residus que demana el **RD 105/2008**.

Es veu a la pestanya **Residus**, al costat de la base de preus i del llistat de recursos.

## D'on surten les dades

De dos registres del BC3 que abans s'ignoraven. Els porten els fitxers del Generador de Preus
de CYPE; les partides creades a mà, no.

### `~R` — descomposició de residus

Lliga una partida amb els components que en generen, i amb quina quantitat:

```
~R | PARE | {TIPUS \ FILL \ {PROPIETAT \ VALOR \ [UM] \ } | }
```

```
~R|DCE010|3\re150101\r\0\\|1\ruo170101\r\21580\\|1\ruo170504\r\17886\\|…
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
    "quantity": 21580,        // component per unitat de partida
    "massPerUnit": 1,         // kg per unitat de component  (~X m)
    "volumePerUnit": 0.000667 // m³ per unitat de component  (~X v)
  }
]
```

Guardar-hi directament la massa i el volum ja multiplicats semblava més còmode, però perd els
components declarats amb quantitat zero —els envasos ho són sovint— i llavors en exportar no
es pot refer el `~X`.

## Com es calcula

```
massa del component al projecte = quantity × massPerUnit × amidament de la partida
volum  del component al projecte = quantity × volumePerUnit × amidament de la partida
```

`buildWasteSummary` (`src/utils/waste.js`) recorre l'arbre i agrega per codi LER, per tipus i
per partida. Rep **`resolvedChapters`**, no `budget.chapters`: si no, les partides amb amidament
vinculat comptarien zero.

Les files amb massa i volum zero no surten al resum —serien soroll—, però **sí que s'escriuen
al BC3**: el fitxer ha de conservar el que declarava l'original.

### Comprovació amb dades reals

La partida `DCE010` del Generador de Preus (demolició completa d'un edifici de 100 m²) dona
**62.722 kg i 45,78 m³ per unitat**, repartits en 16 components. La densitat implícita del
formigó de runa surt a 1/0,000667 ≈ 1.500 kg/m³, que és la que toca: el model quadra.

## Exportació

`generateBC3` escriu la capçalera `~X`, un `~X` per component i el `~R` de cada partida, de
manera que el cicle exportar → reimportar conserva l'estimació. Comprovat encadenant-lo tres
vegades: 62,72 t, 45,79 m³ i 11 codis LER, sempre iguals.

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

## Què falta

- Poder **editar** els residus d'una partida, o afegir-los a una partida creada a mà.
- Les propietats `ce` i `eCO2`, que ja arriben al fitxer i permetrien una petjada de carboni.
- Que el cost de l'apartat 7 pugui entrar al pressupost com a **capítol independent**, que és
  el que demana la norma; ara surt al document però no al projecte.
