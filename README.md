# Amidaments (PreuArq BIM)

Aplicació web per a **estat d'amidaments, pressupostos i certificacions d'obra**, pensada per
a estudis d'arquitectura. Importa i exporta **BC3 (FIEBDC-3)**, el format estàndard
d'intercanvi amb Presto, Arquímedes i el Generador de Preus de CYPE.

Funciona íntegrament al navegador: no hi ha servidor, les dades es desen a `localStorage` i,
opcionalment, a Google Drive.

## Què fa

**Pressupost**
- Arbre de capítols, subcapítols i partides, amb reordenació per arrossegament.
- Editor de línies d'amidament (Ud × Llargada × Amplada × Alçada) amb línies d'increment en %.
- **Amidaments vinculats**: una partida pot prendre l'amidament d'una altra, amb factor. En una
  terrassa, solera, pendents, impermeabilització, aïllant i paviment s'entren un sol cop.
- Justificació de preus: descomposat per mà d'obra, materials, maquinària i percentatges.
- Banc de preus del projecte i llistat de recursos agregats de tota l'obra.
- Ajust global de PEM per percentatge o per import objectiu.

**Certificacions**
- Fases d'obra amb quantitats a origen o parcials (model Presto).
- Certificació per percentatge, per quantitat manual o amb detall d'amidament propi.
- Comparativa Anterior / Actual / Origen per partida i per capítol.
- Resum en viu amb el percentatge total certificat, sempre visible mentre s'introdueixen dades.
- Detall per capítols amb pressupost, anterior, període, origen, % i pendent.
- Aprovació i bloqueig de fases.
- **PDF de certificació** per fase: resum per capítols, liquidació amb G.G. / B.I. / IVA,
  import en lletres, signatures i detall per partides opcional.
- Gestió de fases: reanomenar, datar, aprovar, reobrir i eliminar.

**Pensada per a l'obra**
- **Funciona sense cobertura**: un cop carregada, l'aplicació arrenca sense xarxa.
- Entrada de dades amb **coma decimal**, com escriu un teclat català.
- Interfície utilitzable des del mòbil: controls visibles al tacte i objectius prou grans.
- **Desfer i refer** (Ctrl+Z / Ctrl+Maj+Z) sobre tot el projecte.
- **Projectes recents**: crear-ne un de nou ja no destrueix l'anterior.

**Entrada i sortida**
- Importació BC3 des de disc, URL, arrossegament, Google Drive o "Obrir amb…" (PWA).
- Exportació BC3 en Windows-1252, amb fases de certificació.
- PDF de pressupost i amidaments, i PDF de resum amb G.G. / B.I. / IVA i import en lletres.
- Excel amb fórmules vives (els parcials i els totals es recalculen al full).
- Projecte natiu en JSON.

## Posar-ho en marxa

```bash
npm install
npm run dev      # servidor de desenvolupament (Vite)
npm run build    # build de producció a dist/
npm run preview  # servir el build
npm run lint     # ESLint sobre .js i .jsx
```

Google Drive és opcional. Per activar-lo, copia `.env.example` a `.env.local` i omple:

```
VITE_GOOGLE_CLIENT_ID=…
VITE_GOOGLE_API_KEY=…
VITE_GOOGLE_APP_ID=…
```

Sense aquestes variables, l'aplicació demana les credencials en un modal i les desa al
navegador. Detalls a [`docs/google-drive.md`](docs/google-drive.md).

## Desplegament

Push a `main` → GitHub Actions construeix i publica a GitHub Pages sota `/amidaments/`.
Les credencials de Drive s'injecten des dels secrets del repositori.

## Documentació

| Document | Contingut |
|---|---|
| [`docs/arquitectura.md`](docs/arquitectura.md) | Mapa de fitxers, flux de dades, persistència |
| [`docs/model-de-dades.md`](docs/model-de-dades.md) | Estructura de `budget`, nodes, amidaments, preus |
| [`docs/calculs.md`](docs/calculs.md) | Com es calculen quantitats, preus, imports i certificats |
| [`docs/bc3.md`](docs/bc3.md) | Registres BC3 suportats, parser i writer |
| [`docs/certificacions.md`](docs/certificacions.md) | Model de fases, mètodes origen/parcial, aprovació |
| [`docs/exportacions.md`](docs/exportacions.md) | Impressió, PDF, Excel i la seva configuració |
| [`docs/google-drive.md`](docs/google-drive.md) | OAuth, Picker, desat i "Obrir amb…" |
| [`docs/estat-actual.md`](docs/estat-actual.md) | **Bugs coneguts, deute tècnic i properes passes** |

Si comences a treballar en el projecte, llegeix primer
[`docs/estat-actual.md`](docs/estat-actual.md): recull els vint-i-un defectes ja corregits (útils
com a context) i el deute tècnic que continua obert.

## Stack

React 18 · Vite 5 · Tailwind 3 · jsPDF + jspdf-autotable · SheetJS · lucide-react

## Fitxers de referència

`REFORMA ESPORLES_MEDICIONES_AJUSTADO.bc3` és un export real de Presto 8.7 (~500 conceptes)
que serveix de joc de proves per al parser.
