import { descarregaPagina, descarregaBC3 } from '../corsProxy';
import { processBC3Data } from '../bc3Parser';
import { getItemUnitPrice, normalizeCode } from '../calculations';

/**
 * Lectura del Generador de Preus de CYPE per a l'assistent (veure `docs/assistent.md`).
 *
 * Les pàgines es baixen pel mateix proxy CORS que els BC3 i es llegeixen amb expressions
 * regulars sobre l'HTML, no amb `DOMParser`: així també es poden provar fora del navegador.
 *
 * Tres coses que se'n treuen:
 * - **navegació**: els fills d'un capítol. Cada enllaç porta una icona que és el codi del
 *   subcapítol (`CSV`) o la unitat de la partida (`m³`): és el que diu si és una cosa o l'altra;
 * - **fitxa d'una partida**: el títol, la unitat, l'enllaç del BC3 i les opcions configurables
 *   amb la triada per defecte;
 * - **la partida mateixa**, del BC3, amb el seu arbre de capítols de CYPE i el descomposat.
 *
 * Les opcions es poden llegir però no canviar: canviar-les passa per una verificació de
 * seguretat de CYPE. El BC3 que es baixa és el de la configuració per defecte; per a una altra
 * configuració, l'usuari la tria al navegador i en dona l'enllaç del BC3.
 */

/**
 * El Generador de Preus és el mateix en cada idioma, amb un domini i uns camins propis: les
 * pàgines, els noms de les partides i els BC3 (textos, criteris d'amidament) surten en l'idioma
 * de l'arrel per on s'entra. L'estructura de l'HTML és la mateixa, i també els codis.
 */
export const ARRELS_CYPE = {
    ca: 'https://generadordepreus.info/obra_nova/',
    es: 'https://generadordeprecios.info/obra_nueva/',
};
export const IDIOMA_CYPE_PER_DEFECTE = 'ca';
export const arrelCype = (idioma) => ARRELS_CYPE[idioma] || ARRELS_CYPE[IDIOMA_CYPE_PER_DEFECTE];

const net = (s) => decodificaEntitats(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const ENTITATS = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', middot: '·', deg: '°', sup2: '²', sup3: '³',
    ordf: 'ª', ordm: 'º', euro: '€', laquo: '«', raquo: '»',
};
// Lletres accentuades: &aacute; &Ntilde; &ccedil; &uuml;... (minúscula i majúscula).
[['a', 'áàâä'], ['e', 'éèêë'], ['i', 'íìîï'], ['o', 'óòôö'], ['u', 'úùûü']].forEach(([lletra, formes]) => {
    ['acute', 'grave', 'circ', 'uml'].forEach((accent, i) => {
        ENTITATS[`${lletra}${accent}`] = formes[i];
        ENTITATS[`${lletra.toUpperCase()}${accent}`] = formes[i].toUpperCase();
    });
});
Object.assign(ENTITATS, { ntilde: 'ñ', Ntilde: 'Ñ', ccedil: 'ç', Ccedil: 'Ç' });
const decodificaEntitats = (s) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITATS[e] ?? ENTITATS[e.toLowerCase()] ?? m;
});

const escapaRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** La carpeta dels fills d'una pàgina: la URL sense `.html` (o l'arrel, amb barra). */
const baseDe = (url) => {
    const u = String(url).split(/[?#]/)[0];
    return u.endsWith('.html') ? `${u.slice(0, -5)}/` : (u.endsWith('/') ? u : `${u}/`);
};

/** Un codi de capítol de CYPE és de lletres majúscules (`C`, `CS`, `CSV`). */
const esCodiCapitol = (s) => /^[A-Z0-9]{1,4}$/.test(s);

/**
 * Fills d'una pàgina de navegació. Torna `{ titol, capitols, partides }`: cada capítol
 * `{ codi, titol, url }` i cada partida `{ codi, unitat, titol, url }` (el `codi` de la partida
 * surt del nom del fitxer quan el porta, `FFQ020_...`; si no, és `null` fins que se'n llegeix la
 * fitxa).
 */
export const llegeixNavegacio = (html, url) => {
    const base = baseDe(url);
    const capitols = [];
    const partides = [];
    const vistos = new Set();
    const re = new RegExp(`<a[^>]*href="(${escapaRegex(base)}[^"]+\\.html)"[^>]*>([\\s\\S]*?)</a>`, 'g');
    let m;
    while ((m = re.exec(html))) {
        const adreca = m[1];
        // Només els fills directes, no els néts que hi pugui haver a la mateixa pàgina.
        if (adreca.slice(base.length).includes('/') || vistos.has(adreca)) continue;
        vistos.add(adreca);
        const icona = net((/<span[^>]*nav-link-icon[^>]*>([\s\S]*?)<\/span>/.exec(m[2]) || [])[1]);
        const titol = net(m[2].replace(/<span[^>]*nav-link-icon[^>]*>[\s\S]*?<\/span>/, ''));
        if (!titol) continue;
        const fitxer = adreca.slice(base.length);
        const codiFitxer = (/^([A-Z]{2,4}\d{3}[a-z]?)_/.exec(fitxer) || [])[1] || null;
        if (codiFitxer || (icona && !esCodiCapitol(icona))) {
            partides.push({ codi: codiFitxer, unitat: icona || null, titol, url: adreca });
        } else {
            capitols.push({ codi: icona || null, titol, url: adreca });
        }
    }
    const titol = net((/<title>([\s\S]*?)<\/title>/i.exec(html) || [])[1]);
    return { titol, capitols, partides };
};

/**
 * Fitxa d'una partida: `{ titol, unitat, bc3, opcions }`. Cada opció és `{ nom, valors,
 * triat }`, amb el valor que la pàgina porta marcat.
 */
export const llegeixFitxa = (html) => {
    const titolPagina = net((/<title>([\s\S]*?)<\/title>/i.exec(html) || [])[1]);
    // «Precio en España de m³ de Zapata corrida de cimentación de hormigón armado. Generador...»
    const t = /\bde (\S+) de (.+?)\. Generador/i.exec(titolPagina);
    const bc3 = (/(?:data-href|href)="(https?:\/\/[^"]+\/_bc3[^"]*\/[A-Za-z0-9_]+\.bc3)"/.exec(html) || [])[1] || null;

    const opcions = [];
    const reFs = /<legend[^>]*>([\s\S]*?)<\/legend>([\s\S]*?)<\/fieldset>/g;
    let f;
    while ((f = reFs.exec(html))) {
        const nom = net(f[1]);
        const valors = [];
        let triat = null;
        // Cada valor és un <input> seguit de la seva etiqueta.
        const trossos = f[2].split(/<input\b/).slice(1);
        trossos.forEach(tros => {
            const marcat = /^[^>]*\bchecked\b/.test(tros);
            const etiqueta = net((/<label[^>]*>([\s\S]*?)<\/label>/.exec(tros) || [])[1]);
            if (!etiqueta) return;
            valors.push(etiqueta);
            if (marcat) triat = etiqueta;
        });
        if (nom && valors.length) opcions.push({ nom, valors, triat });
    }
    return {
        titol: t ? t[2] : titolPagina,
        unitat: t ? t[1] : null,
        bc3,
        opcions,
    };
};

/**
 * La partida d'un BC3 de CYPE: l'arbre de capítols tal com ve, amb la partida a dins, sense
 * els components fills (el preu el fa el descomposat; els fills només duplicarien codis) i
 * sense línies d'amidament. Torna `{ chapters, prices, partida }` o llança si no n'hi ha.
 */
export const llegeixPartidaBC3 = (text) => {
    const r = processBC3Data(text);
    if (!r || !Array.isArray(r.chapters)) throw new Error('El fitxer no és un BC3 que s\'entengui');
    let partida = null;
    const neteja = (nodes) => nodes.map(n => {
        if (n.unit) {
            const nou = { ...n, items: [], subChapters: [], measurements: [] };
            delete nou.certifications;
            if (!partida) partida = nou;
            return nou;
        }
        return { ...n, measurements: [], subChapters: neteja(n.subChapters || []), items: neteja(n.items || []) };
    });
    const chapters = neteja(r.chapters);
    if (!partida) throw new Error('El BC3 no porta cap partida');
    return { chapters, prices: r.prices || {}, partida };
};

/** Resum d'una partida per a l'assistent (sense el text llarg sencer, que pot ser molt gran). */
export const resumPartida = (partida, prices) => ({
    codi: normalizeCode(partida.code),
    unitat: partida.unit,
    resum: partida.description,
    text: (partida.fullDescription || '').slice(0, 1500),
    preu: getItemUnitPrice(partida, prices),
    descomposat: (partida.breakdown || []).map(b => ({
        codi: b.code, descripcio: b.description, unitat: b.unit, rendiment: b.yield,
        ...(b.formulaRendiment ? { formula_rendiment: b.formulaRendiment } : {}),
        ...(b.errorRendiment ? { error_rendiment: b.errorRendiment } : {}),
        preu: prices[normalizeCode(b.code)]?.price ?? b.price,
    })),
});

// ─── Accés a la xarxa (navegador) ───

export const navegaCype = async (url, idioma = IDIOMA_CYPE_PER_DEFECTE) => {
    const adreca = url || arrelCype(idioma);
    const { text } = await descarregaPagina(adreca);
    return { url: adreca, ...llegeixNavegacio(text, adreca) };
};

export const fitxaCype = async (url) => {
    const { text } = await descarregaPagina(url);
    const fitxa = llegeixFitxa(text);
    let partida = null;
    if (fitxa.bc3) {
        const bc3 = await descarregaBC3(fitxa.bc3);
        const p = llegeixPartidaBC3(bc3.text);
        partida = resumPartida(p.partida, p.prices);
    }
    return { url, ...fitxa, partida };
};

/** Baixa un BC3 (el d'una fitxa o el que l'usuari ha configurat) i en llegeix la partida. */
export const baixaPartidaCype = async (urlBC3) => {
    const { text } = await descarregaBC3(urlBC3);
    return llegeixPartidaBC3(text);
};
