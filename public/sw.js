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

const VERSION = 'v2';
const CACHE_NAME = `amidaments-${VERSION}`;
const BASE = '/amidaments/';

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
                noms.filter(n => n.startsWith('amidaments-') && n !== CACHE_NAME)
                    .map(n => caches.delete(n))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') self.skipWaiting();
});

const esPropi = (url) => url.origin === self.location.origin && url.pathname.startsWith(BASE);

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

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
