import { parseDecimal } from './decimal';

/**
 * Fórmules de les línies d'amidament i dels paràmetres.
 *
 * Una dimensió d'una línia (Ud, Ll, Am, Al) pot ser un número o una expressió amb paràmetres
 * del projecte: `L+2*e`, `(P1+P2)/2`, `max(A;1,5)`. No es fa servir `eval` ni `Function`: el
 * text ve de fitxers que poden arribar de fora i s'interpreta amb un analitzador propi que
 * només entén números, paràmetres, operadors i una llista tancada de funcions.
 *
 * ─── Sintaxi ───
 *
 * - Números amb coma o punt decimal: `2,5` i `2.5` són el mateix. Per això els arguments de
 *   les funcions se separen amb **punt i coma**, com al full de càlcul en català:
 *   `max(2,5;A)`.
 * - Operadors `+ - * / ^` (i `×`, `÷`), parèntesis i signe menys.
 * - Paràmetres: comencen per lletra o `_` i poden dur lletres, xifres i `_` (`L`, `P1`,
 *   `alçada_planta`). Distingeixen majúscules.
 * - Funcions: `min`, `max`, `abs`, `arrel` (`sqrt`), `sostre` (`ceil`), `terra` (`floor`),
 *   `arrod(x; decimals)` (`round`). La constant `pi`, si no hi ha cap paràmetre amb aquest nom.
 * - Comparacions `= <> < > <= >=` (i `≠ ≤ ≥ !=`), que donen 1 o 0, i les funcions `si(c; a; b)`
 *   (`if`), `i(...)` (`and`), `o(...)` (`or`) i `no(x)` (`not`). Serveixen per a les condicions
 *   dels paràmetres (`P2>=P1`) i per a fórmules com `si(P1=P2; 2; 1)`.
 * - Un `=` al davant s'ignora: qui ve del full de càlcul l'escriu per costum.
 */

export class ErrorFormula extends Error {}

const LLETRA = /[A-Za-z_À-ÖØ-öø-ÿ]/;
// El punt volat hi és perquè «paral·lel» és un nom: com a multiplicació, «·» el partiria.
const ALFANUM = /[A-Za-z0-9_·À-ÖØ-öø-ÿ]/;

const FUNCIONS = {
    min: { min: 1, fn: (...a) => Math.min(...a) },
    max: { min: 1, fn: (...a) => Math.max(...a) },
    abs: { min: 1, max: 1, fn: Math.abs },
    arrel: { min: 1, max: 1, fn: Math.sqrt },
    sostre: { min: 1, max: 1, fn: Math.ceil },
    terra: { min: 1, max: 1, fn: Math.floor },
    arrod: {
        min: 1, max: 2,
        fn: (x, d = 0) => { const f = 10 ** Math.round(d); return Math.round((x + Number.EPSILON) * f) / f; },
    },
    // Lògiques: 0 és fals i qualsevol altre valor, cert. `si` s'avalua a part (veure
    // `avaluaArbre`): només calcula la branca que toca, perquè l'altra pot dividir per zero.
    si: { min: 3, max: 3 },
    i: { min: 1, fn: (...a) => (a.every(x => x !== 0) ? 1 : 0) },
    o: { min: 1, fn: (...a) => (a.some(x => x !== 0) ? 1 : 0) },
    no: { min: 1, max: 1, fn: (x) => (x === 0 ? 1 : 0) },
};
const ALIES = { sqrt: 'arrel', ceil: 'sostre', floor: 'terra', round: 'arrod', if: 'si', and: 'i', or: 'o', not: 'no' };

// Comparacions: tornen 1 o 0. La igualtat té marge per al soroll de la coma flotant
// (0,1 + 0,2 = 0,3).
const IGUALS = (a, b) => Math.abs(a - b) < 1e-9;
const COMPARACIONS = {
    '=': (a, b) => IGUALS(a, b),
    '<>': (a, b) => !IGUALS(a, b),
    '<': (a, b) => a < b && !IGUALS(a, b),
    '>': (a, b) => a > b && !IGUALS(a, b),
    '<=': (a, b) => a < b || IGUALS(a, b),
    '>=': (a, b) => a > b || IGUALS(a, b),
};
const nomFuncio = (nom) => {
    const n = nom.toLowerCase();
    return FUNCIONS[n] ? n : ALIES[n] || null;
};

/** Fitxes amb la seva posició al text, per poder reanomenar sense tocar la resta. */
const tokenitza = (text) => {
    const fitxes = [];
    let i = 0;
    while (i < text.length) {
        const c = text[i];
        if (/\s/.test(c)) { i++; continue; }
        if (/[0-9]/.test(c) || ((c === ',' || c === '.') && /[0-9]/.test(text[i + 1] || ''))) {
            const m = /^(\d+([.,]\d*)?|[.,]\d+)/.exec(text.slice(i));
            fitxes.push({ t: 'num', v: Number(m[0].replace(',', '.')), ini: i, fi: i + m[0].length });
            i += m[0].length;
            continue;
        }
        if (LLETRA.test(c)) {
            let j = i + 1;
            while (j < text.length && ALFANUM.test(text[j])) j++;
            fitxes.push({ t: 'id', v: text.slice(i, j), ini: i, fi: j });
            i = j;
            continue;
        }
        const dos = text.slice(i, i + 2);
        if (['>=', '<=', '<>', '!='].includes(dos)) {
            fitxes.push({ t: 'op', v: dos === '!=' ? '<>' : dos, ini: i, fi: i + 2 });
            i += 2;
            continue;
        }
        const op = { '×': '*', '÷': '/', '≥': '>=', '≤': '<=', '≠': '<>' }[c] || c;
        if ('+-*/^();<>='.includes(op) || ['>=', '<=', '<>'].includes(op)) {
            fitxes.push({ t: 'op', v: op, ini: i, fi: i + 1 });
            i++;
            continue;
        }
        throw new ErrorFormula(`Caràcter no vàlid: «${c}»`);
    }
    return fitxes;
};

const analitza = (fitxes) => {
    let k = 0;
    const mira = () => fitxes[k];
    const esOp = (v) => mira()?.t === 'op' && mira().v === v;
    const espera = (v) => {
        if (!esOp(v)) throw new ErrorFormula(mira() ? `S'esperava «${v}»` : `Falta «${v}» al final`);
        k++;
    };

    // Una comparació per nivell (`a < b < c` no vol dir el que sembla): per encadenar-ne, `i(...)`.
    const comparacio = () => {
        const a = expressio();
        const f = mira();
        if (f?.t === 'op' && COMPARACIONS[f.v]) {
            k++;
            return { t: 'c', op: f.v, a, b: expressio() };
        }
        return a;
    };
    const expressio = () => {
        let a = terme();
        while (esOp('+') || esOp('-')) { const op = fitxes[k++].v; a = { t: 'b', op, a, b: terme() }; }
        return a;
    };
    const terme = () => {
        let a = factor();
        while (esOp('*') || esOp('/')) { const op = fitxes[k++].v; a = { t: 'b', op, a, b: factor() }; }
        return a;
    };
    // El signe va per sota de la potència, com a l'escriptura matemàtica: -2^2 = -4.
    const factor = () => {
        if (esOp('-')) { k++; return { t: 'u', a: factor() }; }
        if (esOp('+')) { k++; return factor(); }
        return potencia();
    };
    const potencia = () => {
        const a = primari();
        if (esOp('^')) { k++; return { t: 'b', op: '^', a, b: factor() }; }
        return a;
    };
    const primari = () => {
        const f = mira();
        if (!f) throw new ErrorFormula('La fórmula s\'acaba massa aviat');
        if (f.t === 'num') { k++; return { t: 'n', v: f.v }; }
        if (f.t === 'id') {
            k++;
            if (esOp('(')) {
                const nom = nomFuncio(f.v);
                if (!nom) throw new ErrorFormula(`Funció desconeguda: ${f.v}`);
                k++;
                const args = [];
                if (!esOp(')')) {
                    args.push(comparacio());
                    while (esOp(';')) { k++; args.push(comparacio()); }
                }
                espera(')');
                const def = FUNCIONS[nom];
                if (args.length < def.min || (def.max && args.length > def.max)) {
                    throw new ErrorFormula(`${nom}: nombre d'arguments incorrecte (separa'ls amb «;»)`);
                }
                return { t: 'f', nom, args };
            }
            return { t: 'p', nom: f.v };
        }
        if (esOp('(')) { k++; const e = comparacio(); espera(')'); return e; }
        throw new ErrorFormula(`No s'esperava «${f.v}»`);
    };

    const arbre = comparacio();
    if (k < fitxes.length) throw new ErrorFormula(`No s'esperava «${fitxes[k].v}»`);
    return arbre;
};

const neteja = (text) => String(text ?? '').trim().replace(/^=/, '').trim();

const cau = new Map();

/**
 * Compila una fórmula. Torna `{ arbre, refs }` (refs: noms de paràmetre que hi surten) o
 * `{ error }`. El resultat es memoritza: el mateix text surt a moltes línies.
 */
export const compila = (text) => {
    const net = neteja(text);
    if (cau.has(net)) return cau.get(net);
    let res;
    try {
        if (!net) throw new ErrorFormula('Fórmula buida');
        const arbre = analitza(tokenitza(net));
        const refs = new Set();
        const recull = (n) => {
            if (n.t === 'p') refs.add(n.nom);
            if (n.a) recull(n.a);
            if (n.b) recull(n.b);
            (n.args || []).forEach(recull);
        };
        recull(arbre);
        res = { arbre, refs };
    } catch (e) {
        if (!(e instanceof ErrorFormula)) throw e;
        res = { error: e.message };
    }
    if (cau.size > 5000) cau.clear();
    cau.set(net, res);
    return res;
};

const avaluaArbre = (n, valorDe) => {
    switch (n.t) {
        case 'n': return n.v;
        case 'p': {
            const v = valorDe(n.nom);
            if (v === undefined) {
                if (n.nom.toLowerCase() === 'pi') return Math.PI;
                throw new ErrorFormula(`Paràmetre desconegut: ${n.nom}`);
            }
            return v;
        }
        case 'u': return -avaluaArbre(n.a, valorDe);
        case 'c': return COMPARACIONS[n.op](avaluaArbre(n.a, valorDe), avaluaArbre(n.b, valorDe)) ? 1 : 0;
        case 'f':
            if (n.nom === 'si') return avaluaArbre(n.args[avaluaArbre(n.args[0], valorDe) !== 0 ? 1 : 2], valorDe);
            return FUNCIONS[n.nom].fn(...n.args.map(a => avaluaArbre(a, valorDe)));
        case 'b': {
            const a = avaluaArbre(n.a, valorDe);
            const b = avaluaArbre(n.b, valorDe);
            if (n.op === '+') return a + b;
            if (n.op === '-') return a - b;
            if (n.op === '*') return a * b;
            if (n.op === '/') {
                if (b === 0) throw new ErrorFormula('Divisió per zero');
                return a / b;
            }
            return a ** b;
        }
        default: throw new ErrorFormula('Fórmula malmesa');
    }
};

/**
 * Avalua una fórmula. `valorDe(nom)` torna el valor del paràmetre o `undefined` si no existeix.
 * Torna `{ valor }` o `{ error }`, mai no llança.
 */
export const avalua = (text, valorDe = () => undefined) => {
    const c = compila(text);
    if (c.error) return { error: c.error };
    try {
        const valor = avaluaArbre(c.arbre, valorDe);
        if (!Number.isFinite(valor)) return { error: 'El resultat no és un número' };
        // Fora el soroll de la coma flotant (1,78 + 0,5 = 2,2800000000000002), que si no
        // acabaria a la pantalla i al BC3.
        return { valor: Math.round(valor * 1e9) / 1e9 };
    } catch (e) {
        if (!(e instanceof ErrorFormula)) throw e;
        return { error: e.message };
    }
};

/**
 * Text escrit en un camp: un número (amb coma o punt) o una fórmula.
 * Torna `{ valor }` si és un número i `{ formula }` si no ho és (encara que no sigui vàlida:
 * l'error es mostra a la línia, no es perd el que s'ha escrit).
 */
export const interpretaCamp = (text) => {
    const net = String(text ?? '').trim();
    if (net === '') return { valor: 0 };
    if (!net.startsWith('=')) {
        const n = parseDecimal(net);
        if (n !== null) return { valor: n };
    }
    return { formula: neteja(net) };
};

/** Noms de paràmetre que fa servir una fórmula (buit si no compila). */
export const referencies = (text) => compila(text).refs || new Set();

/**
 * Canvia el nom d'un paràmetre dins d'una fórmula sense tocar res més: ni els espais, ni les
 * funcions que es diguin igual, ni els noms que el contenen (`L` no toca `L2`).
 */
export const reanomenaA = (text, vell, nou) => {
    if (!text) return text;
    let fitxes;
    try { fitxes = tokenitza(String(text)); } catch { return text; }
    let out = '';
    let pos = 0;
    fitxes.forEach((f, i) => {
        const esFuncio = fitxes[i + 1]?.t === 'op' && fitxes[i + 1].v === '(';
        if (f.t === 'id' && f.v === vell && !esFuncio) {
            out += String(text).slice(pos, f.ini) + nou;
            pos = f.fi;
        }
    });
    return out + String(text).slice(pos);
};

// Noms que no poden ser paràmetre perquè es confondrien amb una funció de càlcul. Els de les
// lògiques (`i`, `o`, `si`, `no`) sí que poden: són noms curts que algú pot voler fer servir, i el
// parèntesi ja diu quan és la funció.
const RESERVATS = new Set(['min', 'max', 'abs', 'arrel', 'sostre', 'terra', 'arrod', 'sqrt', 'ceil', 'floor', 'round']);

/** Un nom de paràmetre vàlid: comença per lletra o `_`, sense espais ni signes. */
export const esNomValid = (nom) =>
    typeof nom === 'string' && LLETRA.test(nom[0] || '') && [...nom].every(c => ALFANUM.test(c))
    && !RESERVATS.has(nom.toLowerCase());
