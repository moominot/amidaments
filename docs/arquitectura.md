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
| `src/utils/measurementRefs.js` | — | Resolució de les línies d'amidament vinculades. |
| `src/utils/bc3Parser.js` | 380 | Parser FIEBDC-3 (importació). Llegeix el `~V` per saber si el fitxer és un pressupost o una certificació. |
| `src/utils/bc3Writer.js` | 215 | Escriptor FIEBDC-3. Un fitxer per document: pressupost o certificació. |
| `src/utils/projectFile.js` | 68 | Identitat del fitxer natiu `.amid`: extensions, MIME, serialització i lectura. |
| `src/utils/carbon.js` | 175 | Petjada de carboni i cost energètic, agregats per material, capítol i partida. |
| `src/utils/waste.js` | 152 | Agregació dels residus per codi LER, per tipus i per partida. |
| `src/components/PriceBankPicker.jsx` | 160 | Selector d'un concepte del banc de preus, compartit pel descomposat, la creació de partides i els residus. |
| `src/utils/wasteStudy.js` | 108 | Fraccions i llindars de l'article 5.5 del RD 105/2008, i valoració del cost. |
| `src/utils/wasteStudyPdf.js` | 300 | L'estudi de gestió de residus en PDF, amb els set apartats. |
| `src/utils/corsProxy.js` | 95 | Descàrrega d'un BC3 des d'una URL, amb la cadena de proxys CORS. |
| `src/utils/googleDrive.js` | 260 | Wrapper de Drive API + Picker + codificació Windows-1252. |
| `src/hooks/useCertification.js` | 163 | Mutacions d'estat de certificacions. |
| `src/hooks/useGoogleDrive.js` | 347 | Cicle de vida OAuth, obrir/desar a Drive, "Open with…". |
| `src/context/DriveConfigContext.jsx` | 44 | Credencials Google (env vars → localStorage). |
| `src/components/Certification/CertificationBar.jsx` | 105 | Selector de fases i aprovació. |
| `src/components/Certification/CertificationSidebar.jsx` | 222 | Panell de certificació d'una partida. |
| `src/components/DriveSettingsModal.jsx` | 145 | Formulari de credencials Google. |
| `public/sw.js` | 166 | Service worker: precache del shell i dels bundles, i recepció dels fitxers compartits des d'Android. |
| `public/manifest.json` | — | PWA + `file_handlers` (`.amid`, `.json`, `.bc3`) i `share_target`. |
| `test/` | 113 tests | Vitest sobre els càlculs, el parser i l'escriptor. Veure [`docs/tests.md`](tests.md). |

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
- **Exportació BC3** (~1990–2035): `seleccioBC3`, `documentBC3`, `handleExportBC3`. L'escriptura viu a `utils/bc3Writer.js`.
- **Obertura/importació** (~2070–2570): `obreFitxer` (punt d'entrada únic de qualsevol fitxer), URL (proxy CORS), drag&drop, paste, `launchQueue` i fitxers compartits.
- **Mutacions de node** (2569–2870): amidaments, descripcions, unitats, esborrat, reordenació, descomposats.
- **Renderitzadors** (2876–3500): justificació de preus, files de taula, recursos, banc de preus.
- **JSX principal** (3500–4380): capçalera, barra de certificacions, taula, sidebar de detall, modals.

## Amidaments vinculats

Una línia d'amidament pot prendre el valor d'una altra partida (`refCode` + `factor`). Perquè
això no obligui a ensenyar a resoldre vincles a la dotzena de funcions de `calculations.js`
—cadascuna amb un paràmetre nou que es pot oblidar, que és el parany que ja ha causat
defectes aquí— **es resol abans de calcular**:

```
budget.chapters            ← el que s'edita i es desa (amb els vincles)
      │
      ├─ resolveMeasurementRefs()   useMemo a App.jsx
      ▼
resolvedChapters           ← el que es mostra, es calcula i s'exporta
```

L'arbre resolt té les línies vinculades convertides en línies normals amb la quantitat ja
calculada, de manera que tot el codi existent hi funciona sense canvis. Es fa servir a la
taula, al panell de detall, als totals, al resum de certificació, al PDF, a l'Excel i al BC3.
Les mutacions continuen anant contra `budget.chapters`, per `node.id`.

El vincle pot apuntar al **total** d'una partida (`refCode`) o a **una línia concreta** seva
(`refCode` + `refLineId`). Per això es memoritzen les línies resoltes de cada partida i no
només el seu total.

La resolució detecta referències circulars (es compten com a 0), codis inexistents, línies
d'origen esborrades, i compta quantes línies apunten a cada codi per poder avisar abans
d'esborrar la partida d'origen. La detecció de cicles va per codi, no per línia: és
conservadora, de manera que pot marcar com a circular un encreuament entre línies diferents de
dues partides que en realitat no ho seria. Els
nodes sense vincles es retornen per referència, de manera que l'arbre resolt gairebé no ocupa
memòria i els `useMemo` que en depenen segueixen essent útils.

**El vincle només viu al format natiu.** JSON, Drive i projectes recents el conserven; el BC3
l'aplana a la quantitat calculada, perquè la norma no té cap manera de representar-ho.

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

## Obrir des del sistema operatiu

L'aplicació es pot obrir amb un fitxer sense passar pel botó d'obrir, però el mecanisme no és
el mateix a cada plataforma:

| Plataforma | Mecanisme | Com hi arriba el fitxer |
|---|---|---|
| Escriptori (Chrome, Edge) | **File Handling API** | `file_handlers` al manifest → `window.launchQueue` |
| Android (Chrome) | **Web Share Target** | `share_target` al manifest → POST al service worker → `?compartit=1` |
| iOS, iPadOS | — | Safari no en suporta cap: només obrir des de dins de l'aplicació |

La File Handling API només existeix a Chromium d'escriptori, i per això al mòbil s'hi arriba
pel menú de compartir: l'aplicació instal·lada surt a la llista i el sistema li envia el fitxer
en un POST. Un POST no el pot llegir la pàgina, així que l'intercepta `public/sw.js`, en desa
el fitxer al cache `amidaments-compartit` i redirigeix a `/amidaments/?compartit=1`; l'aplicació
el recull en muntar-se, el buida del cache i neteja el paràmetre de la URL perquè recarregar no
el torni a obrir.

Els dos camins acaben a **`obreFitxer`** (`App.jsx`), que també és on van a parar el selector de
fitxers i l'arrossegament. Abans cadascun feia la seva pròpia comprovació —i la de la File
Handling API mirava un camp `projectMetadata` que no s'escrivia enlloc, de manera que obrir un
projecte des del sistema no feia absolutament res i tampoc no avisava.

### El fitxer natiu: `.amid`

El projecte és JSON, però es desa com a **`.amid`** amb el tipus MIME
`application/x-amidaments+json`. El motiu és justament l'associació: el `.json` se'l disputen
l'editor de text, el navegador i mig sistema operatiu, i declarar-lo a `file_handlers` no dona
una associació neta. Els projectes desats abans porten `.json` i es continuen obrint;
`src/utils/projectFile.js` és qui ho sap tot d'això.

## Desplegament

`.github/workflows/deploy.yml` construeix i publica a GitHub Pages en cada push a `main`.
Les credencials de Drive s'injecten com a secrets del repositori
(`VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_APP_ID`).
`vite.config.js` fixa `base: '/amidaments/'`, que ha de coincidir amb `start_url`, `action`
dels `file_handlers` i `action` del `share_target` al manifest, i amb les rutes del service
worker.
