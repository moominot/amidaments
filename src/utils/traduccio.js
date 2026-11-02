import { normalizeCode } from './calculations';

/**
 * Traducció dels textos d'un projecte o d'una part (veure `docs/traduccio.md`).
 *
 * Aquí hi ha la part que no parla amb ningú: recollir els textos, partir-los en trossos per
 * enviar-los i tornar a posar les traduccions al seu lloc. La crida a l'API és a
 * `utils/assistent/tradueixApi.js`.
 *
 * Els textos es tradueixen **per valor, no per lloc**: es recullen els textos diferents, se'n
 * fa un mapa `original → traduït` i després es recorre l'arbre substituint els camps que hi
 * coincideixen. Així un mateix text repetit en vint partides es tradueix una vegada, i si
 * l'usuari toca alguna cosa mentre es tradueix no es perd res: s'aplica sobre l'estat del moment.
 *
 * Camps que es tradueixen:
 * - capítols i partides: `description` i `fullDescription` (el text llarg);
 * - el descomposat (`breakdown[].description`) i els residus (`waste[].description`);
 * - la base de preus: `summary` dels codis que surten a l'abast;
 * - opcionalment, la descripció de les línies d'amidament;
 * - amb tot el projecte, també la descripció dels paràmetres i el missatge de les condicions.
 * Els codis, unitats, preus i fórmules no es toquen mai.
 */

export const IDIOMES_TRADUCCIO = [
    { id: 'ca', nom: 'Català', nomPrompt: 'català' },
    { id: 'es', nom: 'Castellà', nomPrompt: 'castellà (espanyol d\'Espanya)' },
    { id: 'en', nom: 'Anglès', nomPrompt: 'anglès (britànic)' },
    { id: 'fr', nom: 'Francès', nomPrompt: 'francès' },
];

const fills = (n) => [...(n.subChapters || []), ...(n.items || [])];

const trobaNode = (nodes, id) => {
    for (const n of nodes) {
        if (n.id === id) return n;
        const dins = trobaNode(fills(n), id);
        if (dins) return dins;
    }
    return null;
};

/** Els nodes de l'abast: tot el projecte (`idNode` buit) o el subarbre d'un node. */
const arrelsAbast = (chapters, idNode) => {
    if (!idNode) return chapters || [];
    const n = trobaNode(chapters || [], idNode);
    return n ? [n] : [];
};

/** Un text val la pena de traduir si porta alguna lletra (no només xifres o signes). */
const traduible = (t) => typeof t === 'string' && /\p{L}/u.test(t) && t.trim().length > 1;

/**
 * Els textos diferents de l'abast, en l'ordre en què surten. `opcions.linies`: també les
 * línies d'amidament.
 */
export const recullTextos = ({ budget, priceDatabase }, { idNode = null, linies = true } = {}) => {
    const vists = new Set();
    const textos = [];
    const afegeix = (t) => {
        if (!traduible(t) || vists.has(t)) return;
        vists.add(t);
        textos.push(t);
    };
    const codis = new Set();
    const recorre = (n) => {
        afegeix(n.description);
        afegeix(n.fullDescription);
        if (n.code) codis.add(normalizeCode(n.code));
        (n.breakdown || []).forEach(b => { afegeix(b.description); if (b.code) codis.add(normalizeCode(b.code)); });
        (n.waste || []).forEach(w => afegeix(w.description));
        if (linies) (n.measurements || []).forEach(m => afegeix(m.description));
        fills(n).forEach(recorre);
    };
    arrelsAbast(budget.chapters, idNode).forEach(recorre);
    codis.forEach(c => afegeix(priceDatabase?.[c]?.summary));
    if (!idNode) {
        (budget.parametres || []).forEach(p => afegeix(p.descripcio));
        (budget.condicions || []).forEach(c => afegeix(c.missatge));
    }
    return textos;
};

/**
 * Parteix els textos en trossos de com a molt `maxCaracters` (un text més llarg que el límit
 * va sol). Cada element porta l'índex dins de `textos`.
 */
export const parteixEnTrossos = (textos, maxCaracters = 12000) => {
    const trossos = [];
    let actual = [];
    let mida = 0;
    textos.forEach((t, i) => {
        if (actual.length && mida + t.length > maxCaracters) {
            trossos.push(actual);
            actual = [];
            mida = 0;
        }
        actual.push({ i, t });
        mida += t.length;
    });
    if (actual.length) trossos.push(actual);
    return trossos;
};

/**
 * Posa les traduccions (`Map` original → traduït) dins de l'estat i en torna un de nou. Només
 * toca els camps de l'abast; `summary` de la base de preus, només dels codis de l'abast.
 */
export const aplicaTraduccions = ({ budget, priceDatabase }, mapa, { idNode = null, linies = true } = {}) => {
    const tr = (t) => (typeof t === 'string' && mapa.has(t) ? mapa.get(t) : t);
    const codis = new Set();
    const tradueixNode = (n) => {
        if (n.code) codis.add(normalizeCode(n.code));
        const nou = { ...n, description: tr(n.description) };
        if (n.fullDescription !== undefined) nou.fullDescription = tr(n.fullDescription);
        if (n.breakdown) {
            nou.breakdown = n.breakdown.map(b => {
                if (b.code) codis.add(normalizeCode(b.code));
                return { ...b, description: tr(b.description) };
            });
        }
        if (n.waste) nou.waste = n.waste.map(w => ({ ...w, description: tr(w.description) }));
        if (linies && n.measurements) nou.measurements = n.measurements.map(m => ({ ...m, description: tr(m.description) }));
        if (n.subChapters) nou.subChapters = n.subChapters.map(tradueixNode);
        if (n.items) nou.items = n.items.map(tradueixNode);
        return nou;
    };
    const dinsAbast = (nodes) => nodes.map(n => {
        if (n.id === idNode) return tradueixNode(n);
        return { ...n, subChapters: dinsAbast(n.subChapters || []), items: dinsAbast(n.items || []) };
    });
    const chapters = idNode ? dinsAbast(budget.chapters || []) : (budget.chapters || []).map(tradueixNode);

    const preus = { ...priceDatabase };
    codis.forEach(c => {
        if (preus[c]?.summary && mapa.has(preus[c].summary)) preus[c] = { ...preus[c], summary: mapa.get(preus[c].summary) };
    });

    const nouBudget = { ...budget, chapters };
    if (!idNode) {
        if (budget.parametres) nouBudget.parametres = budget.parametres.map(p => ({ ...p, descripcio: tr(p.descripcio) }));
        if (budget.condicions) nouBudget.condicions = budget.condicions.map(c => ({ ...c, missatge: tr(c.missatge) }));
    }
    return { budget: nouBudget, priceDatabase: preus };
};

/**
 * Estimació del cost en dòlars: uns 3,5 caràcters per tòquen, la mateixa quantitat de sortida
 * que d'entrada i un recàrrec per al format i el raonament. És orientativa.
 */
export const estimaTokens = (textos) => {
    const caracters = textos.reduce((s, t) => s + t.length, 0);
    const tokens = Math.ceil(caracters / 3.5);
    return { caracters, entrada: Math.ceil(tokens * 1.3) + 600, sortida: Math.ceil(tokens * 1.4) };
};
