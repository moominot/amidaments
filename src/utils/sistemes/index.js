import { normalizeCode } from '../calculations';
import { PISCINA } from './piscina';

/**
 * Sistemes constructius: un conjunt de partides que s'amida sol a partir d'uns quants
 * paràmetres (les dimensions interiors d'una piscina, per exemple).
 *
 * Un sistema és una definició declarativa:
 *
 * - `parametres`: els camps del formulari, amb valor per defecte i límits;
 * - `capitols`: la llista de partides de cada subcapítol, i per a cada partida una funció
 *   `linies(p, g)` que torna les línies d'amidament a partir dels paràmetres `p` i de la
 *   geometria derivada `g`;
 * - `joc`: les partides (descripció, unitat, preu, descomposat) i els preus que s'hi fan
 *   servir, en el mateix format que un fragment del porta-retalls.
 *
 * El generador no sap res de piscines: torna un subarbre normal amb línies d'amidament
 * normals (Ud × Ll × Am × Al), que entra al projecte pel mateix camí que una partida
 * enganxada. Un cop dins, no queda cap rastre del sistema: es pot editar, exportar a BC3 i
 * certificar com qualsevol altra partida. El preu d'això és que canviar les dimensions vol
 * dir tornar a generar.
 */

export const SISTEMES = [PISCINA];

export const valorsPerDefecte = (sistema) =>
    Object.fromEntries(sistema.parametres.map(p => [p.id, p.defecte]));

/** Errors dels paràmetres: els límits declarats i després les regles pròpies del sistema. */
export const validaParametres = (sistema, valors) => {
    const errors = [];
    sistema.parametres.forEach(def => {
        const v = valors[def.id];
        if (typeof v !== 'number' || !Number.isFinite(v)) {
            errors.push(`${def.nom}: falta el valor`);
            return;
        }
        if (def.enter && !Number.isInteger(v)) errors.push(`${def.nom}: ha de ser un nombre enter`);
        if (def.min !== undefined && v < def.min) errors.push(`${def.nom}: com a mínim ${String(def.min).replace('.', ',')} ${def.unitat}`);
        if (def.max !== undefined && v > def.max) errors.push(`${def.nom}: com a màxim ${String(def.max).replace('.', ',')} ${def.unitat}`);
    });
    if (errors.length) return errors;
    return sistema.valida ? sistema.valida(valors) : [];
};

/** `base` si és lliure; si no, `base_2`, `base_3`... */
export const codiLliure = (base, ocupats) => {
    if (!ocupats.has(normalizeCode(base))) return base;
    let n = 2;
    while (ocupats.has(normalizeCode(`${base}_${n}`))) n++;
    return `${base}_${n}`;
};

/** Tots els codis d'un arbre, normalitzats. */
export const codisDelProjecte = (chapters = []) => {
    const codis = new Set();
    const recull = (nodes) => nodes.forEach(n => {
        if (n.code) codis.add(normalizeCode(n.code));
        recull([...(n.subChapters || []), ...(n.items || [])]);
    });
    recull(chapters);
    return codis;
};

// ─── Partides de cada paper ───
//
// Cada partida d'un sistema fa un paper (la llosa, el mur, la impermeabilització...). La que
// hi va per defecte surt del `joc` del sistema; l'usuari la pot canviar per una partida del
// projecte o del banc de preus, o deixar el paper buit. El que es tria es desa com una
// **instantània** autosuficient `{ partida, prices }`, en el mateix esperit que un fragment del
// porta-retalls: porta la descripció, la unitat, el descomposat i els preus que el fan valer,
// de manera que es pot fer servir en un altre projecte que no la tingui.

/** Els papers del sistema, en ordre, amb el subcapítol on van. */
export const papersDe = (sistema) =>
    sistema.capitols.flatMap(cap => cap.partides.map(def => ({ ...def, capitol: cap })));

/** Codis que fan valer una partida: el seu, els del descomposat i els dels residus. */
const codisDeLaPartida = (partida) => [
    partida.code,
    ...(partida.breakdown || []).map(b => b.code),
    ...(partida.waste || []).map(w => w.code),
].filter(Boolean).map(normalizeCode);

const preusDe = (codis, priceDatabase) => {
    const out = {};
    codis.forEach(c => { if (priceDatabase[c]) out[c] = priceDatabase[c]; });
    return out;
};

/** Instantània d'una partida a partir del node (projecte o joc del sistema). */
const instantania = (node, priceDatabase) => {
    const partida = {
        code: node.code,
        description: node.description || '',
        fullDescription: node.fullDescription || node.description || '',
        unit: node.unit,
        price: priceDatabase[normalizeCode(node.code)]?.price ?? node.price ?? 0,
        breakdown: (node.breakdown || []).map(b => ({ ...b })),
        ...(node.waste?.length ? { waste: node.waste.map(w => ({ ...w })) } : {}),
    };
    return { partida, prices: preusDe(codisDeLaPartida(partida), priceDatabase) };
};

/** La partida que el sistema hi posa per defecte. */
export const partidaPerDefecte = (sistema, def) => {
    const node = sistema.joc.partides.find(x => normalizeCode(x.code) === normalizeCode(def.codi));
    if (!node) throw new Error(`El sistema ${sistema.id} no porta la partida ${def.codi}`);
    return instantania(node, sistema.joc.prices);
};

/** Una partida del projecte, amb el seu descomposat i els preus del projecte. */
export const partidaDelProjecte = (node, priceDatabase = {}) => instantania(node, priceDatabase);

/**
 * Un concepte del banc de preus. El banc no porta descomposat (el parser BC3 no l'hi posa),
 * així que la partida val el preu del concepte. Torna `null` si el codi no hi és.
 */
export const partidaDelBanc = (codi, priceDatabase = {}) => {
    const dades = priceDatabase[normalizeCode(codi)];
    if (!dades) return null;
    return instantania({
        code: dades.code || codi,
        description: dades.summary || '',
        unit: dades.unit || '',
        price: dades.price,
    }, priceDatabase);
};

/**
 * Compara unitats sense fer cas de majúscules, del superíndex ni de les variants habituals:
 * «m²» = «m2», «ml» = «m», «ud» = «ut» = «u».
 */
export const normalitzaUnitat = (u) => {
    const net = String(u || '').trim().toLowerCase()
        .replace('²', '2').replace('³', '3').replace(/\.$/, '');
    if (['u', 'ud', 'ut', 'un', 'uts', 'uds', 'ud.', 'pa'].includes(net)) return 'u';
    if (net === 'ml') return 'm';
    return net;
};

export const mateixaUnitat = (a, b) => normalitzaUnitat(a) === normalitzaUnitat(b);

/**
 * Genera el capítol del sistema.
 *
 * `tria` diu quina partida fa cada paper: `tria[paper]` és una instantània `{ partida, prices }`,
 * `null` per deixar el paper sense partida, o absent per fer servir la del sistema.
 *
 * Retorna `{ errors }` si els paràmetres no són vàlids, o `{ errors: [], nodes, prices, papers }`:
 * - `nodes`: un sol capítol, amb un codi que no xoca amb cap de `codisOcupats`;
 * - `prices`: les entrades de `priceDatabase` dels codis que hi surten;
 * - `papers`: per a cada paper, la partida que hi va (o `null`), d'on surt (`plantilla`,
 *   `triada` o `cap`), les seves línies i si la unitat no és la del paper.
 *
 * - Les línies amb Ud 0 o menys no es generen, i una partida que es queda sense línies
 *   tampoc: posar 0 focus treu la partida dels focus.
 * - Les partides es generen **sense components fills** (`items`), només amb el descomposat.
 *   El descomposat és el que fa el preu, i els fills només servirien perquè la importació
 *   preguntés per cada material i cada hora de mà d'obra que el projecte ja tingués.
 * - **Si dos papers del mateix subcapítol fan servir la mateixa partida, surt una sola partida
 *   amb les línies de tots dos**, cadascuna amb el nom del paper al davant. Dues partides amb
 *   el mateix codi al mateix capítol no poden ser: la fusió de la importació es quedaria amb
 *   la primera i les línies de la segona es perdrien.
 */
export const generaSistema = (sistema, valors, { codisOcupats = new Set(), tria = {} } = {}) => {
    const p = { ...valorsPerDefecte(sistema), ...valors };
    const errors = validaParametres(sistema, p);
    if (errors.length) return { errors };

    const g = sistema.geometria ? sistema.geometria(p) : {};
    const arrel = codiLliure(sistema.codi, codisOcupats);
    let preus = {};
    const papers = [];

    const subChapters = sistema.capitols.map(cap => {
        const perCodi = new Map();   // codi normalitzat -> { node, papers }
        cap.partides.forEach(def => {
            const triada = tria[def.paper];
            const origen = triada === null ? 'cap' : (triada ? 'triada' : 'plantilla');
            const inst = origen === 'cap' ? null : (triada || partidaPerDefecte(sistema, def));
            const linies = def.linies(p, g).filter(l => l.units > 0);
            papers.push({
                paper: def.paper,
                nom: def.nom,
                unitat: def.unitat,
                capitol: cap.sufix,
                origen,
                partida: inst?.partida || null,
                linies,
                unitatDiferent: !!inst && !!def.unitat && !mateixaUnitat(inst.partida.unit, def.unitat),
            });
            if (!inst || linies.length === 0) return;

            preus = { ...preus, ...inst.prices };
            const codi = normalizeCode(inst.partida.code);
            let entrada = perCodi.get(codi);
            if (!entrada) {
                entrada = {
                    node: {
                        ...inst.partida,
                        id: crypto.randomUUID(),
                        breakdown: (inst.partida.breakdown || []).map(b => ({ ...b })),
                        measurements: [],
                        subChapters: [],
                        items: [],
                    },
                    papers: [],
                };
                perCodi.set(codi, entrada);
            }
            entrada.papers.push({ nom: def.nom, linies });
        });

        const items = [...perCodi.values()].map(({ node, papers: ps }) => ({
            ...node,
            measurements: ps.flatMap(({ nom, linies }) => linies.map(l => ({
                id: crypto.randomUUID(),
                ...l,
                description: ps.length > 1 ? `${nom} · ${l.description}` : l.description,
            }))),
        }));
        if (items.length === 0) return null;
        return {
            id: crypto.randomUUID(),
            code: `${arrel}.${cap.sufix}`,
            description: cap.description,
            subChapters: [],
            items,
        };
    }).filter(Boolean);

    const usats = new Set(subChapters.flatMap(c => c.items.flatMap(codisDeLaPartida)));
    const prices = {};
    Object.entries(preus).forEach(([k, v]) => {
        if (usats.has(normalizeCode(k))) prices[k] = v;
    });

    return {
        errors: [],
        nodes: [{
            id: crypto.randomUUID(),
            code: arrel,
            description: sistema.titol(p),
            subChapters,
            items: [],
        }],
        prices,
        papers,
    };
};
