import {
    normalizeCode, calcItemTotalQty, calcItemTotalAmount, calcChapterTotal, getItemUnitPrice, getComponentCategory, round2, formatNumber,
} from '../calculations';
import { resolveFormules, comprovaCondicions, resumLimits } from '../parametres';
import { resolveMeasurementRefs } from '../measurementRefs';
import { interpretaCamp, esNomValid } from '../formules';
import { resumPartida } from './cype';
import { recullTextos, aplicaTraduccions, IDIOMES_TRADUCCIO } from '../traduccio';

/**
 * Eines de l'assistent sobre el projecte obert (veure `docs/assistent.md`).
 *
 * Cada eina és una funció `(estat, input, ctx) → { estat, resultat, resum }`:
 * - `estat` és `{ budget, priceDatabase }` i no es modifica: se'n torna un de nou, com les
 *   mutacions de l'arbre de l'aplicació. Qui crida decideix quan el desa;
 * - `resultat` és el que veu el model (es passa a JSON);
 * - `resum` és una línia per al registre del xat.
 *
 * Els errors de l'usuari del model (un codi que no existeix, un capítol que no hi és) es
 * llancen com a `ErrorEina` i tornen al model com a `tool_result` amb `is_error`, perquè els
 * corregeixi. Les eines de xarxa reben les funcions de `cype.js` per `ctx.xarxa`: així es
 * poden provar sense xarxa.
 */

export class ErrorEina extends Error {}

const nouId = () => crypto.randomUUID();

const recorre = (nodes, fn, pare = null) => nodes.forEach(n => {
    fn(n, pare);
    recorre([...(n.subChapters || []), ...(n.items || [])], fn, n);
});

const buscaNode = (chapters, codi, { nomesCapitols = false, nomesPartides = false } = {}) => {
    const c = normalizeCode(codi);
    let trobat = null;
    recorre(chapters, n => {
        if (trobat || normalizeCode(n.code) !== c) return;
        if (nomesCapitols && n.unit) return;
        if (nomesPartides && !n.unit) return;
        trobat = n;
    });
    return trobat;
};

const mapaArbre = (nodes, fn) => nodes.map(n => fn({
    ...n,
    subChapters: mapaArbre(n.subChapters || [], fn),
    items: mapaArbre(n.items || [], fn),
}));

const resol = (budget) =>
    resolveMeasurementRefs(resolveFormules(budget.chapters || [], budget.parametres || []).chapters).chapters;

/** Fusiona capítols per codi (el que arriba va a parar al capítol que ja hi ha amb el mateix codi). */
const fusionaArbre = (existents, nous) => {
    const out = [...existents];
    nous.forEach(nou => {
        const i = nou.unit ? -1 : out.findIndex(x => !x.unit && normalizeCode(x.code) === normalizeCode(nou.code));
        if (i < 0) { out.push(nou); return; }
        out[i] = {
            ...out[i],
            subChapters: fusionaArbre(out[i].subChapters || [], nou.subChapters || []),
            items: fusionaArbre(out[i].items || [], nou.items || []),
        };
    });
    return out;
};

const ambIdsNous = (nodes) => nodes.map(n => ({
    ...n,
    id: nouId(),
    measurements: (n.measurements || []).map(m => ({ ...m, id: nouId() })),
    subChapters: ambIdsNous(n.subChapters || []),
    items: ambIdsNous(n.items || []),
}));

/** Un valor d'una línia: número, o text que és número o fórmula. */
const camp = (v) => {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? { valor: v } : null;
    return interpretaCamp(String(v));
};

const lineaDe = (l) => {
    const m = { id: nouId(), description: String(l.descripcio || ''), units: 1, length: 0, width: 0, height: 0 };
    const formules = {};
    [['units', l.ud], ['length', l.ll], ['width', l.am], ['height', l.al]].forEach(([c, v]) => {
        const r = camp(v);
        if (!r) return;
        if ('valor' in r) m[c] = r.valor;
        else formules[c] = r.formula;
    });
    if (Object.keys(formules).length) m.formules = formules;
    return m;
};

const textLinia = (m) => {
    const v = (c) => (m.formules?.[c] ? `=${m.formules[c]}` : m[c]);
    return { descripcio: m.description, ud: v('units'), ll: v('length'), am: v('width'), al: v('height'), ...(m.refCode ? { vincle: m.refCode, factor: m.factor } : {}) };
};

// ─── Lectura ───

const resumArbre = (nodes, preus, limit) => {
    let compte = 0;
    const fes = (ns) => ns.map(n => {
        if (compte >= limit) return null;
        compte++;
        if (n.unit) {
            return {
                codi: normalizeCode(n.code), unitat: n.unit, descripcio: n.description,
                quantitat: calcItemTotalQty(n), preu: getItemUnitPrice(n, preus), import: calcItemTotalAmount(n, preus),
            };
        }
        return {
            codi: normalizeCode(n.code), descripcio: n.description, import: round2(calcChapterTotal(n, preus)),
            fills: fes([...(n.subChapters || []), ...(n.items || [])]).filter(Boolean),
        };
    });
    const arbre = fes(nodes).filter(Boolean);
    return { arbre, truncat: compte >= limit };
};

const llegeixProjecte = ({ budget, priceDatabase }) => {
    const chapters = resol(budget);
    const ambF = resolveFormules(budget.chapters || [], budget.parametres || []);
    const comprovacio = comprovaCondicions(budget.parametres || [], budget.condicions || [], ambF.parametres);
    const { arbre, truncat } = resumArbre(chapters, priceDatabase, 400);
    return {
        nom: budget.name,
        pem: round2(chapters.reduce((a, c) => a + calcChapterTotal(c, priceDatabase), 0)),
        parametres: (budget.parametres || []).map(p => ({
            nom: p.nom,
            ...(p.formula ? { formula: p.formula } : { valor: p.valor }),
            calculat: ambF.parametres.valors.get(p.nom),
            unitat: p.unitat || '', descripcio: p.descripcio || '', grup: p.grup || '',
            ...(resumLimits(p) ? { limits: resumLimits(p) } : {}),
            ...(ambF.parametres.errors.has(p.id) ? { error: ambF.parametres.errors.get(p.id) } : {}),
        })),
        condicions: comprovacio.generals.map(c => ({ expressio: c.expressio, missatge: c.missatge || '', ok: c.ok, ...(c.error ? { error: c.error } : {}) })),
        arbre,
        ...(truncat ? { truncat: 'El projecte és gran: només surten els primers 400 elements. Fes servir llegeix_partida per als detalls.' } : {}),
    };
};

const llegeixPartida = ({ budget, priceDatabase }, { codi }) => {
    const p = buscaNode(resol(budget), codi, { nomesPartides: true });
    if (!p) throw new ErrorEina(`No hi ha cap partida amb el codi ${codi}`);
    const original = buscaNode(budget.chapters, codi, { nomesPartides: true });
    return {
        ...resumPartida(p, priceDatabase),
        quantitat: calcItemTotalQty(p),
        import: calcItemTotalAmount(p, priceDatabase),
        linies: (original.measurements || []).map(textLinia),
    };
};

const CATEGORIES = { material: 'material', ma_obra: 'labor', maquinaria: 'machinery' };

const consultaPreus = ({ budget, priceDatabase }, { cerca = '', tipus = 'tots', limit = 30 }) => {
    const t = String(cerca).toLowerCase().trim();
    const partides = new Set();
    recorre(budget.chapters || [], n => { if (n.unit) partides.add(normalizeCode(n.code)); });
    const out = [];
    Object.entries(priceDatabase || {}).forEach(([codi, d]) => {
        if (!d?.unit) return;
        const categoria = getComponentCategory(codi) === 'material' && codi.toLowerCase().startsWith('mq') ? 'machinery' : getComponentCategory(codi);
        const esPartida = partides.has(codi);
        if (tipus === 'partida' && !esPartida) return;
        if (CATEGORIES[tipus] && categoria !== CATEGORIES[tipus]) return;
        const desc = String(d.summary || '');
        if (t && !codi.toLowerCase().includes(t) && !desc.toLowerCase().includes(t)) return;
        out.push({ codi, descripcio: desc, unitat: d.unit, preu: d.price, ...(esPartida ? { partida: true } : {}), ...(d.font ? { font: d.font } : {}) });
    });
    return { total: out.length, resultats: out.slice(0, Math.min(Number(limit) || 30, 100)) };
};

// ─── Escriptura ───

const creaCapitol = ({ budget, priceDatabase }, { codi, descripcio, pare }) => {
    if (buscaNode(budget.chapters, codi)) throw new ErrorEina(`Ja hi ha un capítol o una partida amb el codi ${codi}`);
    const nou = { id: nouId(), code: codi, description: descripcio, subChapters: [], items: [] };
    let chapters;
    if (pare) {
        const p = buscaNode(budget.chapters, pare, { nomesCapitols: true });
        if (!p) throw new ErrorEina(`No hi ha cap capítol amb el codi ${pare}`);
        chapters = mapaArbre(budget.chapters, n => (n.id === p.id ? { ...n, subChapters: [...n.subChapters, nou] } : n));
    } else {
        chapters = [...budget.chapters, nou];
    }
    return { estat: { budget: { ...budget, chapters }, priceDatabase }, resultat: { fet: true, codi }, resum: `Capítol ${codi} · ${descripcio}` };
};

/**
 * Les línies d'un descomposat. Un component que ja és a la base de preus es fa servir tal com
 * és (el preu del projecte mana); un de nou s'hi afegeix amb la descripció, la unitat, el preu i
 * la font que doni el model.
 */
const descomposatDe = (linies, priceDatabase) => {
    const preus = { ...priceDatabase };
    const avisos = [];
    const breakdown = (linies || []).map(l => {
        const codi = normalizeCode(l.codi);
        if (!codi) throw new ErrorEina('Una línia del descomposat no té codi');
        const existent = preus[codi];
        if (existent) {
            if (l.preu !== undefined && Number(l.preu) !== Number(existent.price)) {
                avisos.push(`${codi} ja era a la base de preus a ${existent.price}: s'ha mantingut aquest preu`);
            }
        } else {
            if (!l.descripcio || !l.unitat || l.preu === undefined) {
                throw new ErrorEina(`${codi} no és a la base de preus: cal donar-ne la descripció, la unitat i el preu`);
            }
            preus[codi] = { code: codi, summary: l.descripcio, unit: l.unitat, price: Number(l.preu), ...(l.font ? { font: l.font } : {}) };
        }
        const d = preus[codi];
        return { code: codi, description: d.summary, unit: d.unit, yield: Number(l.rendiment), price: d.price };
    });
    return { breakdown, preus, avisos };
};

const creaPartida = ({ budget, priceDatabase }, input) => {
    const { codi, unitat, descripcio, text, capitol, preu, descomposat, font } = input;
    if (buscaNode(budget.chapters, codi)) throw new ErrorEina(`Ja hi ha un capítol o una partida amb el codi ${codi}`);
    const cap = buscaNode(budget.chapters, capitol, { nomesCapitols: true });
    if (!cap) throw new ErrorEina(`No hi ha cap capítol amb el codi ${capitol}. Crea'l abans amb crea_capitol.`);
    if (!descomposat?.length && preu === undefined) throw new ErrorEina('Cal un preu o un descomposat');

    const { breakdown, preus, avisos } = descomposatDe(descomposat, priceDatabase);
    const partida = {
        id: nouId(), code: codi, unit: unitat, description: descripcio, fullDescription: text || descripcio,
        price: 0, breakdown, measurements: [], subChapters: [], items: [],
    };
    partida.price = breakdown.length ? getItemUnitPrice(partida, preus) : Number(preu);
    preus[normalizeCode(codi)] = { code: codi, summary: descripcio, unit: unitat, price: partida.price, ...(font ? { font } : {}) };
    const chapters = mapaArbre(budget.chapters, n => (n.id === cap.id ? { ...n, items: [...n.items, partida] } : n));
    return {
        estat: { budget: { ...budget, chapters }, priceDatabase: preus },
        resultat: { fet: true, codi, preu: partida.price, ...(avisos.length ? { avisos } : {}) },
        resum: `Partida ${codi} · ${descripcio} · ${formatNumber(partida.price)} €/${unitat}`,
    };
};

const modificaPartida = ({ budget, priceDatabase }, input) => {
    const { codi } = input;
    const p = buscaNode(budget.chapters, codi, { nomesPartides: true });
    if (!p) throw new ErrorEina(`No hi ha cap partida amb el codi ${codi}`);
    let preus = { ...priceDatabase };
    const canvis = {};
    if (input.descripcio) canvis.description = input.descripcio;
    if (input.text) canvis.fullDescription = input.text;
    if (input.unitat) canvis.unit = input.unitat;
    let avisos = [];
    if (input.descomposat) {
        const d = descomposatDe(input.descomposat, preus);
        preus = d.preus;
        avisos = d.avisos;
        canvis.breakdown = d.breakdown;
    }
    const nova = { ...p, ...canvis };
    const c = normalizeCode(codi);
    // Amb descomposat, el preu el fa el descomposat; sense, el que es doni.
    if ((nova.breakdown || []).length) nova.price = getItemUnitPrice(nova, preus);
    else if (input.preu !== undefined) nova.price = Number(input.preu);
    preus[c] = {
        ...(preus[c] || { code: codi }),
        price: nova.price, summary: nova.description, unit: nova.unit,
        ...(input.font ? { font: input.font } : {}),
    };
    const chapters = mapaArbre(budget.chapters, n => (n.id === p.id ? nova : n));
    return {
        estat: { budget: { ...budget, chapters }, priceDatabase: preus },
        resultat: { fet: true, codi, preu: getItemUnitPrice(nova, preus), ...(avisos.length ? { avisos } : {}) },
        resum: `Partida ${codi} modificada`,
    };
};

const posaLinies = ({ budget, priceDatabase }, { partida, linies, afegeix = false }) => {
    const p = buscaNode(budget.chapters, partida, { nomesPartides: true });
    if (!p) throw new ErrorEina(`No hi ha cap partida amb el codi ${partida}`);
    const noves = (linies || []).map(lineaDe);
    const chapters = mapaArbre(budget.chapters, n => (n.id === p.id
        ? { ...n, measurements: afegeix ? [...(n.measurements || []), ...noves] : noves }
        : n));
    const nouBudget = { ...budget, chapters };
    const resolta = buscaNode(resol(nouBudget), partida, { nomesPartides: true });
    const errors = (resolta.measurements || []).filter(m => m.errorsFormula).map(m => `${m.description}: ${Object.values(m.errorsFormula).join('; ')}`);
    return {
        estat: { budget: nouBudget, priceDatabase },
        resultat: { fet: true, partida, quantitat: calcItemTotalQty(resolta), ...(errors.length ? { errors_de_formula: errors } : {}) },
        resum: `Línies de ${partida}: ${noves.length} · quantitat ${formatNumber(calcItemTotalQty(resolta), 3)} ${p.unit}`,
    };
};

const posaParametre = ({ budget, priceDatabase }, input) => {
    const { nom } = input;
    if (!esNomValid(nom)) throw new ErrorEina(`Nom de paràmetre no vàlid: «${nom}». Lletres, xifres i _, i que comenci per lletra.`);
    const parametres = [...(budget.parametres || [])];
    const i = parametres.findIndex(p => p.nom === nom);
    const base = i >= 0 ? parametres[i] : { id: nouId(), nom, valor: 0, formula: '', unitat: '', descripcio: '', grup: '' };
    const nou = { ...base };
    if (input.formula !== undefined) { nou.formula = String(input.formula); }
    if (input.valor !== undefined) { nou.valor = Number(input.valor); nou.formula = ''; }
    ['unitat', 'descripcio', 'grup'].forEach(k => { if (input[k] !== undefined) nou[k] = input[k]; });
    ['min', 'max'].forEach(k => { if (input[k] !== undefined) nou[k] = input[k] === null ? '' : Number(input[k]); });
    if (input.enter !== undefined) nou.enter = !!input.enter;
    if (i >= 0) parametres[i] = nou; else parametres.push(nou);
    const nouBudget = { ...budget, parametres };
    const r = resolveFormules([], parametres).parametres;
    return {
        estat: { budget: nouBudget, priceDatabase },
        resultat: { fet: true, nom, valor: r.valors.get(nom), ...(r.errors.has(nou.id) ? { error: r.errors.get(nou.id) } : {}) },
        resum: `Paràmetre ${nom} = ${nou.formula || nou.valor}${nou.unitat ? ` ${nou.unitat}` : ''}`,
    };
};

const posaCondicio = ({ budget, priceDatabase }, { expressio, missatge = '' }) => {
    const condicions = [...(budget.condicions || [])];
    const i = condicions.findIndex(c => c.expressio === expressio);
    if (i >= 0) condicions[i] = { ...condicions[i], missatge };
    else condicions.push({ id: nouId(), expressio, missatge });
    const nouBudget = { ...budget, condicions };
    const ambF = resolveFormules([], nouBudget.parametres || []);
    const estatCondicio = comprovaCondicions(nouBudget.parametres || [], condicions, ambF.parametres).generals.find(c => c.expressio === expressio);
    return {
        estat: { budget: nouBudget, priceDatabase },
        resultat: { fet: true, expressio, ok: estatCondicio.ok, ...(estatCondicio.error ? { error: estatCondicio.error } : {}) },
        resum: `Condició ${expressio}`,
    };
};

const esborra = ({ budget, priceDatabase }, { codi, parametre, condicio }) => {
    if (codi) {
        const n = buscaNode(budget.chapters, codi);
        if (!n) throw new ErrorEina(`No hi ha res amb el codi ${codi}`);
        const treu = (nodes) => nodes.filter(x => x.id !== n.id).map(x => ({ ...x, subChapters: treu(x.subChapters || []), items: treu(x.items || []) }));
        return { estat: { budget: { ...budget, chapters: treu(budget.chapters) }, priceDatabase }, resultat: { fet: true }, resum: `Esborrat ${codi}` };
    }
    if (parametre) {
        if (!(budget.parametres || []).some(p => p.nom === parametre)) throw new ErrorEina(`No hi ha cap paràmetre ${parametre}`);
        return { estat: { budget: { ...budget, parametres: budget.parametres.filter(p => p.nom !== parametre) }, priceDatabase }, resultat: { fet: true }, resum: `Esborrat el paràmetre ${parametre}` };
    }
    if (condicio) {
        return { estat: { budget: { ...budget, condicions: (budget.condicions || []).filter(c => c.expressio !== condicio) }, priceDatabase }, resultat: { fet: true }, resum: `Esborrada la condició ${condicio}` };
    }
    throw new ErrorEina('Digues què s\'ha d\'esborrar: codi, parametre o condicio');
};

/**
 * Posa al projecte una partida baixada de CYPE (`cype.llegeixPartidaBC3`). Per defecte amb el
 * seu arbre de capítols de CYPE, fusionat per codi amb el del projecte; amb `capitol`, dins
 * d'aquell capítol del projecte. Els preus del projecte manen sobre els de CYPE.
 */
export const posaPartidaCype = ({ budget, priceDatabase }, importada, { capitol, codi } = {}) => {
    const partida = importada.partida;
    const c = normalizeCode(codi || partida.code);
    if (buscaNode(budget.chapters, c, { nomesPartides: true })) {
        throw new ErrorEina(`La partida ${c} ja és al projecte. Si en vols una altra configuració, dona-li un codi diferent amb el paràmetre codi.`);
    }
    const ambCodi = (nodes) => mapaArbre(nodes, n => (n.unit && normalizeCode(n.code) === normalizeCode(partida.code) ? { ...n, code: c } : n));
    let chapters;
    if (capitol) {
        const cap = buscaNode(budget.chapters, capitol, { nomesCapitols: true });
        if (!cap) throw new ErrorEina(`No hi ha cap capítol amb el codi ${capitol}`);
        const [nova] = ambIdsNous([{ ...partida, code: c }]);
        chapters = mapaArbre(budget.chapters, n => (n.id === cap.id ? { ...n, items: [...n.items, nova] } : n));
    } else {
        chapters = fusionaArbre(budget.chapters, ambIdsNous(ambCodi(importada.chapters)));
    }
    const prices = { ...importada.prices };
    if (c !== normalizeCode(partida.code) && prices[normalizeCode(partida.code)]) {
        prices[c] = { ...prices[normalizeCode(partida.code)], code: c };
        delete prices[normalizeCode(partida.code)];
    }
    const preus = { ...prices, ...priceDatabase };
    const posada = buscaNode(chapters, c, { nomesPartides: true });
    return {
        estat: { budget: { ...budget, chapters }, priceDatabase: preus },
        resultat: { fet: true, ...resumPartida(posada, preus), text: undefined },
        resum: `Importada ${c} · ${partida.description}`,
    };
};

// ─── Definicions per a l'API ───

const num = { type: 'number' };
const str = { type: 'string' };
const numOFormula = { type: ['number', 'string'], description: 'Número o fórmula amb paràmetres (L*2, (P1+P2)/2). Buit = 1 a Ll, Am i Al.' };

export const DEFINICIONS = [
    {
        name: 'llegeix_projecte',
        description: 'Torna el projecte obert: PEM, paràmetres (amb el valor calculat), condicions i l\'arbre de capítols i partides amb quantitat, preu i import. Crida-la abans de modificar res i després per comprovar el resultat.',
        input_schema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
        name: 'llegeix_partida',
        description: 'Detall d\'una partida del projecte: text, descomposat amb rendiments i preus, i les línies d\'amidament amb les fórmules.',
        input_schema: { type: 'object', properties: { codi: str }, required: ['codi'], additionalProperties: false },
    },
    {
        name: 'consulta_preus',
        description: 'Cerca a la base de preus del projecte (partides, materials, mà d\'obra, maquinària) per codi o descripció. Fes-la servir abans de crear un component nou: si ja hi és, reaprofita\'l amb el seu codi.',
        input_schema: {
            type: 'object',
            properties: {
                cerca: { type: 'string', description: 'Text a buscar al codi o a la descripció. Buit = tot.' },
                tipus: { type: 'string', enum: ['tots', 'partida', 'material', 'ma_obra', 'maquinaria'] },
                limit: num,
            },
            additionalProperties: false,
        },
    },
    {
        name: 'cype_navega',
        description: 'Llista els capítols i les partides d\'una pàgina del Generador de Preus de CYPE. Sense url, l\'arrel en l\'idioma que l\'usuari ha triat al panell (català o castellà). Navega de capítol en capítol fins a trobar la partida.',
        input_schema: { type: 'object', properties: { url: str }, additionalProperties: false },
    },
    {
        name: 'cype_fitxa',
        description: 'Fitxa d\'una partida del Generador de Preus: unitat, opcions amb el valor triat per defecte, enllaç del BC3 i la partida d\'aquest BC3 (text, preu i descomposat). Les opcions no es poden canviar des d\'aquí.',
        input_schema: { type: 'object', properties: { url: str }, required: ['url'], additionalProperties: false },
    },
    {
        name: 'cype_importa',
        description: 'Importa al projecte la partida d\'un BC3 del Generador de Preus (el de la fitxa o un que hagi configurat l\'usuari). Per defecte va amb el seu arbre de capítols de CYPE; amb capitol, dins d\'aquell capítol del projecte. Amb codi, se li posa un codi diferent (per tenir dues configuracions de la mateixa partida).',
        input_schema: { type: 'object', properties: { url_bc3: str, capitol: str, codi: str }, required: ['url_bc3'], additionalProperties: false },
    },
    {
        name: 'crea_capitol',
        description: 'Crea un capítol. Sense pare, a l\'arrel.',
        input_schema: { type: 'object', properties: { codi: str, descripcio: str, pare: str }, required: ['codi', 'descripcio'], additionalProperties: false },
    },
    {
        name: 'crea_partida',
        description: 'Crea una partida pròpia en un capítol existent, amb un preu directe o amb un descomposat. Als components del descomposat que ja són a la base de preus només cal el codi i el rendiment; als nous, descripció, unitat, preu i la font d\'on surt el preu. Els costos indirectes van com a línia amb codi que conté % (p. ex. %0700), unitat % i rendiment = percentatge.',
        input_schema: {
            type: 'object',
            properties: {
                codi: str, unitat: str, descripcio: str,
                text: { type: 'string', description: 'Descripció llarga, com al plec' },
                capitol: { type: 'string', description: 'Codi del capítol on va' },
                preu: num,
                font: { type: 'string', description: 'D\'on surt el preu (URL i data) si no és d\'un descomposat' },
                descomposat: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: { codi: str, rendiment: num, descripcio: str, unitat: str, preu: num, font: str },
                        required: ['codi', 'rendiment'],
                        additionalProperties: false,
                    },
                },
            },
            required: ['codi', 'unitat', 'descripcio', 'capitol'],
            additionalProperties: false,
        },
    },
    {
        name: 'modifica_partida',
        description: 'Canvia la descripció, el text, la unitat, el preu o el descomposat d\'una partida que ja hi és.',
        input_schema: {
            type: 'object',
            properties: {
                codi: str, descripcio: str, text: str, unitat: str, preu: num, font: str,
                descomposat: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: { codi: str, rendiment: num, descripcio: str, unitat: str, preu: num, font: str },
                        required: ['codi', 'rendiment'],
                        additionalProperties: false,
                    },
                },
            },
            required: ['codi'],
            additionalProperties: false,
        },
    },
    {
        name: 'posa_linies',
        description: 'Posa les línies d\'amidament d\'una partida (les substitueix; amb afegeix, s\'hi sumen). Cada camp pot ser un número o una fórmula amb paràmetres. Torna la quantitat resultant i els errors de fórmula si n\'hi ha.',
        input_schema: {
            type: 'object',
            properties: {
                partida: str,
                afegeix: { type: 'boolean' },
                linies: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: { descripcio: str, ud: numOFormula, ll: numOFormula, am: numOFormula, al: numOFormula },
                        required: ['descripcio'],
                        additionalProperties: false,
                    },
                },
            },
            required: ['partida', 'linies'],
            additionalProperties: false,
        },
    },
    {
        name: 'posa_parametre',
        description: 'Crea o canvia un paràmetre del projecte: un valor o una fórmula d\'altres paràmetres, amb unitat, descripció, grup i límits (min, max, enter). Els paràmetres que no són fórmula són els que es demanaran en inserir el sistema.',
        input_schema: {
            type: 'object',
            properties: {
                nom: str, valor: num, formula: str, unitat: str, descripcio: str, grup: str,
                min: num, max: num, enter: { type: 'boolean' },
            },
            required: ['nom'],
            additionalProperties: false,
        },
    },
    {
        name: 'posa_condicio',
        description: 'Afegeix una condició entre paràmetres (una fórmula que ha de donar cert, p. ex. P2>=P1 o i(A>0; A<=L)) amb el missatge si no es compleix.',
        input_schema: { type: 'object', properties: { expressio: str, missatge: str }, required: ['expressio'], additionalProperties: false },
    },
    {
        name: 'tradueix',
        description: 'Tradueix partides, capítols (amb tot el que contenen) o tot el projecte a un altre idioma: descripcions, textos llargs, descomposat, base de preus dels seus codis i, si linies no és false, les línies d\'amidament. Codis, unitats, preus i fórmules no es toquen. Fes-la servir en comptes de reescriure els textos amb modifica_partida: és més barata i es desfà d\'un cop. Sense codis, tot el projecte (pregunta-ho abans si és gran).',
        input_schema: {
            type: 'object',
            properties: {
                idioma: { type: 'string', enum: IDIOMES_TRADUCCIO.map(x => x.id), description: 'ca català, es castellà, en anglès, fr francès' },
                codis: { type: 'array', items: str, description: 'Codis de partides o capítols. Buit o absent: tot el projecte.' },
                linies: { type: 'boolean', description: 'També la descripció de les línies d\'amidament (per defecte, sí).' },
            },
            required: ['idioma'],
            additionalProperties: false,
        },
    },
    {
        name: 'esborra',
        description: 'Esborra un capítol o una partida (per codi), un paràmetre (per nom) o una condició (per expressió).',
        input_schema: { type: 'object', properties: { codi: str, parametre: str, condicio: str }, additionalProperties: false },
    },
];

/**
 * Comprova un input contra l'esquema de la seva eina: camps obligatoris i tipus. Amb el
 * streaming de l'input activat, el servidor ja no el valida, i el SDK pot tornar un objecte
 * escapçat sense queixar-se.
 */
export const validaInput = (nom, input) => {
    const def = DEFINICIONS.find(d => d.name === nom);
    if (!def) return `Eina desconeguda: ${nom}`;
    if (!input || typeof input !== 'object' || Array.isArray(input)) return 'L\'input ha de ser un objecte';
    const tipusDe = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
    const comprova = (esquema, valor, cami) => {
        const tipus = Array.isArray(esquema.type) ? esquema.type : [esquema.type];
        const t = tipusDe(valor);
        if (!tipus.includes(t === 'number' && !Number.isFinite(valor) ? 'x' : t)) return `${cami}: s'esperava ${tipus.join(' o ')}`;
        if (esquema.enum && !esquema.enum.includes(valor)) return `${cami}: ha de ser ${esquema.enum.join(', ')}`;
        if (t === 'object') {
            for (const r of esquema.required || []) if (valor[r] === undefined) return `${cami}: falta ${r}`;
            for (const [k, v] of Object.entries(valor)) {
                if (!esquema.properties?.[k]) return `${cami}: camp desconegut ${k}`;
                const e = comprova(esquema.properties[k], v, `${cami}.${k}`);
                if (e) return e;
            }
        }
        if (t === 'array' && esquema.items) {
            for (let i = 0; i < valor.length; i++) {
                const e = comprova(esquema.items, valor[i], `${cami}[${i}]`);
                if (e) return e;
            }
        }
        return null;
    };
    return comprova(def.input_schema, input, nom);
};

/**
 * Tradueix amb el mateix camí que el botó «Tradueix» (`utils/traduccio.js`): la traducció la fa
 * `ctx.tradueix(textos, idioma)`, que el panell connecta a l'API amb esforç baix, i no passa pel
 * context de la conversa. L'estat es torna a llegir després, com a `cype_importa`.
 */
const tradueixEina = async ({ idioma, codis = [], linies = true }, llegeix, ctx) => {
    if (!ctx.tradueix) throw new ErrorEina('La traducció no està disponible aquí');
    const abans = llegeix();
    const ids = [];
    const noTrobats = [];
    codis.forEach(c => {
        const n = buscaNode(abans.budget.chapters || [], c);
        if (n) ids.push(n.id); else noTrobats.push(c);
    });
    if (codis.length && !ids.length) throw new ErrorEina(`No hi ha cap partida ni capítol amb els codis ${codis.join(', ')}`);
    const abasts = ids.length ? ids : [null];
    const textos = [...new Set(abasts.flatMap(idNode => recullTextos(abans, { idNode, linies })))];
    if (!textos.length) return { estat: abans, resultat: { fet: true, traduits: 0, avis: 'No hi ha cap text per traduir' }, resum: 'Res a traduir' };

    const { mapa, pendents } = await ctx.tradueix(textos, idioma);
    let estat = llegeix();
    abasts.forEach(idNode => { estat = aplicaTraduccions(estat, mapa, { idNode, linies }); });
    const nomIdioma = IDIOMES_TRADUCCIO.find(x => x.id === idioma)?.nom || idioma;
    return {
        estat,
        resultat: { fet: true, traduits: mapa.size, pendents, ...(noTrobats.length ? { codis_no_trobats: noTrobats } : {}) },
        resum: `Traduïts ${mapa.size} textos al ${nomIdioma.toLowerCase()}${ids.length ? ` (${codis.filter(c => !noTrobats.includes(c)).join(', ')})` : ' (tot el projecte)'}${pendents ? ` · ${pendents} pendents` : ''}`,
    };
};

/**
 * Executa una eina. `ctx.xarxa` porta `navegaCype`, `fitxaCype` i `baixaPartidaCype`;
 * `ctx.idioma`, l'idioma del Generador de Preus triat al panell (`ca` o `es`).
 * Torna `{ estat, resultat, resum }`; l'estat és el mateix objecte si l'eina no l'ha canviat.
 *
 * `estatOFuncio` pot ser l'estat o una funció que el torna: les eines que baixen alguna cosa
 * el llegeixen després de la descàrrega, perquè el que l'usuari hagi tocat mentrestant no es
 * perdi.
 */
export const executaEina = async (nom, input, estatOFuncio, ctx = {}) => {
    const llegeix = () => (typeof estatOFuncio === 'function' ? estatOFuncio() : estatOFuncio);
    if (nom === 'tradueix') return tradueixEina(input, llegeix, ctx);
    if (nom === 'cype_importa') {
        const importada = await ctx.xarxa.baixaPartidaCype(input.url_bc3);
        return posaPartidaCype(llegeix(), importada, { capitol: input.capitol, codi: input.codi });
    }
    const estat = llegeix();
    const sense = (resultat, resum) => ({ estat, resultat, resum });
    switch (nom) {
        case 'llegeix_projecte': return sense(llegeixProjecte(estat), 'Llegeix el projecte');
        case 'llegeix_partida': return sense(llegeixPartida(estat, input), `Llegeix ${input.codi}`);
        case 'consulta_preus': {
            const r = consultaPreus(estat, input);
            return sense(r, `Consulta preus «${input.cerca || ''}»: ${r.total}`);
        }
        case 'cype_navega': {
            const r = await ctx.xarxa.navegaCype(input.url, ctx.idioma);
            return sense(r, `CYPE · ${r.titol.split('.')[0] || 'arrel'}`);
        }
        case 'cype_fitxa': {
            const r = await ctx.xarxa.fitxaCype(input.url);
            return sense(r, `CYPE · fitxa ${r.partida?.codi || ''} ${r.titol}`);
        }
        case 'crea_capitol': return creaCapitol(estat, input);
        case 'crea_partida': return creaPartida(estat, input);
        case 'modifica_partida': return modificaPartida(estat, input);
        case 'posa_linies': return posaLinies(estat, input);
        case 'posa_parametre': return posaParametre(estat, input);
        case 'posa_condicio': return posaCondicio(estat, input);
        case 'esborra': return esborra(estat, input);
        default: throw new ErrorEina(`Eina desconeguda: ${nom}`);
    }
};

