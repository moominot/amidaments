/**
 * Descàrrega d'un BC3 des d'una URL de tercers.
 *
 * El cas d'ús és el Generador de Preus de CYPE: s'arrossega l'enllaç del BC3 a la finestra i
 * la partida entra al projecte sense passar per la carpeta de descàrregues. El servidor de
 * CYPE **no envia capçalera `Access-Control-Allow-Origin`**, de manera que el navegador no en
 * pot llegir la resposta directament i cal un proxy CORS pel mig.
 *
 * ─── Per què n'hi ha una llista i no un de sol ───
 *
 * L'agost de 2026 corsproxy.io va canviar l'API: el format antic `?<url>` va passar a respondre
 * `403 keyless_legacy_url` i la importació va deixar de funcionar sense que aquí hagués canviat
 * res. Com que és una dependència externa que no controlem i ja ens ha caigut un cop, ara se'n
 * proven uns quants en ordre i el primer que respon guanya.
 *
 * Si vols un proxy propi —un Worker de Cloudflare són quinze línies i no depèn de ningú—,
 * posa'l a la variable d'entorn `VITE_CORS_PROXY` amb `{url}` allà on hi vagi la URL
 * codificada, per exemple `https://el-meu-worker.workers.dev/?url={url}`. Es prova primer.
 */

const PROXIES = [
    // El format nou de corsproxy.io. Amb el pla gratuït només respon a peticions de navegador
    // (amb Origin); des d'un script diu «Server-side requests are not allowed on your plan».
    (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
    // Retorna els bytes tal qual i amb `Access-Control-Allow-Origin: *`.
    (url) => `https://proxy.cors.sh/${url}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

// Sense encadenament opcional: Vite substitueix `import.meta.env.VITE_...` textualment en
// construir, i escrivint-hi `?.` pel mig la substitució no s'aplica i la variable no arriba mai.
const propi = import.meta.env.VITE_CORS_PROXY;
const CANDIDATS = propi
    ? [(url) => propi.replace('{url}', encodeURIComponent(url)), ...PROXIES]
    : PROXIES;

const TEMPS_MAXIM = 15000;

/**
 * Un BC3 comença sempre per un registre. Serveix per no donar per bona la resposta d'un proxy
 * que contesta 200 amb un JSON d'error a dins, que és el que fan gairebé tots quan et
 * refusen: sense aquesta comprovació, el text d'error acabava al parser.
 */
const semblaBC3 = (text) => /^\s*~[VKCDTMFNLPQ]\|/.test(text || '');

/**
 * Descarrega un BC3 i el retorna descodificat en Windows-1252, que és com s'escriu el format.
 *
 * @param {string} url URL del fitxer
 * @returns {Promise<{text: string, via: string}>}
 * @throws {Error} amb un missatge per ensenyar a l'usuari si no se n'ha sortit cap
 */
export const descarregaBC3 = async (url) => {
    const net = (url || '').trim();
    if (!net) throw new Error('URL buida');

    const problemes = [];

    for (const construeix of CANDIDATS) {
        const adreca = construeix(net);
        const amfitrio = (() => { try { return new URL(adreca).hostname; } catch { return adreca; } })();
        const avortador = new AbortController();
        const rellotge = setTimeout(() => avortador.abort(), TEMPS_MAXIM);
        try {
            const resposta = await fetch(adreca, {
                signal: avortador.signal,
                headers: { 'x-requested-with': 'XMLHttpRequest' }, // cors.sh el demana sense clau
            });
            if (!resposta.ok) {
                problemes.push(`${amfitrio}: HTTP ${resposta.status}`);
                continue;
            }
            const text = new TextDecoder('windows-1252').decode(await resposta.arrayBuffer());
            if (!semblaBC3(text)) {
                problemes.push(`${amfitrio}: la resposta no és un BC3`);
                continue;
            }
            return { text, via: amfitrio };
        } catch (err) {
            problemes.push(`${amfitrio}: ${err.name === 'AbortError' ? 'sense resposta' : err.message}`);
        } finally {
            clearTimeout(rellotge);
        }
    }

    const error = new Error(
        'Cap dels serveis intermediaris ha pogut portar el fitxer. ' +
        'Descarrega el BC3 i arrossega\'l a la finestra.'
    );
    error.detall = problemes;
    throw error;
};
