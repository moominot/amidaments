/**
 * Service worker de l'aplicació.
 *
 * Objectiu: que l'app arrenqui sense cobertura, que és la situació normal a peu d'obra.
 * La versió anterior només precachava el shell (`/amidaments/`, index.html i manifest) i
 * deixava fora els bundles amb hash, que és on hi ha tota l'aplicació: en recarregar sense
 * xarxa, la pàgina quedava en blanc.
 *
 * Estratègia:
 *   · Navegacions  → xarxa primer, i si falla, l'index.html cachejat (l'app és una SPA).
 *   · Assets propis → cache primer i actualització en segon pla (stale-while-revalidate),
 *     de manera que tot el que s'ha carregat un cop queda disponible sense xarxa.
 *   · Peticions externes (Google Drive, corsproxy) i no-GET → sempre a la xarxa, mai cachejades.
 */

const VERSION = 'v3';
const CACHE_NAME = `amidaments-${VERSION}`;
const BASE = '/amidaments/';

// ── Compartir des del sistema (Android) ────────────────────────────────────────
//
// La File Handling API («obrir amb») només existeix a Chromium d'escriptori. Al mòbil el
// camí equivalent és la Web Share Target API: el manifest declara `share_target` i el
// sistema envia un POST amb el fitxer a aquesta URL. Un POST no el pot llegir la pàgina
// directament, així que l'intercepta el worker: en desa el fitxer en un cache a part i
// redirigeix a l'aplicació, que el recull i el buida.
const URL_COMPARTIR = `${BASE}comparteix`;
const CACHE_COMPARTIT = 'amidaments-compartit';
const CLAU_COMPARTIT = `${BASE}__compartit__`;

// Mínim imprescindible per arrencar. La resta s'hi va afegint a mesura que es demana.
const APP_SHELL = [BASE, `${BASE}index.html`, `${BASE}manifest.json`, `${BASE}icon.svg`];

/**
 * Els bundles porten hash al nom, així que no es poden llistar aquí a mà. En comptes
 * d'això, en instal·lar-se llegim l'index.html i en trepitgem els <script> i <link>.
 *
 * Cal precachar-los: durant la primera càrrega el worker encara no controla la pàgina,
 * de manera que aquelles peticions no passen pel handler de fetch i, sense aquest pas,
 * el cache es quedaria només amb el shell i l'app no arrencaria sense xarxa.
 */
const assetsDeIndex = async (cache) => {
    try {
        const resposta = await fetch(`${BASE}index.html`, { cache: 'reload' });
        if (!resposta.ok) return;
        await cache.put(`${BASE}index.html`, resposta.clone());

        const html = await resposta.text();
        const urls = new Set();
        const patrons = [/<script[^>]+src="([^"]+)"/g, /<link[^>]+href="([^"]+)"/g];
        for (const patro of patrons) {
            let m;
            while ((m = patro.exec(html)) !== null) {
                const href = m[1];
                if (href.startsWith('http') || href.startsWith('//')) continue;
                urls.add(new URL(href, `${self.location.origin}${BASE}`).pathname);
            }
        }
        await Promise.all([...urls].map(u => cache.add(u).catch(() => null)));
    } catch {
        // Sense xarxa durant la instal·lació: ja s'anirà omplint amb el handler de fetch.
    }
};

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(async (cache) => {
                // addAll falla sencer si un sol recurs falla; els posem un a un.
                await Promise.all(APP_SHELL.map(url => cache.add(url).catch(() => null)));
                await assetsDeIndex(cache);
            })
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(noms => Promise.all(
                // El cache del fitxer compartit no és una versió del shell: si s'esborrés
                // aquí, una actualització del worker enmig d'un «compartir amb» perdria
                // el fitxer que l'usuari acaba d'enviar.
                noms.filter(n => n.startsWith('amidaments-') && n !== CACHE_NAME && n !== CACHE_COMPARTIT)
                    .map(n => caches.delete(n))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') self.skipWaiting();
});

const esPropi = (url) => url.origin === self.location.origin && url.pathname.startsWith(BASE);

/**
 * Desa el fitxer compartit i redirigeix a l'aplicació.
 *
 * El nom del fitxer viatja en una capçalera perquè l'aplicació sàpiga si és un `.amid` o un
 * `.bc3` sense haver-lo d'ensumar: la codificació dels dos és diferent i importa (el BC3 és
 * Windows-1252). Es respon amb un 303 perquè la navegació resultant sigui un GET.
 */
const rebCompartit = async (request) => {
    try {
        const formData = await request.formData();
        const fitxer = formData.get('fitxer');
        if (fitxer && fitxer.size >= 0) {
            const cache = await caches.open(CACHE_COMPARTIT);
            await cache.put(CLAU_COMPARTIT, new Response(fitxer, {
                headers: {
                    'content-type': fitxer.type || 'application/octet-stream',
                    'x-nom-fitxer': encodeURIComponent(fitxer.name || 'compartit'),
                },
            }));
            return Response.redirect(`${BASE}?compartit=1`, 303);
        }
    } catch {
        // Si el POST no porta el que esperem, val més obrir l'aplicació buida que fallar.
    }
    return Response.redirect(BASE, 303);
};

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === URL_COMPARTIR) {
        event.respondWith(rebCompartit(request));
        return;
    }

    if (request.method !== 'GET') return;

    // Navegació: xarxa primer perquè un desplegament nou s'agafi de seguida,
    // amb l'index.html cachejat com a xarxa de seguretat quan no hi ha cobertura.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(resposta => {
                    const copia = resposta.clone();
                    caches.open(CACHE_NAME).then(c => c.put(`${BASE}index.html`, copia));
                    return resposta;
                })
                .catch(() => caches.match(`${BASE}index.html`).then(r => r || caches.match(BASE)))
        );
        return;
    }

    if (!esPropi(url)) return; // Drive, fonts, proxy CORS: sempre en directe.

    event.respondWith(
        caches.match(request).then(cachejada => {
            const xarxa = fetch(request)
                .then(resposta => {
                    if (resposta && resposta.status === 200 && resposta.type === 'basic') {
                        const copia = resposta.clone();
                        caches.open(CACHE_NAME).then(c => c.put(request, copia));
                    }
                    return resposta;
                })
                .catch(() => cachejada);
            return cachejada || xarxa;
        })
    );
});
