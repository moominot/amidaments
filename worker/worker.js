/**
 * Proxy CORS per a l'aplicació d'amidaments.
 *
 * El Generador de Preus de CYPE serveix els BC3 sense capçalera
 * `Access-Control-Allow-Origin`, de manera que el navegador no en pot llegir la resposta i cal
 * un intermediari. Fins ara es feien servir serveis públics gratuïts, però són dependències que
 * no controlem: l'agost de 2026 corsproxy.io va canviar l'API i la importació va deixar de
 * funcionar d'un dia per l'altre.
 *
 * Això és el mateix, però nostre. Desplegat a Cloudflare Workers, el pla gratuït en dona
 * 100.000 peticions al dia, que per a aquest ús és més que de sobres.
 *
 *   ~/amidaments/worker $ npx wrangler deploy
 *
 * i la URL que en surt va a `VITE_CORS_PROXY` (veure `.env.example`).
 *
 * ─── Dues llistes blanques, i no per casualitat ───
 *
 * Un proxy obert el fan servir per amagar-se: qualsevol pot enviar-hi trànsit i, vist des de
 * fora, surt del teu compte de Cloudflare. Per això aquí només es deixa passar cap als
 * dominis d'ORIGENS_PERMESOS i només es contesta als navegadors de LLOCS_PERMESOS.
 * Si algun dia cal una altra base de preus, s'hi afegeix el domini i s'hi torna a desplegar.
 */

/** Dominis als quals aquest proxy pot anar a buscar fitxers. */
const ORIGENS_PERMESOS = [
    'generadordepreus.info',
    'generadorprecios.info',
    'cype.es',
    'cype.net',
];

/** Llocs des dels quals s'accepten peticions. Els localhost hi són per poder desenvolupar. */
const LLOCS_PERMESOS = [
    'https://moominot.github.io',
    'http://localhost:5173',
    'http://localhost:5199',
];

const MIDA_MAXIMA = 25 * 1024 * 1024; // 25 MB: un BC3 gros no arriba ni de bon tros
const TEMPS_MAXIM = 20000;

const dominiPermes = (amfitrio) => ORIGENS_PERMESOS.some(
    d => amfitrio === d || amfitrio.endsWith(`.${d}`)
);

const capsaleresCors = (origen) => ({
    'access-control-allow-origin': LLOCS_PERMESOS.includes(origen) ? origen : LLOCS_PERMESOS[0],
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'x-requested-with, content-type',
    'access-control-max-age': '86400',
    // L'origen decideix la resposta, i els intermediaris ho han de saber.
    'vary': 'Origin',
});

const error = (estat, missatge, origen) => new Response(
    JSON.stringify({ error: missatge }),
    { status: estat, headers: { ...capsaleresCors(origen), 'content-type': 'application/json; charset=utf-8' } }
);

export default {
    async fetch(request) {
        const origen = request.headers.get('Origin') || '';

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: capsaleresCors(origen) });
        }
        if (request.method !== 'GET') {
            return error(405, 'Només GET', origen);
        }
        // Un origen desconegut no rep res. Sense això, el proxy és obert a tothom.
        if (origen && !LLOCS_PERMESOS.includes(origen)) {
            return error(403, `Origen no autoritzat: ${origen}`, origen);
        }

        const desti = new URL(request.url).searchParams.get('url');
        if (!desti) return error(400, "Falta el paràmetre ?url=", origen);

        let objectiu;
        try {
            objectiu = new URL(desti);
        } catch {
            return error(400, 'La URL no és vàlida', origen);
        }
        if (objectiu.protocol !== 'https:') {
            return error(400, 'Només https', origen);
        }
        if (!dominiPermes(objectiu.hostname)) {
            return error(403, `Domini no permès: ${objectiu.hostname}`, origen);
        }

        const avortador = new AbortController();
        const rellotge = setTimeout(() => avortador.abort(), TEMPS_MAXIM);
        try {
            const resposta = await fetch(objectiu.toString(), {
                signal: avortador.signal,
                headers: { 'user-agent': 'amidaments-proxy/1.0', accept: '*/*' },
                redirect: 'follow',
            });
            if (!resposta.ok) {
                return error(resposta.status, `L'origen ha respost ${resposta.status}`, origen);
            }

            const declarada = Number(resposta.headers.get('content-length') || 0);
            if (declarada > MIDA_MAXIMA) return error(413, 'El fitxer és massa gros', origen);

            // Els bytes passen tal qual: el BC3 és Windows-1252 i qualsevol reinterpretació
            // com a UTF-8 se'n carregaria els accents. Qui el descodifica és l'aplicació.
            const dades = await resposta.arrayBuffer();
            if (dades.byteLength > MIDA_MAXIMA) return error(413, 'El fitxer és massa gros', origen);

            return new Response(dades, {
                headers: {
                    ...capsaleresCors(origen),
                    'content-type': 'text/plain; charset=windows-1252',
                    'cache-control': 'public, max-age=3600',
                },
            });
        } catch (err) {
            const motiu = err.name === 'AbortError' ? 'temps esgotat' : err.message;
            return error(502, `No s'ha pogut llegir l'origen: ${motiu}`, origen);
        } finally {
            clearTimeout(rellotge);
        }
    },
};
