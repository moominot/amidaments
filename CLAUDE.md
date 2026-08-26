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
- La conversió a Windows-1252 (`toWindows1252Bytes`, a `utils/googleDrive.js`) la
  comparteixen l'exportació BC3 a disc i la de Drive. Toca-la en un sol lloc.
- `App.jsx` fa 4.380 línies. Abans d'afegir-hi res de nou, mira si toca extreure-ho a
  `utils/`, `hooks/` o `components/` — hi ha un pla de refactor a `docs/estat-actual.md`.
- El path base `/amidaments/` està escrit a mà a `vite.config.js`, `public/manifest.json` i
  `public/sw.js`.
- Les funcions de `calculations.js` amb `priceDatabase` o `certifications` com a paràmetre
  **opcional** fallen en silenci si no els passes: cauen a `node.price` o tracten qualsevol
  fase com si fos `origin`. Han estat l'origen de tres defectes (§1, §6 i §9 de
  `docs/estat-actual.md`). Passa'ls sempre.

## Abans de donar per acabada una feina

1. `npm run build` passa.
2. `npm run lint` continua amb 0 errors.
3. Si has tocat càlculs, exportació o el parser: prova el cicle complet amb
   `REFORMA ESPORLES_MEDICIONES_AJUSTADO.bc3` (importar → veure PEM → exportar → reimportar).
   El PEM de referència d'aquest fitxer és **135.202,54 €** amb 24 capítols i 248 partides.
   El cicle exportar → reimportar ha de conservar les quantitats: aquí s'hi amagava el
   defecte §8 de `docs/estat-actual.md`.
