/**
 * Reimportar un IFC sobre un projecte que ja n'ha rebut un: actualitzar, no duplicar.
 *
 * El vincle és el `GlobalId`, que cada línia importada porta a `linia.ifc.guid`. En tornar a obrir
 * el model es compara element per element:
 *
 *   · **canvis**       la quantitat ha canviat: s'actualitza la línia (unitats i llargada);
 *   · **conflictes**   ha canviat i, a més, algú havia tocat la línia a mà o hi ha una fórmula:
 *                      no s'hi toca si l'usuari no ho demana (`sobreescriu`);
 *   · **afegides**     elements nous d'un tipus que ja és al projecte: línia nova a la mateixa partida;
 *   · **noves partides** elements d'un tipus que no hi era: es poden inserir pel camí normal;
 *   · **eliminades**   el `GlobalId` ja no és al model: no s'esborra res si l'usuari no ho demana (`treu`).
 *
 * Mai no es toquen els preus, el descomposat, la descripció ni els vincles a un banc: només les
 * xifres de les línies que venen de l'IFC.
 *
 * La quantitat es torna a calcular **en la unitat de la partida del projecte** (no en la que
 * proposaria la importació): una partida vinculada a un concepte del banc en m³ s'ha d'actualitzar
 * en m³. I la xifra que es reutilitza (`geometria` o `qto`) és la que es va triar en importar.
 */

import { cadUnitKind } from '../cadPaste.js';
import { normalizeCode } from '../calculations.js';
import { liniaPerElement, muntaPressupost } from './pressupost.js';

const fills = (n) => [...(n.subChapters || []), ...(n.items || [])];
const recorre = (nodes, f) => nodes.forEach(n => { f(n); recorre(fills(n), f); });

/** `kg` no és una unitat del CAD, però sí una de les d'aquest mòdul. */
const unitatAmidable = (u) => cadUnitKind(u) || (/^kg$/i.test((u || '').trim()) ? 'kg' : null);

/** L'import d'una línia, com el calcula `calcMeasureTotal` (buit = 1 a Ll/Am/Al). */
const importDeLinia = (l) => (Number(l.units) || 0) * (Number(l.length) || 1) * (Number(l.width) || 1) * (Number(l.height) || 1);
const igual = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
const teFormula = (l) => !!l.formules && Object.values(l.formules).some(Boolean);

/** Totes les línies del projecte que vénen d'un IFC: `guid → { node, linia }`. */
export const liniesIfc = (chapters) => {
    const m = new Map();
    recorre(chapters || [], n => (n.measurements || []).forEach(l => { if (l.ifc?.guid) m.set(l.ifc.guid, { node: n, linia: l }); }));
    return m;
};

export const teLiniesIfc = (chapters) => liniesIfc(chapters).size > 0;

/** Codis `IFC.XXX.nn` ja ocupats al projecte → el número més alt de cada abreviatura. */
const maxSequencies = (chapters, prefix) => {
    const max = {};
    const re = new RegExp(`^${prefix.replace(/\./g, '\\.')}\\.([A-Z0-9]+)\\.(\\d+)$`);
    recorre(chapters || [], n => {
        const m = re.exec(normalizeCode(n.code));
        if (m) max[m[1]] = Math.max(max[m[1]] || 0, Number(m[2]));
    });
    return max;
};

/**
 * Compara el model amb el projecte.
 *
 * @param {object[]} chapters  `budget.chapters` (no `resolvedChapters`: les línies que es toquen són les desades).
 * @param {object} model       El que torna `llegeixIfc`.
 * @param {object} [opcionsImport]  Les mateixes de `muntaPressupost` (classes, usa…) per a les noves partides.
 */
export const planificaActualitzacio = (chapters, model, opcionsImport = {}) => {
    const prefix = opcionsImport.prefix || 'IFC';
    const existents = liniesIfc(chapters);
    const perGuid = new Map(model.elements.map(e => [e.guid, e]));
    const pla = { canvis: [], conflictes: [], afegides: [], noves: { chapters: [], prices: {} }, eliminades: [], avisos: [], iguals: 0 };

    // 1) El que ja hi és.
    for (const [guid, { node, linia }] of existents) {
        const e = perGuid.get(guid);
        const descripcio = linia.description || node.description;
        if (!e) { pla.eliminades.push({ guid, nodeId: node.id, liniaId: linia.id, descripcio, partida: node.code }); continue; }
        const unitat = unitatAmidable(node.unit);
        if (!unitat) { pla.avisos.push(`«${node.code}»: la unitat «${node.unit}» no es pot amidar des del model; no s'actualitza.`); continue; }
        const r = liniaPerElement(model, e, unitat, node.description, linia.ifc.origen === 'geometria' ? 'geometria' : 'qto');
        if (r.q.valor == null) { pla.avisos.push(`«${descripcio}»: l'element ja no té cap quantitat en ${unitat}.`); continue; }

        const desat = linia.ifc.valor;
        const actual = importDeLinia(linia);
        const nou = r.linia.ifc.valor;
        if (desat != null && igual(desat, nou)) { pla.iguals++; continue; }                 // el model no ha canviat
        if (desat == null && igual(actual, nou)) { pla.iguals++; continue; }
        const canvi = {
            guid, nodeId: node.id, liniaId: linia.id, partida: node.code, descripcio, unitat: node.unit,
            abans: actual, despres: nou, units: r.linia.units, length: r.linia.length, ifc: r.linia.ifc,
        };
        const editada = desat != null && !igual(actual, desat);
        if (editada || teFormula(linia)) pla.conflictes.push({ ...canvi, motiu: teFormula(linia) ? 'La línia té una fórmula.' : 'La línia s\'ha editat a mà.' });
        else pla.canvis.push(canvi);
    }

    // 2) El que és nou: a la partida on ja van els seus germans, o com a partida nova.
    const nou = muntaPressupost(model, opcionsImport);
    const maxs = maxSequencies(chapters, prefix);
    const capitolsExistents = (chapters || []).map(c => ({ code: c.code, description: c.description }));
    let maxCapitol = 0;
    capitolsExistents.forEach(c => { const m = new RegExp(`^${prefix}(\\d+)$`).exec(normalizeCode(c.code)); if (m) maxCapitol = Math.max(maxCapitol, Number(m[1])); });
    const codiCapitol = new Map();

    for (const cap of nou.chapters) {
        const itemsNous = [];
        for (const p of cap.items) {
            const coneguts = p.measurements.filter(l => existents.has(l.ifc.guid));
            const desconeguts = p.measurements.filter(l => !existents.has(l.ifc.guid));
            if (coneguts.length === 0) { itemsNous.push(p); continue; }
            // El node del projecte que té més germans seus.
            const vots = new Map();
            coneguts.forEach(l => { const n = existents.get(l.ifc.guid).node; vots.set(n, (vots.get(n) || 0) + 1); });
            const node = [...vots.entries()].sort((a, b) => b[1] - a[1])[0][0];
            const unitat = unitatAmidable(node.unit);
            for (const l of desconeguts) {
                const r = unitat ? liniaPerElement(model, perGuid.get(l.ifc.guid), unitat, node.description) : null;
                if (r?.linia) pla.afegides.push({ guid: l.ifc.guid, nodeId: node.id, partida: node.code, descripcio: r.linia.description, linia: r.linia });
                else pla.avisos.push(`«${l.description}»: no es pot afegir a «${node.code}».`);
            }
        }
        if (itemsNous.length === 0) continue;

        // Codis que no trepitgin els del projecte: el mateix capítol (per nom) o un de nou, i números nous.
        let code = capitolsExistents.find(c => c.description === cap.description)?.code;
        if (!code) {
            if (!codiCapitol.has(cap.description)) codiCapitol.set(cap.description, `${prefix}${String(++maxCapitol).padStart(2, '0')}`);
            code = codiCapitol.get(cap.description);
        }
        const items = itemsNous.map(p => {
            const m = new RegExp(`^${prefix.replace(/\./g, '\\.')}\\.([A-Z0-9]+)\\.\\d+$`).exec(p.code);
            if (!m) return p;
            const nouCodi = `${prefix}.${m[1]}.${String((maxs[m[1]] = (maxs[m[1]] || 0) + 1)).padStart(2, '0')}`;
            const preu = nou.prices[normalizeCode(p.code)];
            if (preu) pla.noves.prices[normalizeCode(nouCodi)] = { ...preu, code: nouCodi };
            return { ...p, code: nouCodi };
        });
        pla.noves.chapters.push({ ...cap, code, items });
    }
    // Els preus de les partides que no s'han reanomenat (vinculades al banc) no hi són: ja són al projecte.
    return pla;
};

/**
 * Aplica el pla sobre `chapters` (immutable). No hi insereix les noves partides: això és del flux
 * d'importació (`insereixNodes`), amb `pla.noves`.
 *
 * @param {{ treu?: boolean, sobreescriu?: boolean }} [opcions]
 *   `treu`: esborra les línies d'elements que ja no són al model. `sobreescriu`: també actualitza els conflictes.
 */
export const aplicaActualitzacio = (chapters, pla, { treu = false, sobreescriu = false } = {}) => {
    const actualitzacions = new Map();
    [...pla.canvis, ...(sobreescriu ? pla.conflictes : [])].forEach(c => actualitzacions.set(c.liniaId, c));
    const treure = new Set(treu ? pla.eliminades.map(e => e.liniaId) : []);
    const afegir = new Map();
    pla.afegides.forEach(a => afegir.set(a.nodeId, [...(afegir.get(a.nodeId) || []), a.linia]));

    const rec = (nodes) => nodes.map(n => {
        let node = n;
        if (n.measurements?.length || afegir.has(n.id)) {
            const linies = (n.measurements || [])
                .filter(l => !treure.has(l.id))
                .map(l => {
                    const c = actualitzacions.get(l.id);
                    return c ? { ...l, units: c.units, length: c.length, ifc: c.ifc } : l;
                });
            node = { ...n, measurements: [...linies, ...(afegir.get(n.id) || [])] };
        }
        if (node.subChapters?.length || node.items?.length) {
            node = { ...node, subChapters: rec(node.subChapters || []), items: rec(node.items || []) };
        }
        return node;
    });
    return rec(chapters);
};

/** Resum per a un missatge: quantes línies s'han tocat de cada tipus. */
export const resumActualitzacio = (pla, { treu = false, sobreescriu = false } = {}) => ({
    actualitzades: pla.canvis.length + (sobreescriu ? pla.conflictes.length : 0),
    afegides: pla.afegides.length,
    noves: pla.noves.chapters.reduce((s, c) => s + c.items.length, 0),
    eliminades: treu ? pla.eliminades.length : 0,
    iguals: pla.iguals,
});
