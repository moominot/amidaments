# Amidament des d'AutoCAD

L'ordre `AMIDA` del LISP `public/cad/amidaments.lsp` copia al porta-retalls les entitats
seleccionades. Amb una partida seleccionada a l'aplicació, **Ctrl+V** (o el botó *Enganxa CAD*
del detall d'amidament) hi afegeix una línia per entitat. El LISP es descarrega des del
mateix detall d'amidament (enllaç *LISP*) i es publica a `/amidaments/cad/amidaments.lsp`.

## Repartiment de la feina

El LISP **no sap a quina partida anirà** el que copia, així que exporta les magnituds en brut i
és `utils/cadPaste.js` qui decideix què se'n fa segons la unitat de la partida:

| Unitat | Entitat tancada | Entitat oberta | Sense llargada (bloc, text…) |
|---|---|---|---|
| m2 | l'àrea a Ll | la llargada a Ll, **Al pendent** | descartada |
| m3 | l'àrea a Ll, **Al pendent** | la llargada a Ll, **Am i Al pendents** | descartada |
| m | el perímetre a Ll | la llargada a Ll | descartada |
| ud | 1 | 1 | 1 |

Qualsevol altra unitat (kg, h, %…) es rebutja amb un avís. La descripció de la línia és el nom
del bloc si l'entitat n'és un, i si no la capa.

Les dimensions pendents es marquen a la línia amb `needsHeight` / `needsWidth` i la cel·la
surt en groc mentre valgui zero. **Mentre és a zero, el parcial la compta com a 1** (és com
funciona `calcMeasureTotal`), de manera que la línia ja suma la llargada: l'avís és el que
impedeix que es quedi així. Els dos camps no surten al BC3; el writer només escriu les quatre
dimensions.

## Format del porta-retalls

Text tabulat, CRLF, amb una capçalera i una fila per entitat:

```
AMIDAMENTS-CAD  2  <dibuix>
<tipus>  <tancada 0|1>  <llargada>  <àrea>  <capa>  <bloc>  <handle>  <rètols>
```

La versió 1 no tenia la columna de rètols i es continua llegint. Els rètols són els textos
(`TEXT` i `MTEXT`) que tenen el punt d'inserció dins de l'entitat tancada, separats per « | »;
el parser en treu els codis de format dels MTEXT (`netejaMtext`) i `nomDeRetols` en tria el nom
de la sala: el primer amb lletres que no sigui només una superfície («12,5 m²»).

Les xifres arriben ja en metres i m²: el LISP pregunta les unitats del dibuix (per defecte,
les d'`INSUNITS`) i les converteix. El parser accepta també coma decimal i BOM.

## Del CAD a un sistema, per zones

Enganxant la sortida del LISP **sense cap partida seleccionada** s'obre el quadre «Del CAD a un
sistema» (`components/CadSistemaModal.jsx`, `utils/cadSistemes.js`):

1. **Vincle**: si alguna entitat ja és d'una zona del projecte (cada instància inserida així
   recorda els `handle` de les seves entitats a `instancia.cad`), es mostren els paràmetres que
   canvien amb les mides d'ara i es poden actualitzar d'un cop. Si d'una zona falten entitats, es
   compta amb les que hi ha i s'avisa.
2. Amb les entitats que no són de cap zona: **el sistema** de la galeria, **com s'agrupen** (pel
   rètol de dins, sense distingir majúscules; una zona per entitat; totes en una; per capa) i
   **d'on surt cada paràmetre**: àrea, perímetre, llargada de les obertes, nombre d'entitats o el
   valor del sistema (comú a totes les zones). Per defecte s'intueix pel nom (`A` → àrea, `P` →
   perímetre) i després es recorda per sistema.
3. **Taula de zones**: nom i valors editables, amb el total i les condicions de cada una. Una
   zona es pot descartar (la paperera) i no s'insereix; «recupera-les» les torna totes.
4. **Insereix**: una instància per zona, amb paràmetres propis (`A`, `A_2`...) i línia de zona.
   Les partides que comparteixen s'ajunten abans d'inserir (`fusionaArbres`), de manera que una
   partida té les línies de totes les zones, cadascuna amb el seu títol.

**La mateixa polilínia per a diversos sistemes.** Una sala pot tenir paviment, fals sostre i
pintura: s'enganxen les mateixes entitats una vegada per sistema. Una entitat només és «ja feta»
per al sistema del qual ja és una zona (`entitatsLliures`, per l'id de la galeria o, si no en
té, pel nom del sistema); per a un altre sistema surt com a lliure. En canvi, actualitzar amb el
dibuix modificat posa al dia les zones de tots els sistemes que surten d'aquelles entitats.

Si el sistema té partides amb el text o el preu variables, com que les zones les comparteixen,
agafen els valors de la primera; el quadre ho avisa.

**Trames i illes.** L'àrea d'una `HATCH` ja és la neta: les illes (un pilar, un pati) es
descompten. El LISP en llegeix també el perímetre de les dades DXF de la trama (no cal que sigui
associativa): el de tots els contorns, l'exterior i els de les illes, que és el que es vol per a
un sòcol. Si se seleccionen alhora la trama i la polilínia d'una mateixa sala, es compten dues
vegades.

### Amb l'assistent

La sortida del LISP també es pot enganxar al camp de text del xat de l'assistent: no s'obre el
quadre, es guarda com a «enganxat del CAD» (`cad1`, `cad2`...) i al model li arriba com una
taula (`resumCad`) amb l'àrea, el perímetre o la llargada, la capa i el nom de sala de cada
entitat. Les eines `galeria_sistemes`, `insereix_zones_cad` i `actualitza_zones_cad` fan el
mateix que el quadre (veure `docs/assistent.md`). L'enganxat global de l'aplicació no actua
dins del panell de l'assistent (`data-assistent-adjunts`).

## Detalls del LISP

- Llargada amb `vlax-curve-getDistAtParam` sobre `LINE`, `ARC`, `CIRCLE`, `ELLIPSE`,
  `SPLINE`, `LWPOLYLINE` i `POLYLINE`. Àrea amb `vlax-curve-getArea` si són tancades, i amb la
  propietat `Area` per a `HATCH` i `REGION`.
- Una polilínia oberta amb el darrer vèrtex damunt del primer es compta tancada: és un error
  de dibuix habitual i qui amida la vol com a superfície.
- El porta-retalls s'escriu amb l'objecte COM `htmlfile` i, si falla, amb PowerShell
  (`Set-Clipboard`) a partir d'un fitxer temporal. És només Windows.
- Les cadenes que el LISP escriu a la línia d'ordres van sense accents: les versions antigues
  d'AutoCAD llegeixen els `.lsp` en ANSI.
- Els rètols es busquen a tots els textos de l'espai actual amb `ssget "_X"` (una finestra només
  trobaria el que es veu a la pantalla) i la prova del raig sobre un polígon que segueix la
  corba (els vèrtexs de les polilínies, 64 punts a la resta) o el contorn exterior de la trama.
  Abans, una caixa envolupant descarta els textos de fora, que en un plànol gran són milers.
- Perímetre de les trames: contorns polilínia (amb curvatures) i vores de recta i d'arc. Les
  vores d'el·lipse i de spline no s'hi sumen; amb una spline es deixa de llegir aquell contorn.
- Els `TEXT` i `MTEXT` seleccionats no surten a la llista: només fan de rètol. El parser també
  els descarta, per als enganxats del LISP antic.
- Tot el que és nou a la v2 (rètols, textos) va dins de `vl-catch-all-apply`: si falla, AMIDA
  continua i deixa els rètols buits. Compte amb `=` i `/=`: en AutoLISP només són per a números
  i textos; per comparar T i nil, `eq`.
- **La versió 2 no s'ha pogut provar en un AutoCAD** des d'aquí: els tests en proven el format i
  tot el que passa a l'aplicació, no el LISP mateix.
