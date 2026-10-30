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
AMIDAMENTS-CAD  1  <dibuix>
<tipus>  <tancada 0|1>  <llargada>  <àrea>  <capa>  <bloc>  <handle>
```

Les xifres arriben ja en metres i m²: el LISP pregunta les unitats del dibuix (per defecte,
les d'`INSUNITS`) i les converteix. El parser accepta també coma decimal i BOM.

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
