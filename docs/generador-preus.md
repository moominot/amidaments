# Script d'usuari per al Generador de Preus

`public/eines/generador-preus.user.js` és un script per a Tampermonkey que posa un botó
flotant **«📋 Copiar BC3»** a les pàgines del Generador de Preus de CYPE (`generadordepreus.info`
i `generadordeprecios.info`, amb qualsevol subdomini). El botó copia l'enllaç del BC3 de la
partida que hi ha a la pantalla; enganxat a l'aplicació amb Ctrl+V, la partida entra al
projecte per `importFromUrl`, a través del proxy de `worker/`.

## Instal·lar-lo

Amb Tampermonkey instal·lat, obre
<https://moominot.github.io/amidaments/eines/generador-preus.user.js>: Tampermonkey reconeix
l'extensió `.user.js` i ofereix d'instal·lar-lo. Com que el script porta `@updateURL`, s'actualitza
sol quan es puja una versió nova **i s'hi incrementa el `@version`**. Sense incrementar-lo,
Tampermonkey no hi veu cap canvi.

**Chrome i Edge 138 o posteriors:** Tampermonkey no executa res fins que, a la pàgina de detalls
de l'extensió (`chrome://extensions`), s'activa **«Permet els scripts d'usuari»**. Sense això
el botó no surt i no hi ha cap error enlloc.

## Com troba l'enllaç

Busca en el moment del clic, perquè l'enllaç canvia quan es trien les opcions de la partida, el
primer `a[data-href$=".bc3"]` o `a[href$=".bc3"]`. El converteix en absolut amb `new URL`: un
camí relatiu, l'aplicació no el podria descarregar. Si CYPE canvia l'atribut, el botó es posa
vermell («❌ Cap BC3»).

Copia amb `GM_setClipboard` i no amb `navigator.clipboard`: no demana permís i no falla si la
pàgina no té el focus.
