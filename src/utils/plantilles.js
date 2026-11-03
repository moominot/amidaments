import { avalua, referencies } from './formules';

/**
 * Textos amb variables: el títol i la descripció tècnica d'una partida o d'un capítol poden
 * portar expressions entre claus que es resolen amb els paràmetres del projecte (veure
 * `docs/sistemes.md`).
 *
 *     Biga de formigó armat de {B*100}x{H*100} cm, amb {si(acabat=1; "encofrat vist"; "encofrat per revestir")}
 *
 * - `{expressió}`: una fórmula com les de les línies d'amidament; el número surt amb coma
 *   decimal i sense zeros sobrers (0,4 i no 0,400).
 * - `{si(condició; "text"; "altre text")}`: tria un text. Cada branca pot ser un text entre
 *   cometes, un altre `si(...)` o una fórmula.
 * - Una expressió que no es pot resoldre (un paràmetre que no existeix) es deixa tal com està,
 *   amb les claus, perquè es vegi.
 *
 * El text amb les claus és el que es desa i s'edita (`budget.chapters`); el resolt, el que es
 * mostra, s'imprimeix i s'exporta (`resolvedChapters`), com les fórmules de les línies.
 */

const CLAUS = /\{([^{}]+)\}/g;

export const CAMPS_PLANTILLA = ['description', 'fullDescription'];

export const esPlantilla = (text) => typeof text === 'string' && /\{[^{}]+\}/.test(text);

/** Número amb coma decimal i com a molt tres decimals, sense zeros al final. */
export const formataValor = (v) => {
    if (!Number.isFinite(v)) return '';
    const r = Math.round(v * 1000) / 1000;
    return r.toLocaleString('ca-ES', { maximumFractionDigits: 3, useGrouping: false });
};

/** Parteix `a; b; c` pels `;` de primer nivell, sense comptar els de dins de parèntesis o cometes. */
const parteixArguments = (text) => {
    const parts = [];
    let nivell = 0;
    let cometes = false;
    let actual = '';
    for (const c of text) {
        if (c === '"') cometes = !cometes;
        else if (!cometes && c === '(') nivell++;
        else if (!cometes && c === ')') nivell--;
        if (c === ';' && nivell === 0 && !cometes) {
            parts.push(actual);
            actual = '';
        } else {
            actual += c;
        }
    }
    parts.push(actual);
    return parts.map(p => p.trim());
};

/** `si(a; b; c)` amb algun text entre cometes: torna els tres arguments; si no, `null`. */
const siDeText = (expr) => {
    const m = /^si\s*\(([\s\S]*)\)$/.exec(expr.trim());
    if (!m || !expr.includes('"')) return null;
    const args = parteixArguments(m[1]);
    return args.length === 3 ? args : null;
};

const esText = (expr) => /^"[^"]*"$/.test(expr.trim());

/** Avalua una expressió de dins de les claus. Torna `{ text }` o `{ error }`. */
const avaluaExpressio = (expr, valorDe) => {
    const e = expr.trim();
    if (esText(e)) return { text: e.slice(1, -1) };
    const si = siDeText(e);
    if (si) {
        const c = avalua(si[0], valorDe);
        if (c.error) return { error: c.error };
        return avaluaExpressio(c.valor ? si[1] : si[2], valorDe);
    }
    const r = avalua(e, valorDe);
    return r.error ? { error: r.error } : { text: formataValor(r.valor) };
};

/**
 * Omple les variables d'un text. Torna `{ text, errors }`: `errors` és una llista de
 * `{ expressio, error }` de les que no s'han pogut resoldre (es deixen amb les claus).
 */
export const omplePlantilla = (text, valorDe) => {
    const errors = [];
    if (!esPlantilla(text)) return { text, errors };
    const out = text.replace(CLAUS, (tot, expr) => {
        const r = avaluaExpressio(expr, valorDe);
        if (r.error) {
            errors.push({ expressio: expr.trim(), error: r.error });
            return tot;
        }
        return r.text;
    });
    return { text: out, errors };
};

/** Recorre les fórmules (no els textos entre cometes) de les expressions d'un text. */
const formulesDe = (expr, fn) => {
    const e = expr.trim();
    if (esText(e)) return;
    const si = siDeText(e);
    if (si) {
        fn(si[0]);
        formulesDe(si[1], fn);
        formulesDe(si[2], fn);
        return;
    }
    fn(e);
};

/** Noms de paràmetre que fa servir un text amb variables. */
export const referenciesPlantilla = (text) => {
    const noms = new Set();
    if (!esPlantilla(text)) return noms;
    for (const [, expr] of text.matchAll(CLAUS)) {
        formulesDe(expr, f => referencies(f).forEach(n => noms.add(n)));
    }
    return noms;
};

/**
 * Reescriu les fórmules de dins de les claus amb `fn(formula) → formula`, sense tocar els
 * textos entre cometes ni res de fora de les claus. Per reanomenar paràmetres.
 */
export const reescriuPlantilla = (text, fn) => {
    if (!esPlantilla(text)) return text;
    const reescriuExpr = (expr) => {
        const ini = expr.match(/^\s*/)[0];
        const fi = expr.match(/\s*$/)[0];
        const e = expr.trim();
        if (esText(e)) return expr;
        const si = siDeText(e);
        if (si) return `${ini}si(${fn(si[0])}; ${reescriuExpr(si[1])}; ${reescriuExpr(si[2])})${fi}`;
        return ini + fn(e) + fi;
    };
    return text.replace(CLAUS, (tot, expr) => `{${reescriuExpr(expr)}}`);
};
