/**
 * Esquema d'un sistema constructiu: una imatge o un SVG que es veu en omplir-ne els paràmetres
 * (veure `docs/sistemes.md`).
 *
 * Es desa dins del projecte (`budget.esquema`) i del document de sistema (`doc.esquema`) com a
 * data URL, de manera que viatja amb el fitxer `.amid` sense res a part. El límit és l'espai:
 * la biblioteca de projectes i la galeria de sistemes viuen al `localStorage`, que ronda els
 * 5 MB per a tot. Per això:
 * - les imatges es redueixen a 1600 px al costat llarg i es desen en PNG o en JPEG, el que pesi
 *   menys (un esquema de línies queda millor i més petit en PNG; una foto, en JPEG), i es
 *   continuen reduint fins que caben a `MAX_BYTES`;
 * - un SVG va tal qual si no passa de `MAX_BYTES`. Es mostra sempre amb `<img>`, i un SVG dins
 *   d'una imatge no executa scripts ni carrega res de fora: no cal netejar-lo.
 *
 * Un DWG o un DXF no: s'han d'exportar a SVG, PNG o PDF des del programa de CAD.
 */

export const MAX_BYTES = 400 * 1024;
const COSTAT_MAX = 1600;
export const TIPUS_ESQUEMA = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const ACCEPTA_ESQUEMA = TIPUS_ESQUEMA.join(',');

/** Mida aproximada en bytes del contingut d'un data URL en base64. */
export const midaDataUrl = (url) => {
    const coma = String(url || '').indexOf(',');
    return coma < 0 ? 0 : Math.floor(((url.length - coma - 1) * 3) / 4);
};

/** Un esquema vàlid: `{ dades: 'data:image/...', nom }`. Qualsevol altra cosa es descarta. */
export const esquemaValid = (e) => (
    e && typeof e === 'object' && typeof e.dades === 'string' && /^data:image\/(svg\+xml|png|jpeg|webp|gif)[;,]/.test(e.dades)
        ? { dades: e.dades, nom: typeof e.nom === 'string' ? e.nom : '' }
        : null
);

const llegeixDataUrl = (blob) => new Promise((resol, falla) => {
    const r = new FileReader();
    r.onload = () => resol(String(r.result));
    r.onerror = () => falla(r.error || new Error('No s\'ha pogut llegir el fitxer'));
    r.readAsDataURL(blob);
});

const aBlob = (canvas, tipus, qualitat) => new Promise((resol) => canvas.toBlob(resol, tipus, qualitat));

/**
 * Llegeix un fitxer triat per l'usuari i en fa un esquema `{ dades, nom }`, reduït si cal.
 * Llança amb un missatge en català si no es pot.
 */
export const preparaEsquema = async (fitxer) => {
    const nom = fitxer.name || 'esquema';
    if (!TIPUS_ESQUEMA.includes(fitxer.type)) {
        throw new Error(`«${nom}» no és una imatge ni un SVG. Un DWG o un DXF, exporta'l a SVG o PNG des del CAD.`);
    }
    if (fitxer.type === 'image/svg+xml') {
        if (fitxer.size > MAX_BYTES) throw new Error(`L'SVG «${nom}» passa de ${Math.round(MAX_BYTES / 1024)} kB: simplifica'l o exporta'l en PNG`);
        return { dades: await llegeixDataUrl(fitxer), nom };
    }

    let bitmap;
    try {
        bitmap = await createImageBitmap(fitxer);
    } catch {
        throw new Error(`No s'ha pogut obrir la imatge «${nom}»`);
    }
    let escala = Math.min(1, COSTAT_MAX / Math.max(bitmap.width, bitmap.height));
    for (let intent = 0; intent < 6; intent++) {
        const w = Math.max(1, Math.round(bitmap.width * escala));
        const h = Math.max(1, Math.round(bitmap.height * escala));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(bitmap, 0, 0, w, h);
        const [png, jpg] = await Promise.all([aBlob(c, 'image/png'), aBlob(c, 'image/jpeg', 0.85)]);
        const millor = [png, jpg].filter(Boolean).sort((a, b) => a.size - b.size)[0];
        if (millor && millor.size <= MAX_BYTES) {
            bitmap.close?.();
            return { dades: await llegeixDataUrl(millor), nom };
        }
        escala *= 0.75;
    }
    bitmap.close?.();
    throw new Error(`La imatge «${nom}» no es pot reduir prou: prova'n una de més senzilla`);
};

/** Base64 d'un text en UTF-8 (`btoa` sol només accepta Latin-1). */
const base64Utf8 = (text) => {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
};

/**
 * Un SVG escrit a mà (o per l'assistent) com a esquema. Comprova que sigui un SVG sencer i que
 * no passi del límit, i hi posa l'`xmlns` si no el porta: sense, un `<img>` no el dibuixa.
 * Encara que es mostri amb `<img>` (que no executa res), es rebutja el que porti scripts:
 * un esquema no en necessita mai. Llança amb el motiu.
 */
export const svgAEsquema = (svg, nom = 'esquema.svg') => {
    let t = String(svg || '').trim().replace(/^<\?xml[^>]*\?>\s*/, '');
    if (!/^<svg[\s>]/i.test(t) || !/<\/svg>\s*$/i.test(t)) throw new Error('No és un SVG sencer: ha de començar per <svg i acabar amb </svg>');
    if (/<script|javascript:|\son\w+\s*=/i.test(t)) throw new Error('L\'SVG no pot portar scripts ni esdeveniments');
    if (!/^<svg[^>]*\sxmlns=/i.test(t)) t = t.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    const dades = `data:image/svg+xml;base64,${base64Utf8(t)}`;
    if (midaDataUrl(dades) > MAX_BYTES) throw new Error(`L'SVG passa de ${Math.round(MAX_BYTES / 1024)} kB`);
    return { dades, nom };
};

/** Una imatge ja carregada (data URL, p. ex. un adjunt del xat) com a esquema, reduïda. */
export const esquemaDeDataUrl = async (dataUrl, nom = 'esquema') => {
    const blob = await (await fetch(dataUrl)).blob();
    return preparaEsquema(new File([blob], nom, { type: blob.type }));
};
