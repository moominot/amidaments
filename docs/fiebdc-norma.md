# La norma FIEBDC-3, en el que ens afecta

Extracte de treball de l'**especificació oficial FIEBDC-3/2020** (versió anglesa, 70 pàgines),
descarregada de [fiebdc.es](https://www.fiebdc.es/formato-fiebdc/):
[Standard-exchange-format-FIEBDC-3-2020v2_eng-.pdf](https://www.fiebdc.es/web2/datos/uploads/Standard-exchange-format-FIEBDC-3-2020v2_eng-.pdf).

Es guarda aquí perquè cada vegada que hem hagut de decidir com escriure un registre hem acabat
tornant al PDF, i dues vegades hem donat per bo el contrari del que hi diu (veure §23 i §24 de
`estat-actual.md`). Les cites són literals, traduïdes; **davant de qualsevol dubte mana el PDF,
no aquest document**.

## Regles generals

- Text pla; registres separats per `~`, camps per `|`, subcamps per `\`.
- «El registre ha de contenir tots els separadors de camp, encara que no continguin
  informació. No cal posar els terminadors dels camps posteriors a l'últim camp amb dades.»
- «Un camp buit es considera SENSE INFORMACIÓ, no informació nul·la.»
- «Per invalidar un camp numèric hi ha d'aparèixer explícitament el valor 0 (zero).»
- Els números van **sense separador de milers** i amb el punt com a separador decimal. (A la
  pràctica, tot el programari espanyol accepta la coma i és el que escrivim; el parser accepta
  totes dues.)
- El joc de caràcters el declara el camp corresponent del `~V`: `850`/`437` per a DOS o `ANSI`
  per a Windows (Windows-1252). Nosaltres escrivim `ANSI`.

## `~V` — propietat i versió

```
~V | [PROPIETAT] | [VERSIO_FORMAT][\DDMMYYYY] | [PROGRAMA_EMISSOR]
   | [CAPÇALERA]\{ETIQUETA_IDENTIFICACIO\} | [JOC_CARÀCTERS] | [COMENTARI]
   | [TIPUS_INFORMACIO] | [NUM_CERTIFICACIO] | [DATA_CERTIFICACIO] | [URL_BASE] |
```

**TIPUS_INFORMACIO** («índex del tipus d'informació a intercanviar»):

| Valor | Significat |
|---|---|
| 1 | Base de dades |
| 2 | Pressupost |
| 3 | **Cost real** (certificació) |
| 4 | Actualització de base de dades |

- **NUM_CERTIFICACIO**: «valor numèric que indica l'ordre de la certificació (primera, segona,
  tercera…). Només és rellevant quan el tipus d'informació és Certificació.»
- **DATA_CERTIFICACIO**: la data d'aquella certificació, en el mateix format `DDMMYYYY`.

Compte amb l'ordre dels camps: fins a l'agost de 2026 aquesta aplicació escrivia
`~V|FIEBDC-3/2016|PreuArq BIM|ANSI`, és a dir, la versió al camp de la propietat, el programa
al de la versió i el joc de caràcters al del programa.

## Certificacions: un fitxer per certificació

> «Per recollir diverses certificacions alhora, el nom del fitxer que conté el cost real ha de
> ser el mateix que el del pressupost, afegint-hi (concatenant) **"#certification NNNN"**, on
> NNNN seria el número de certificació. Es recomana desar el fitxer a la mateixa carpeta que la
> del pressupost. **Això permetrà importar alhora un pressupost i totes les seves
> certificacions (o només les seleccionades).** El fitxer que conté la certificació és idèntic
> al d'un pressupost i només se'n diferencia pel registre `~V`, que contindrà la certificació i
> el número i la data de certificació. Conté tota la informació (`~D`, `~M`, `~C`, `~T`), i no
> només els registres de les unitats certificades.»

Tres coses que se'n dedueixen i que fan de base al que fa l'aplicació:

1. **No hi ha cap obligació d'exportar-les totes.** La norma parla explícitament d'importar
   «només les seleccionades». Exportar la certificació activa és conforme; el que ha de ser
   correcte és el nom i el `~V`.
2. El fitxer és **complet**, no un diferencial: hi van tots els capítols, partides, preus i
   textos, amb els amidaments certificats al lloc dels amidaments del projecte.
3. El número de la certificació el porta el `~V`, no el nom del fitxer: el nom és una
   convenció perquè un programa les trobi totes juntes.

## `~M` — amidaments

```
~M | [CODI_PARE\]CODI_FILL | {POSICIO\} | AMIDAMENT_TOTAL
   | {TIPUS \ COMENTARI{#ID_BIM} \ UNITATS \ LONGITUD \ AMPLADA \ ALÇADA \}
   | [ETIQUETA] |
```

- **AMIDAMENT_TOTAL**: «ha de coincidir amb el rendiment del registre `~D` corresponent.
  Incorpora la suma del producte d'unitats, longitud, amplada i alçada o el resultat de les
  expressions de cada línia; **en llegir aquest registre aquest valor es recalcularà**.»
- **TIPUS** és el primer subcamp de cada línia i **no és la fase**: «normalment aquest subcamp
  estarà buit». Els valors definits:

  | Valor | Significat |
  |---|---|
  | 1 | Subtotal parcial (subtotal de les línies des de l'últim subtotal) |
  | 2 | Subtotal acumulat (subtotal de totes les línies des del primer subtotal) |
  | 3 | Expressió algebraica al subcamp COMENTARI |

- **POSICIO**: «hauria d'especificar-se sempre en l'intercanvi d'un pressupost complet i
  estructurat, i indicarà el camí complet de l'amidament: 3\5\2 vol dir capítol 3, subcapítol 5
  d'aquell capítol, partida 2 d'aquell subcapítol.» **Nosaltres la deixem buida**: els
  amidaments s'agrupen per concepte i un mateix codi pot sortir a més d'un capítol, cas en què
  no hi ha una posició única per declarar.
- **UNITATS, LONGITUD, AMPLADA, ALÇADA**: «si alguna magnitud no existeix, el camp es deixarà
  buit».

## `~F` — documents adjunts

```
~F | CODI_CONCEPTE | {TIPUS \ {FITXER.EXT;} \ [DESCRIPCIO] \ } | [URL_EXT] |
```

**No té res a veure amb les certificacions.** Fins a l'agost de 2026 hi escrivíem la declaració
de les fases (`~F|num|data|nom`); ara només es llegeix, i únicament quan el registre en té la
forma exacta, per no trencar els projectes exportats abans (veure `bc3Parser.js`).

## `~Q` — plecs de condicions

```
~Q | <CODI_CONCEPTE\> | {CODI_SECCIO_PLEC \ CODI_PARAGRAF \ {AMBIT;}\} |
```

Tampoc no és el registre de quantitats. L'exportador n'escrivia `~Q|codi|quantitat|fase`.

## Altres registres de la norma que no fem servir

`~K` (coeficients i decimals), `~L` (plecs), `~P` (paramètrics), `~W` (entitats), `~A`
(tesaurus), `~B` (canvi de codi), `~G`/`~E`/`~O`, `~N` (afegir amidaments, com `~M` però sumant
en comptes de substituir) i `~I` (fitxer BIM). El `~K` sí que s'escriu, amb valors fixos.

## Annexos que poden fer falta si algun dia s'amplia

| Annex | Contingut |
|---|---|
| 2 | Criteris de les expressions algebraiques del `~M` tipus 3 |
| 5 | Àmbits territorials |
| 6 | Monedes (ISO 4217) |
| 9 | Referències IFC ↔ bancs de preus |
