# Integració amb Google Drive

Opcional. Sense credencials l'aplicació funciona igual, només amb disc local i `localStorage`.

## Credencials

`DriveConfigContext` resol les credencials en aquest ordre:

1. Variables d'entorn de Vite (`VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`,
   `VITE_GOOGLE_APP_ID`) — les injecta el workflow de GitHub Pages des dels secrets del repo.
2. `localStorage['amidaments_drive_config']` — el que l'usuari introdueix a
   `DriveSettingsModal`.

Nota: el pas 1 només s'accepta si hi ha `clientId` **i** `apiKey`, però `hasCredentials`
exigeix a més `appId`. Un desplegament amb només dues de les tres variables acabarà obrint
el modal de configuració igualment.

Per crear-les: projecte a Google Cloud Console amb **Drive API** i **Picker API** activades,
credencials OAuth 2.0 de tipus aplicació web, amb l'origen del desplegament autoritzat.

## Àmbits OAuth

`src/utils/googleDrive.js`:

```
drive.file                  → només fitxers creats o oberts per l'app
drive.metadata.readonly
userinfo.profile
userinfo.email
```

`drive.file` és l'àmbit restrictiu: l'app **no** pot llistar tot el Drive de l'usuari, només
el que ell mateix hi selecciona amb el Picker.

## Càrrega de les APIs

No hi ha cap paquet npm de Google. `loadGoogleApis()` injecta dos `<script>`:
`apis.google.com/js/api.js` (gapi + picker) i `accounts.google.com/gsi/client` (OAuth). Per
tant **Drive no funciona sense connexió**, encara que la resta de l'app sí.

## Gestió del token

`useGoogleDrive` guarda el token i la seva caducitat en `useRef` (no en estat: no cal
re-renderitzar). `_ensureToken()` retorna el token vigent o en demana un de nou amb
`prompt: ''` (silenciós). El token **no es persisteix**: en recarregar la pàgina cal tornar a
autenticar-se.

## Operacions

| Funció | Què fa |
|---|---|
| `openFromDrive()` | Obre el Google Picker; accepta `.json` i `.bc3` (validat per extensió) |
| `saveToDrive(budget, prices)` | Actualitza el JSON obert, o en crea un de nou demanant nom amb `prompt()` |
| `saveAsToDrive(...)` | Sempre crea una còpia nova |
| `exportBC3ToDrive(contingut, nom, sempreNou)` | Demana amb `confirm()` si sobreescriure el BC3 obert o fer-ne còpia. Amb `sempreNou` (les certificacions) crea sempre un fitxer nou i no el pren com a fitxer de referència: el que s'edita continua essent el pressupost |

Les pujades es fan amb `multipart/related` construït a mà (`_buildMultipartForm`), perquè el
BC3 s'ha de pujar com a bytes Windows-1252 i no com a text UTF-8.

## "Obrir amb…" des de Drive

Si l'usuari obre un fitxer des de la interfície de Drive, Google redirigeix a l'app amb
`?state={"action":"open","ids":["…"]}`. `_handleUrlState()` ho detecta a la inicialització,
neteja el paràmetre amb `history.replaceState` i carrega el fitxer.

## Punts a tenir presents en tocar aquest codi

- `toWindows1252Bytes` és la conversió compartida per l'exportació BC3 a disc i a Drive.
  Viu en aquest fitxer per raons històriques; si algun dia s'extreu un `utils/encoding.js`,
  és el candidat obvi.
- Hi ha `console.log` de depuració amb emojis repartits pel hook i pel wrapper, inclòs
  l'**email de l'usuari** (`useGoogleDrive.js:73`). Convé treure'ls abans de considerar-ho
  producció.
- Els diàlegs usen `prompt()` i `confirm()` natius, que xoquen amb la resta de la UI i estan
  bloquejats en alguns contextos (iframes amb sandbox).
