# Proxy CORS propi

El Generador de Preus de CYPE serveix els BC3 **sense capçalera
`Access-Control-Allow-Origin`**, de manera que el navegador no en pot llegir la resposta i cal
un intermediari. Fins ara es feien servir serveis públics gratuïts; l'agost de 2026 corsproxy.io
va canviar l'API i la importació va deixar de funcionar sense avisar (`docs/estat-actual.md`
§28). Amb aquest worker el camí és teu i no depèn de ningú.

## Desplegar-lo

Cal un compte de Cloudflare. És gratuït i no demana targeta per al pla que fa falta:
100.000 peticions al dia, i aquí no se n'hi faran ni cent.

```bash
cd worker
npx wrangler login      # obre el navegador per autoritzar
npx wrangler deploy
```

En surt una URL de la forma `https://amidaments-proxy.<el-teu-compte>.workers.dev`.
Posa-la a `.env.local` de l'arrel del projecte, amb `{url}` allà on hi vagi la URL codificada:

```
VITE_CORS_PROXY=https://amidaments-proxy.el-teu-compte.workers.dev/?url={url}
```

I al repositori, com a secret `VITE_CORS_PROXY`, perquè el desplegament a GitHub Pages
l'agafi (`.github/workflows/deploy.yml`).

Sense la variable l'aplicació continua funcionant: prova els serveis públics per ordre, com
fins ara. El worker només els passa al davant.

## Les dues llistes blanques

Un proxy obert és un imant per a l'abús: qualsevol pot enviar-hi trànsit i, vist des de fora,
surt del teu compte. Per això el worker en té dues, totes dues a `worker.js`:

| Llista | Què limita |
|---|---|
| `ORIGENS_PERMESOS` | A quins dominis pot anar a buscar fitxers (CYPE i prou) |
| `LLOCS_PERMESOS` | Des de quins llocs accepta peticions (la teva PWA i localhost) |

La comprovació de domini és `amfitrio === d || amfitrio.endsWith('.' + d)`, no un `includes`:
d'altra manera `generadordepreus.info.el-que-sigui.com` hi passaria.

Si algun dia cal una altra base de preus, s'hi afegeix el domini i es torna a desplegar. Si
canvies el domini on publiques l'aplicació, cal afegir-lo a `LLOCS_PERMESOS`.

## Què fa i què no

- Només `GET` i `OPTIONS`, només `https`, màxim 25 MB, 20 segons de límit.
- **Els bytes passen tal qual.** El BC3 és Windows-1252 i qualsevol reinterpretació com a
  UTF-8 se'n carregaria els accents; qui el descodifica és l'aplicació.
- No desa res: ni KV, ni D1, ni secrets. Només afegeix un `cache-control` d'una hora, que
  Cloudflare aprofita per servir dues vegades el mateix fitxer sense tornar a CYPE.
