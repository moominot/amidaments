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

## Què falta

- El **document d'estudi de gestió de residus** del RD 105/2008 sencer: mesures de prevenció,
  operacions de valorització, plec i pressupost de gestió. Ara mateix hi ha l'estimació, que
  n'és l'apartat primer i el que costa de calcular.
- Poder **editar** els residus d'una partida, o afegir-los a una partida creada a mà.
- Les propietats `ce` i `eCO2`, que ja arriben al fitxer.
