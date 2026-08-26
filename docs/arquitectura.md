# Arquitectura

## Visió general

`amidaments` (nom intern del paquet: `preuarq-bim`, títol de la UI: **PreuArq BIM**) és una
**SPA React 100% client-side**. No hi ha backend propi: totes les dades viuen al navegador
(`localStorage`) i, opcionalment, a Google Drive. Es desplega com a lloc estàtic a GitHub Pages
sota el path `/amidaments/`.

```
Navegador
├── React 18 + Vite 5 + Tailwind 3
├── localStorage ......... persistència primària (autodesat cada 1 s)
├── Google Drive API ..... persistència opcional (JSON i BC3), carregada per <script> dinàmic
├── jsPDF + autoTable .... exportació PDF
├── SheetJS (xlsx) ....... exportació Excel
└── Service Worker ....... shell offline (cache-first bàsic)
```

## Mapa de fitxers

| Fitxer | Línies | Responsabilitat |
|---|---|---|
| `src/main.jsx` | 13 | Entry point. Munta `<App/>` dins de `<DriveConfigProvider>`. |
| `src/App.jsx` | ~4380 | **Monòlit**: tot l'estat, tota la lògica de negoci no extreta i tota la UI. |
| `src/utils/calculations.js` | 154 | Funcions pures de càlcul (quantitats, preus, imports, certificat). |
| `src/utils/bc3Parser.js` | 326 | Parser FIEBDC-3 (importació). |
| `src/utils/googleDrive.js` | 260 | Wrapper de Drive API + Picker + codificació Windows-1252. |
| `src/hooks/useCertification.js` | 163 | Mutacions d'estat de certificacions. |
| `src/hooks/useGoogleDrive.js` | 347 | Cicle de vida OAuth, obrir/desar a Drive, "Open with…". |
| `src/context/DriveConfigContext.jsx` | 44 | Credencials Google (env vars → localStorage). |
| `src/components/Certification/CertificationBar.jsx` | 105 | Selector de fases i aprovació. |
| `src/components/Certification/CertificationSidebar.jsx` | 222 | Panell de certificació d'una partida. |
| `src/components/DriveSettingsModal.jsx` | 145 | Formulari de credencials Google. |
| `public/sw.js` | 22 | Service worker cache-first. |
| `public/manifest.json` | — | PWA + `file_handlers` per a `.bc3`. |

## Estructura interna d'`App.jsx`

`App.jsx` conté cinc components de nivell superior abans del component `App`:

| Component | Línia | Què fa |
|---|---|---|
| `flattenBudget` (funció) | 119 | Aplana l'arbre a files per al PDF d'amidaments. |
| `numberToTextCatalan` (funció) | 72 | Import en lletres, en català, per al peu del pressupost. |
| `PrintView` | 177 | Overlay a pantalla completa: previsualització A4 (amidaments \| resum). |
| `ImportConfirmModal` | 513 | Resolució de codis duplicats en importar. |
| `PemAdjustmentModal` | 549 | Ajust global de PEM per % o per import objectiu. |
| `PrintConfigModal` | 640 | Nivells de jerarquia, G.G. / B.I. / IVA, etc. |
| `ItemCreator` | 758 | Alta de capítol o partida. |
| `App` | 872 | La resta. |

Dins d'`App`, els blocs grans són:

- **Estat i persistència** (872–950): `budget`, `priceDatabase`, autodesat, `notify`.
- **Integració Drive** (985–1050): `useGoogleDrive` + `requireDrive`.
- **Totals derivats** (1085–1093): `budgetTotal`, `certifiedTotal`.
- **Exportacions** (1094–1418): `handleExportPDF`, `handleExportSummaryPDF`, `handleExportXLSX`.
- **Derivats de cerca i recursos** (1419–1651): `filteredChapters`, `filteredPrices`, `aggregatedResources`.
- **Mutacions de preus** (1653–1780): `adjustPem`, `updateGlobalPrice`.
- **Arbre: alta, clonatge, fusió** (1781–1897).
- **Exportació BC3** (1898–2175): `generateBC3`, `handleExportBC3`.
- **Obertura/importació** (2175–2570): fitxers locals, URL (proxy CORS), drag&drop, paste, PWA `launchQueue`.
- **Mutacions de node** (2569–2870): amidaments, descripcions, unitats, esborrat, reordenació, descomposats.
- **Renderitzadors** (2876–3500): justificació de preus, files de taula, recursos, banc de preus.
- **JSX principal** (3500–4380): capçalera, barra de certificacions, taula, sidebar de detall, modals.

## Flux de dades

```
                 ┌──────────────┐
  BC3 / JSON ───▶│ processBC3Data│──▶ startImportProcess ──▶ (duplicats?) ──▶ finalizeImport
   (disc, URL,   └──────────────┘                              │                    │
    Drive, PWA)                                    ImportConfirmModal               ▼
                                                                          setBudget / setPriceDatabase
                                                                                    │
        ┌───────────────────────────────────────────────────────────────────────────┤
        ▼                                                                           ▼
   useState(budget)  ◀── mutacions immutables (updateX, addX, deleteX, handleReorder)
   useState(priceDatabase) ◀── updateGlobalPrice / adjustPem
        │
        ├─▶ useEffect (debounce 1 s) ─▶ localStorage
        ├─▶ useMemo ─▶ budgetTotal, certifiedTotal, aggregatedResources, filtered*
        └─▶ render ─▶ taula, sidebar, PrintView
                          │
                          └─▶ handleExportPDF / handleExportSummaryPDF / handleExportXLSX / generateBC3
```

**Patró de mutació dominant.** Gairebé totes les mutacions segueixen aquest esquema recursiu,
repetit una dotzena de vegades a `App.jsx` i quatre més a `useCertification.js`:

```js
const updateX = (itemId, ...args) => {
    const updateInTree = (nodes) => nodes.map(node => {
        if (node.id === itemId) return { ...node, /* canvi */ };
        return {
            ...node,
            subChapters: updateInTree(node.subChapters || []),
            items: updateInTree(node.items || [])
        };
    });
    setBudget(prev => ({ ...prev, chapters: updateInTree(prev.chapters) }));
};
```

És O(n) per pulsació de tecla i recrea tot l'arbre. Amb projectes grans (el BC3 de mostra
té ~500 conceptes) encara va bé, però és el primer candidat a refactor si es nota lentitud.

## Persistència

| Clau de `localStorage` | Contingut | On es defineix |
|---|---|---|
| `amidaments_budget` | Objecte `budget` sencer (arbre + certificacions) | `App.jsx:873`, `901` |
| `amidaments_prices` | Objecte `priceDatabase` | `App.jsx:885`, `901` |
| `amidaments_drive_config` | `{ clientId, apiKey, appId }` | `DriveConfigContext.jsx` |

L'autodesat és un `useEffect` amb `setTimeout` de 1000 ms que es reinicia a cada canvi
(`App.jsx:901`), més un `beforeunload` de seguretat (`App.jsx:910`). L'estat `lastSaved`
s'actualitza però **no es mostra enlloc** a la UI.

## Desplegament

`.github/workflows/deploy.yml` construeix i publica a GitHub Pages en cada push a `main`.
Les credencials de Drive s'injecten com a secrets del repositori
(`VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_APP_ID`).
`vite.config.js` fixa `base: '/amidaments/'`, que ha de coincidir amb `start_url` del
manifest i amb les rutes cachejades al service worker.
