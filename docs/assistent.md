# Assistent

Un xat amb Claude que treballa sobre el projecte obert: munta sistemes constructius
(paràmetres, fórmules, condicions), amidaments complets i partides noves, amb el Generador de
Preus de CYPE i, si cal, preus trobats a internet. L'usuari veu els canvis en directe i els pot
corregir a mà abans de desar el projecte o de desar-lo com a sistema.

S'obre amb el botó ✦ de la barra de l'editor (columna de l'esquerra, o calaix al mòbil), o des de
la galeria de sistemes amb **«Nou sistema amb l'assistent»**, que obre una finestra nova amb
`?assistent`: comença amb un projecte buit («Sistema nou») i l'assistent obert. Si es recarrega,
continua amb el que tenia (marca `amidaments:assistent-iniciat` a `sessionStorage`).

## Fitxers

| Fitxer | Què fa |
|---|---|
| `src/components/AssistentPanel.jsx` | El xat: clau, missatges, línies d'eina, aturar, cost aproximat |
| `src/utils/assistent/agent.js` | Bucle amb l'API (streaming, eines, `pause_turn`, refús). Es carrega a part (`import()`), amb el SDK |
| `src/utils/assistent/eines.js` | Definició, validació i execució de les eines sobre `{ budget, priceDatabase }` |
| `src/utils/assistent/cype.js` | Lectura de la navegació, les fitxes i els BC3 del Generador de Preus |
| `src/utils/assistent/adjunts.js` | Imatges i PDF adjunts: reducció, blocs de l'API i límits de la conversa |
| `src/utils/assistent/indicacions.js` | Indicacions de sistema (text fix: si canvia, s'invalida la memòria cau) |
| `test/assistent.test.js` | Lectura de CYPE, validació i eines, importació amb `test/fixtures/cype-pilar.bc3` |
| `test/adjunts.test.js` | Mida de les imatges, contingut del missatge i límits de la conversa |

## La clau

Cada usuari hi posa la seva clau de l'API d'Anthropic. Es desa a `localStorage`
(`amidaments:clau-anthropic`) i la crida va **directament del navegador a `api.anthropic.com`**
(`dangerouslyAllowBrowser`): no hi ha cap servidor nostre pel mig. Qualsevol extensió o script
amb accés a la pàgina la podria llegir; el botó de la clau l'esborra. Si l'API la rebutja,
s'esborra sola.

## La crida

- Model `claude-opus-5-5`, raonament adaptatiu, `effort: "high"`.
- `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`): si els filtres declinen una
  petició legítima, Anthropic la torna a fer amb el model que recomana en comptes de tornar un
  refús. Si tot i així hi ha refús, surt com a error al xat.
- Memòria cau a les indicacions i a la conversa (`cache_control`).
- Eines del client amb `eager_input_streaming`: l'input arriba a mesura que es genera i el
  servidor ja no el valida; ho fa `validaInput` contra l'esquema abans d'executar res.
- `web_search` i `web_fetch` són eines del servidor (8 usos de cada per volta). Pot caldre
  activar-les a la consola d'Anthropic de l'organització.
- El `content` que torna el model s'afegeix a la conversa sense tocar-lo (raonament inclòs).

## Eines

| Eina | Què fa |
|---|---|
| `llegeix_projecte` | PEM, paràmetres amb el valor calculat, condicions i arbre (fins a 400 elements) |
| `llegeix_partida` | Una partida: text, descomposat, línies |
| `consulta_preus` | Cerca a la base de preus del projecte, per tipus |
| `cype_navega`, `cype_fitxa`, `cype_importa` | Generador de Preus: fills d'un capítol, fitxa d'una partida, importar-ne el BC3 amb l'arbre de capítols de CYPE |
| `crea_capitol`, `crea_partida`, `modifica_partida` | Edició. `crea_partida` admet descomposat; els components que ja hi són conserven el preu del projecte |
| `posa_linies` | Línies d'amidament amb números o fórmules; torna la quantitat i els errors de fórmula |
| `posa_parametre`, `posa_condicio` | Paràmetres (valor o fórmula, límits) i condicions |
| `esborra` | Una partida o capítol, un paràmetre o una condició |

Cada eina rep l'estat del moment (`getEstat`), en torna un de nou si l'ha canviat i el panell
l'aplica (`aplicaEstat` → `setBudget` i `setPriceDatabase`). Les eines treballen sobre
`budget.chapters` i calculen sobre l'arbre resolt, com la resta de l'aplicació.

## CYPE

Les pàgines del Generador de Preus i els BC3 es baixen pels proxys CORS de `utils/corsProxy.js`
(`descarregaPagina`, `descarregaBC3`). **Les opcions d'una partida no es poden canviar des de
l'assistent**: passen per una verificació de seguretat de CYPE. El BC3 que es baixa és el de la
configuració per defecte; per a una altra, l'assistent diu quines opcions triar i l'usuari li
enganxa l'enllaç del BC3 (botó «Copiar BC3», veure [`generador-preus.md`](generador-preus.md)).

Una partida importada entra amb el seu arbre de capítols de CYPE, fusionat per codi de capítol
amb el que ja hi hagi, i sense els fills de `items` (el preu el fa el descomposat). Els preus que
ja eren al projecte manen sobre els del BC3.

## Imatges i PDF

Al xat s'hi poden adjuntar croquis, fotos i plànols: amb el clip, enganxant-los al camp de text
o arrossegant-los al panell (`utils/assistent/adjunts.js`). Van al missatge de l'usuari en
base64, davant del text i amb la llista de noms perquè el model s'hi pugui referir.

- **Imatges**: es redueixen al navegador a 2576 px al costat llarg i 3,75 MP com a màxim (el
  que llegeix Claude Opus 5.5; més gran no hi veu més) i es tornen a codificar en JPEG, amb fons
  blanc per a les transparències.
- **PDF**: tal qual, fins a 20 MB. El model en llegeix el text i cada pàgina com a imatge; un PDF
  llarg costa molt, millor enviar-ne només les pàgines que calen.
- **Límits de conversa**: tota la conversa es torna a enviar a cada volta (amb memòria cau),
  així que es compten les imatges (20) i el pes en base64 (24 MB, dins dels 32 MB de la petició)
  de tota la conversa. Passat, cal començar-ne una de nova.
- DWG i DXF no: s'han d'exportar a PDF o enviar-ne una captura.

L'arrossegament de fitxers de l'aplicació (obrir un BC3 o un projecte) no s'activa damunt del
panell: `App.jsx` ho mira amb la marca `data-assistent-adjunts`.

Les indicacions demanen que primer digui què hi llegeix, que distingeixi el que hi posa del que
suposa, que pregunti les cotes que falten en comptes d'inventar-les i que llisti les suposicions
al resum final.

## Preus d'internet

Una partida o un component amb preu trobat a internet porta el camp `font` a la seva entrada de
`priceDatabase` (adreça i data). Les indicacions demanen de preferir fabricants i distribuïdors,
de dir si el preu porta IVA i de llistar aquests preus al resum final per revisar-los. Sense font,
preu 0 i «(pendent de preu)».

## Proves de la interfície

L'API es pot simular amb Playwright (`page.route('https://api.anthropic.com/**')`): respondre el
`OPTIONS` amb capçaleres CORS i el `POST` amb un flux SSE (`message_start`,
`content_block_*`, `message_delta`, `message_stop`). Així es prova el bucle sencer sense clau ni
cost.
