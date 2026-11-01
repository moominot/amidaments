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

/**
 * Genera el capítol del sistema.
 *
 * Retorna `{ errors }` si els paràmetres no són vàlids, o `{ errors: [], nodes, prices }`:
 * `nodes` és un sol capítol (amb un codi que no xoca amb cap de `codisOcupats`) i `prices`
 * les entrades de `priceDatabase` dels codis que hi surten.
 *
 * - Les línies amb Ud 0 o menys no es generen, i una partida que es queda sense línies
 *   tampoc: posar 0 focus treu la partida dels focus.
 * - Les partides es generen **sense components fills** (`items`), només amb el descomposat.
 *   El descomposat és el que fa el preu, i els fills només servirien perquè la importació
 *   preguntés per cada material i cada hora de mà d'obra que el projecte ja tingués.
 */
export const generaSistema = (sistema, valors, { codisOcupats = new Set() } = {}) => {
    const p = { ...valorsPerDefecte(sistema), ...valors };
    const errors = validaParametres(sistema, p);
    if (errors.length) return { errors };

    const g = sistema.geometria ? sistema.geometria(p) : {};
    const perCodi = new Map(sistema.joc.partides.map(x => [normalizeCode(x.code), x]));
    const arrel = codiLliure(sistema.codi, codisOcupats);
    const usats = new Set();

    const subChapters = sistema.capitols.map(cap => {
        const items = cap.partides.map(def => {
            const base = perCodi.get(normalizeCode(def.codi));
            if (!base) throw new Error(`El sistema ${sistema.id} no porta la partida ${def.codi}`);
            const measurements = def.linies(p, g)
                .filter(l => l.units > 0)
                .map(l => ({ id: crypto.randomUUID(), ...l }));
            if (measurements.length === 0) return null;
            usats.add(normalizeCode(base.code));
            (base.breakdown || []).forEach(b => usats.add(normalizeCode(b.code)));
            return {
                id: crypto.randomUUID(),
                code: base.code,
                description: base.description,
                fullDescription: base.fullDescription || base.description,
                unit: base.unit,
                price: base.price,
                breakdown: (base.breakdown || []).map(b => ({ ...b })),
                measurements,
                subChapters: [],
                items: [],
            };
        }).filter(Boolean);
        if (items.length === 0) return null;
        return {
            id: crypto.randomUUID(),
            code: `${arrel}.${cap.sufix}`,
            description: cap.description,
            subChapters: [],
            items,
        };
    }).filter(Boolean);

    const prices = {};
    Object.entries(sistema.joc.prices).forEach(([k, v]) => {
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
    };
};
