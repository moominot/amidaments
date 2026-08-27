# Guia per treballar en aquest repositori

Aplicació React client-side d'amidaments, pressupostos i certificacions d'obra amb
importació/exportació BC3. Documentació completa a `docs/` — comença per
`docs/arquitectura.md` i `docs/estat-actual.md`.

## Ordres

```bash
npm install
npm run dev
npm run build     # ha de passar sempre abans de donar una feina per acabada
npm run lint      # cobreix .js i .jsx; l'arbre ha de quedar amb 0 errors
```

No hi ha tests. Si n'afegeixes, Vitest és l'opció natural amb Vite.

## Idioma

**Tota la UI, els comentaris i els missatges de commit són en català.** La terminologia és la
del sector: *amidament*, *partida*, *capítol*, *descomposat*, *rendiment*, *certificació*,
*a origen*, *PEM*, *PEC*. No la tradueixis ni l'anglicitzis.

## Convencions del codi

- **Capítol vs partida es distingeix per `node.unit`**: amb unitat és partida (fulla),
  sense unitat és capítol. Aquesta convenció (`!node.unit === isChapter`) és a tot arreu.
- Els fills d'un capítol van en **dues llistes**, `subChapters` i `items`, i gairebé sempre
  es recorren com `[...(node.subChapters || []), ...(node.items || [])]`.
- Les mutacions de l'arbre són **immutables i recursives**; segueix el patró `updateInTree`
  que ja hi ha (`App.jsx:2569` i següents) en comptes d'inventar-ne un de nou.
- **`round2` s'aplica a cada pas intermedi**, no només al final. És deliberat: imita Presto.
  No el treguis "per netedat" — canviaria els totals.
- **`priceDatabase` mana sobre `node.price`.** Passa sempre `priceDatabase` a
  `calcChapterTotal`, `calcItemTotalAmount` i `getItemUnitPrice`; si no, cauen silenciosament
  a `node.price` i els imports deixen de quadrar amb el PEM del capçal.
- Els codis s'indexen sempre per `normalizeCode(code)` (sense espais ni `#` finals).
- Estils: Tailwind inline, paleta fosca al capçal (`slate-950`), blau per al mode pressupost i
  verd maragda per al mode certificació. Tipografia petita (`text-[10px]`, `text-[11px]`) i
  `font-mono` per a tots els números.

## Paranys coneguts

- **`budget.certifications` és un array de fases. `node.certifications` és un objecte indexat
  per `certId`.** Mateix nom, estructures diferents. Ja ha causat dos bugs (veure
  `docs/estat-actual.md` §2 i §3).
- **El que es desa a `node.certifications[certId]` sempre és l'acumulat a origen.** El `method`
  de la fase només tria per quin camp s'introdueix; no canvia què val. No hi tornis a penjar
  significat: era l'origen del §22.
- Qualsevol projecte que entri de fora ha de passar per `migrateBudget` (`utils/migrateBudget.js`).
- **Per mostrar o calcular, fes servir `resolvedChapters`, no `budget.chapters`.** El primer té
  les línies d'amidament vinculades ja resoltes; el segon és el que s'edita i es desa. Les
  mutacions van sempre contra `budget.chapters`.
- La conversió a Windows-1252 (`toWindows1252Bytes`, a `utils/googleDrive.js`) la
  comparteixen l'exportació BC3 a disc i la de Drive. Toca-la en un sol lloc.
- **En BC3, cada certificació és un fitxer sencer**, no una fase dins del fitxer del
  pressupost: `generateBC3` (`utils/bc3Writer.js`) sol escriu el pressupost i amb
  `certification` escriu aquella certificació, amb `~V` de tipus 3. Abans de tocar cap
  registre, mira `docs/fiebdc-norma.md`: hi ha l'extracte de l'especificació, i ja hem donat
  per bo el contrari del que hi diu dues vegades.
- **En escriure un `~D`, el descomposat va abans que els fills.** Una partida importada té els
  components a `breakdown` (amb rendiment) i a `items` (sense), perquè surten del mateix
  registre. Escrivint els fills primer es perd el rendiment i els preus es disparen en
  reimportar (§25 de `docs/estat-actual.md`).
- `App.jsx` fa 4.380 línies. Abans d'afegir-hi res de nou, mira si toca extreure-ho a
  `utils/`, `hooks/` o `components/` — hi ha un pla de refactor a `docs/estat-actual.md`.
- El path base `/amidaments/` està escrit a mà a `vite.config.js`, `public/manifest.json`
  (`start_url`, `file_handlers` i `share_target`) i `public/sw.js`.
- **El fitxer natiu és `.amid`**, no `.json`: és JSON a dins, però amb extensió i MIME propis
  perquè l'associació de fitxers del sistema sigui neta. Tot el que sap què és un fitxer de
  projecte viu a `utils/projectFile.js`; els `.json` desats abans s'han de continuar obrint.
- **Qualsevol fitxer que entri passa per `obreFitxer`** (`App.jsx`): selector, arrossegament,
  `launchQueue` d'escriptori i fitxers compartits des d'Android. Si hi afegeixes un camí nou,
  fes-lo passar per aquí i no repeteixis la comprovació: tenir-ne tres de diferents va deixar
  la File Handling API mirant un camp inexistent, fallant en silenci.
- **Cap camp numèric no pot ser `type="number"`**: el navegador es menja la coma decimal i
  «12,5» es converteix en 125 sense avisar. Fes servir `components/NumberInput.jsx`.
- **Res d'`opacity-0 group-hover:`**: al tacte no hi ha hover i el control queda inabastable.
  El patró correcte és `opacity-60 md:opacity-0 md:group-hover:opacity-100`.
- `scrollIntoView` arrossega també els contenidors superiors. Per desplaçar una llista
  horitzontal, fes `contenidor.scrollTo({ left })` a mà.
- **Els residus es desen amb les magnituds primitives** (`quantity`, `massPerUnit`,
  `volumePerUnit`), no amb la massa ja multiplicada: guardant el producte es perden els
  components declarats amb quantitat zero i l'exportació no pot refer el `~X`. El càlcul viu a
  `utils/waste.js` i vol `resolvedChapters`. Veure `docs/residus.md`.
- **`ce` i `eCO2` del `~X` van a `priceDatabase`, no al node**: són propietats del concepte,
  com el preu. Els residus sí que van al node perquè la quantitat depèn de la relació amb la
  partida. Veure `docs/petjada.md`.
- **La importació des d'URL depèn d'un proxy CORS de tercers** (`utils/corsProxy.js`): CYPE no
  envia `Access-Control-Allow-Origin`. Se'n proven uns quants per ordre i es comprova que la
  resposta comenci per un registre `~`; amb `VITE_CORS_PROXY` se n'hi pot posar un de propi.
  No hi deixis un sol proxy: el de corsproxy.io va canviar d'API i va caure sol (§28).
- Qualsevol nom de fitxer que vagi a `doc.save()` o `a.download` ha de passar per
  `safeFileName` (`utils/fileName.js`): Chromium descarta l'atribut sencer si porta accents i
  desa el fitxer com a `download`, sense extensió (§11 de `docs/estat-actual.md`).
- Les funcions de `calculations.js` amb `priceDatabase` o `certifications` com a paràmetre
  **opcional** fallen en silenci si no els passes: cauen a `node.price` o tracten qualsevol
  fase com si fos `origin`. Han estat l'origen de tres defectes (§1, §6 i §9 de
  `docs/estat-actual.md`). Passa'ls sempre.

## Abans de donar per acabada una feina

1. `npm run build` passa.
2. `npm run lint` continua amb 0 errors.
3. Si has tocat la interfície, prova-la a 390 px d'amplada amb emulació tàctil: la meitat
   dels defectes d'usabilitat trobats només es veien des del mòbil.
4. Si has tocat càlculs, exportació o el parser: prova el cicle complet amb
   `REFORMA ESPORLES_MEDICIONES_AJUSTADO.bc3` (importar → veure PEM → exportar → reimportar).
   El PEM de referència d'aquest fitxer és **135.202,54 €** amb 24 capítols i 248 partides.
   El cicle ha de conservar el PEM, el nombre de capítols, el seu ordre i les quantitats, i ha
   de ser estable encadenant-lo tres vegades. Comprovar només les quantitats no basta: els
   defectes §25 i §26 hi passaven pel mig (el PEM se n'anava a 394.955,33 € i els capítols es
   reordenaven) i les quantitats quedaven intactes.
