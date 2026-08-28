# Petjada de carboni i cost energètic

L'aplicació calcula l'**energia incorporada** i les **emissions de CO₂** dels materials del
projecte, a partir de dades que el BC3 ja porta i que fins ara s'ignoraven. Es veu a la pestanya
**Petjada**.

> **Què hi entra i què no.** És l'energia incorporada als **materials del descomposat**. No hi
> ha el transport a obra, ni la maquinària, ni la construcció, ni la fase d'ús de l'edifici. No
> és un ACV: és la primera de les seves etapes, la de producte, i només dels materials que
> declaren el valor. La pantalla ho diu, i qualsevol document que se'n derivi ho ha de dir.

## D'on surten les dades

Del registre **`~X`**, el mateix que els residus, però de dues propietats diferents:

```
~X||ce\Cost energètic\MJ\eCO2\Emissió de CO2\kg\ler\Codi LER\\m\Massa\kg\v\Volum\m3\|
~X|mt10haf010ctms|ce\1876.000\eCO2\234.500\|
~X|mt07aco010c|ce\12.720\eCO2\0.530\ler\17 04 05\m\1.000000\v\0.000476\|
```

- **`ce`** cost energètic, en MJ per unitat del concepte
- **`eCO2`** emissions, en kg de CO₂ per unitat del concepte

Un concepte pot tenir les dues coses: el formigó porta `ce`/`eCO2` com a material i `ler`/`m`/`v`
com a residu. Són registres del mateix `~X` i l'exportador els torna a escriure junts.

> **Les porten les partides de construcció, no les de demolició.** El fitxer de `DCE010`
> (demolició completa d'un edifici) declara les dues propietats a la capçalera i no les omple
> enlloc: el que genera una demolició són residus, no energia incorporada. El d'`EHS010` (pilar
> de formigó armat) sí que les porta, als seus vuit materials.

## On es desen

A **`priceDatabase`**, no al node:

```jsonc
"mt10haf010ctms": {
  "code": "mt10haf010ctms",
  "summary": "Formigó HA-25/F/20/XC2, fabricat en central.",
  "unit": "m³",
  "price": 76.88,
  "energy": 1876,    // MJ per m³   (~X ce)
  "co2": 234.5       // kg per m³   (~X eCO2)
}
```

Són propietats **del concepte**, com el preu: un mateix material surt a moltes partides i el
valor no hi canvia. Desar-les al node en duplicaria una còpia per partida, amb el risc que
divergissin. A més, així viatgen soles al fitxer natiu i al desat a Drive.

És la diferència amb els residus, que sí que van al node: allà la quantitat depèn de la relació
entre la partida i el component (`~R`), no només del component.

## El càlcul

```
energia de la partida = amidament × Σ (rendiment del component × ce del component)
CO₂ de la partida     = amidament × Σ (rendiment del component × eCO2 del component)
```

Les línies de percentatge del descomposat (costos indirectes) se salten: no són material i no
incorporen res. La mà d'obra i la maquinària hi són però no declaren `ce` ni `eCO2`, o sigui que
sumen zero sense necessitat de filtrar-les.

`buildCarbonSummary` (`src/utils/carbon.js`) agrega per material, per capítol i per partida, i
rep **`resolvedChapters`**: amb `budget.chapters`, les partides amb amidament vinculat comptarien
zero.

### Comprovació amb dades reals

`EHS010`, pilar rectangular de formigó armat, per m³:

| Material | Rendiment | ce | eCO2 | Energia | CO₂ |
|---|---:|---:|---:|---:|---:|
| Formigó HA-25 | 1,05 m³ | 1.876 MJ | 234,5 kg | 1,97 GJ | 246,23 kg |
| Ferralla | 120 kg | 12,72 MJ | 0,53 kg | 1,53 GJ | 63,60 kg |
| Matavius PVC | 17,8 U | 7,989 MJ | 0,906 kg | 142,20 MJ | 16,13 kg |
| …i cinc més | | | | | |
| **Total** | | | | **3,86 GJ** | **337,04 kg** |

337 kg de CO₂ per m³ de pilar amb 120 kg/m³ de ferralla és de l'ordre que toca, i el
repartiment també: el formigó s'endú tres quartes parts.

## Els tres estats de la pestanya

Els mateixos que els residus, i pel mateix motiu: un zero pot voler dir dues coses.

| Estat | Quan | Què diu |
|---|---|---|
| Sense dades | cap material no declara `ce` ni `eCO2` | Que les porten les partides de construcció i no les de demolició |
| Amb dades però a zero | les partides amb materials amb petjada tenen amidament 0 | Que el que falta és entrar l'amidament |
| Amb dades | almenys una aporta | Les taules, i una nota al peu per les que no compten |

## Exportació

`generateBC3` escriu la capçalera `~X` amb les cinc propietats i, per a cada concepte, només
les que té de veritat: **un zero escrit voldria dir «zero MJ», que no és el mateix que «no se'n
sap res»**. Comprovat encadenant el cicle tres vegades: 46,29 GJ i 4,04 t, sempre iguals.

## Què falta

- Un **document PDF** de la petjada, com el que hi ha per als residus.
- Les **etapes que falten** d'un ACV: transport, posada en obra, ús i fi de vida. El BC3 no en
  porta dades i haurien de venir d'una altra banda.
- Poder **entrar `ce` i `eCO2` a mà** per a materials que no en portin, com ja es pot fer amb
  els residus.
