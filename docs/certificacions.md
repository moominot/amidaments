# Certificacions d'obra

L'aplicació té dos modes, commutats des del capçal (`appMode`):

- **`budget`** — edició del pressupost (amidaments previstos, preus, descomposats).
- **`certification`** — estat d'execució: quant s'ha fet realment de cada partida, per fases.

En mode certificació la taula principal canvia de columnes i el capçal mostra
**Total Certificat** en comptes de **Total PEM**.

## Model mental (estil Presto)

Una **certificació** (o *fase*) és una foto de l'obra en una data. Cada partida hi té una
quantitat executada. Dues maneres d'introduir-la, per fase:

| `method` | Què s'introdueix | Com es calcula l'acumulat |
|---|---|---|
| `origin` (per defecte) | L'**acumulat a origen** | és el valor introduït |
| `partial` | La quantitat **del període** | suma de totes les fases anteriors + l'actual |

La UI sempre mostra les tres xifres: **Anterior**, **Actual** (període) i **Origen** (acumulat),
amb el percentatge sobre la quantitat pressupostada.

> Commutar el mètode d'una fase **reinterpreta** les dades ja introduïdes, no les converteix.
> Fer-ho a mitja obra canvia els imports certificats.

## Recorregut per la UI

1. **Barra de certificacions** (`CertificationBar`, visible només en mode certificació):
   pestanyes de fases, botó "Nova", commutador `A ORIGEN` / `PARCIAL` i botó **Aprovar FASE**.
2. **Taula principal**: per cada partida, Previst / Ant.% / Act.% / Cert. Origen / % / Import.
3. **Sidebar** (`CertificationSidebar`), en seleccionar una partida:
   - resum Anterior / Actual / Origen,
   - import certificat (a origen o del període, segons el mètode),
   - accions ràpides **25% / 50% / 100%**,
   - **Copiar Amidament Pressupost** (clona les línies del pressupost a la fase),
   - camp de **percentatge** i camp de **quantitat manual**,
   - **detall d'amidament de la certificació** (mateixes columnes Ud/Ll/Am/Al que el pressupost).

## Aprovació i bloqueig

`approveCertification(certId)` posa `approved: true`. A partir d'aquí `CertificationSidebar`
amaga tots els controls d'edició i mostra un cartell de fase bloquejada.

**El bloqueig és només visual.** No hi ha cap comprovació d'`approved` a `useCertification.js`:
qualsevol crida a `updateCertificationQty`, `addCertificationLine`, etc. modificarà una fase
aprovada sense queixar-se. Tampoc hi ha manera de desaprovar-la des de la UI (cal editar el
JSON). Si es vol un bloqueig real, el lloc és el hook, no el component.

## Precedència: quantitat manual vs detall

`node.certifications[certId]` pot tenir `quantity` i/o `measurements`:

- si `measurements` té línies → es calcula a partir d'elles i s'ignora `quantity`;
- si no → s'usa `quantity`.

`updateCertificationQty` (i per tant els botons 25/50/100% i el camp de percentatge)
**buida `measurements`** en escriure una quantitat manual. És deliberat, i la UI ho indica
amb la nota "El valor manual preval sobre el detall d'amidament".

## Relació amb BC3

Les certificacions viatgen en BC3 com a **fases**:

- a l'exportació, cada certificació genera un `~F|<n>|<data>|<nom>`, i les seves línies
  d'amidament s'escriuen dins del `~M` amb el número de fase al primer camp de cada bloc;
- a la importació, cada `~F` es converteix en un objecte `Certification` dins de `phases`,
  i les línies `~M` amb fase > 0 van a `node.certifications[<id de la fase>]`.

> **Bug conegut:** el pont entre `phases` (el que retorna el parser) i `budget.certifications`
> (el que espera l'aplicació) no està connectat. Veure `docs/estat-actual.md` § 2.

## On és cada cosa

| Peça | Fitxer |
|---|---|
| Càlcul de quantitats i imports certificats | `src/utils/calculations.js` |
| Mutacions d'estat (qty, línies, %, aprovar, mètode) | `src/hooks/useCertification.js` |
| Barra de fases | `src/components/Certification/CertificationBar.jsx` |
| Panell de detall | `src/components/Certification/CertificationSidebar.jsx` |
| Creació de fases, `activeCertId`, `certifiedTotal` | `src/App.jsx:1055`, `1089` |
| Columnes de la taula en mode certificació | `src/App.jsx:3210`–`3260` |
