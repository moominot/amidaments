import { avalua, ErrorFormula, esNomValid, reanomenaA, referencies } from './formules';
import { CAMPS_PLANTILLA, esPlantilla, omplePlantilla, referenciesPlantilla, reescriuPlantilla } from './plantilles';

/**
 * Paràmetres del projecte i línies d'amidament amb fórmula.
 *
 * `budget.parametres` és una llista de `{ id, nom, valor, formula, unitat, descripcio, grup }`.
 * Un paràmetre té un valor fix o una fórmula d'altres paràmetres (`Pm = (P1+P2)/2`).
 *
 * Una línia d'amidament pot portar `formules: { units, length, width, height }`: el text de la
 * fórmula de cada camp que en tingui. **Quan un camp té fórmula, mana la fórmula**: el número
 * que hi hagi desat al mateix camp és el valor de quan es va escriure i pot haver quedat antic.
 * No es reescriu en desar perquè una línia amb un error de fórmula es resol a Ud 0, i desant-ho
 * es perdria el valor bo de les Ud el dia que es corregís l'error.
 *
 * Igual que els vincles (`measurementRefs.js`), les fórmules es resolen **abans** de calcular
 * res: `resolveFormules` torna l'arbre amb els camps ja calculats, i la resta del codi no se
 * n'ha d'assabentar. L'ordre és fórmules primer i vincles després, perquè un vincle pren la
 * quantitat d'una partida que pot tenir fórmules.
 */

export const CAMPS_FORMULA = ['units', 'length', 'width', 'height'];
const DIMENSIONS = ['length', 'width', 'height'];

export const teFormules = (linia) => !!linia?.formules && CAMPS_FORMULA.some(c => linia.formules[c]);

/**
 * Valors de tots els paràmetres.
 *
 * Torna `{ valors, errors, valorDe }`:
 * - `valors`: `Map` nom → número (només els que es poden calcular);
 * - `errors`: `Map` id → missatge (nom no vàlid o repetit, fórmula errònia, cicle...);
 * - `valorDe(nom)`: per avaluar fórmules. Torna `undefined` si el paràmetre no existeix i
 *   llança `ErrorFormula` si existeix però té un error, perquè l'error es propagui amb un
 *   missatge que digui d'on ve.
 */
export const resolParametres = (parametres = []) => {
    const perNom = new Map();
    const errors = new Map();
    parametres.forEach(p => {
        if (!esNomValid(p.nom)) errors.set(p.id, `Nom no vàlid: «${p.nom || ''}»`);
        else if (perNom.has(p.nom)) errors.set(p.id, `Nom repetit: ${p.nom}`);
        else perNom.set(p.nom, p);
    });

    const valors = new Map();
    const fallits = new Map();      // nom -> missatge
    const visitant = new Set();

    const valorDe = (nom) => {
        if (valors.has(nom)) return valors.get(nom);
        if (fallits.has(nom)) throw new ErrorFormula(`El paràmetre ${nom} té un error`);
        const p = perNom.get(nom);
        if (!p) return undefined;
        if (visitant.has(nom)) throw new ErrorFormula(`Referència circular a ${nom}`);

        let r;
        if (p.formula) {
            visitant.add(nom);
            r = avalua(p.formula, valorDe);
            visitant.delete(nom);
        } else {
            const v = Number(p.valor);
            r = Number.isFinite(v) ? { valor: v } : { error: 'Falta el valor' };
        }
        if (r.error) {
            fallits.set(nom, r.error);
            errors.set(p.id, r.error);
            throw new ErrorFormula(`El paràmetre ${nom} té un error`);
        }
        valors.set(nom, r.valor);
        return r.valor;
    };

    perNom.forEach((p, nom) => {
        try { valorDe(nom); } catch (e) {
            if (!(e instanceof ErrorFormula)) throw e;
            // Un cicle es detecta des del primer paràmetre que el tanca; la resta del cicle
            // queda sense valor i també s'ha de marcar.
            if (!errors.has(p.id)) errors.set(p.id, e.message);
        }
    });

    return { valors, errors, valorDe };
};

/**
 * Arbre amb les línies amb fórmula ja calculades.
 *
 * A cada línia amb fórmula hi afegeix `calc` (el valor de cada camp amb fórmula, tal com surt)
 * i, si n'hi ha cap d'errònia, `errorsFormula` (missatge per camp) i la deixa a Ud 0.
 *
 * **Una dimensió que dona 0 deixa la línia a 0.** A tota l'aplicació (i al BC3) una dimensió
 * buida o a zero val 1: és el que permet escriure `5` a Ud i deixar la resta en blanc. Una
 * fórmula que dona 0 diu, en canvi, que no hi ha res a amidar (un costat que no existeix, una
 * peça que no s'hi posa). Posar Ud a 0 fa que el parcial sigui 0 a la pantalla, al PDF, al BC3
 * i en reimportar-lo.
 *
 * Torna `{ chapters, liniesAmbError, parametres }` (`parametres`: el resultat de
 * `resolParametres`, per no haver-lo de calcular dues vegades).
 */
export const resolveFormules = (chapters = [], parametres = []) => {
    const resolts = resolParametres(parametres);
    let liniesAmbError = 0;

    let hiHa = false;
    const busca = (nodes) => nodes.some(n =>
        (n.measurements || []).some(teFormules)
        || CAMPS_PLANTILLA.some(c => esPlantilla(n[c]))
        || (n.breakdown || []).some(b => b.formulaRendiment)
        || busca([...(n.subChapters || []), ...(n.items || [])]));
    hiHa = busca(chapters);
    if (!hiHa) return { chapters, liniesAmbError, parametres: resolts };

    const resolLinia = (m) => {
        if (!teFormules(m)) return m;
        const calc = {};
        const errs = {};
        CAMPS_FORMULA.forEach(camp => {
            const f = m.formules[camp];
            if (!f) return;
            const r = avalua(f, resolts.valorDe);
            if (r.error) errs[camp] = r.error;
            else calc[camp] = r.valor;
        });
        const out = { ...m, ...calc, calc };
        if (Object.keys(errs).length) {
            out.errorsFormula = errs;
            out.units = 0;
            liniesAmbError++;
        } else if (DIMENSIONS.some(c => calc[c] === 0)) {
            out.units = 0;
        }
        return out;
    };

    // Títol i descripció amb variables (`utils/plantilles.js`): el resolt substitueix el camp i
    // el text amb les claus queda a `plantilles`, que és el que s'edita.
    const valorSegur = (nom) => {
        try { return resolts.valorDe(nom); } catch { return undefined; }
    };
    const resolTextos = (n) => {
        if (!CAMPS_PLANTILLA.some(c => esPlantilla(n[c]))) return {};
        const plantilles = {};
        const camps = {};
        const errors = [];
        CAMPS_PLANTILLA.forEach(c => {
            if (!esPlantilla(n[c])) return;
            plantilles[c] = n[c];
            const r = omplePlantilla(n[c], valorSegur);
            camps[c] = r.text;
            errors.push(...r.errors);
        });
        return { ...camps, plantilles, ...(errors.length ? { errorsPlantilla: errors } : {}) };
    };

    // Rendiments amb fórmula (`breakdown[].formulaRendiment`): com a les línies, mana la fórmula
    // i el número desat pot ser antic. Amb un error, rendiment 0 (el component no compta) i
    // l'error a `errorRendiment`. El preu de la partida es calcula del descomposat, així que
    // segueix els paràmetres.
    const resolComponent = (b) => {
        // eslint-disable-next-line no-unused-vars
        const { errorRendiment, ...net } = b;
        if (!b.formulaRendiment) return net;
        const r = avalua(b.formulaRendiment, resolts.valorDe);
        return r.error ? { ...net, yield: 0, errorRendiment: r.error } : { ...net, yield: r.valor };
    };

    const resolNode = (n) => {
        // eslint-disable-next-line no-unused-vars
        const { plantilles, errorsPlantilla, ...net } = n;
        return {
            ...net,
            ...resolTextos(net),
            ...(n.breakdown?.some(b => b.formulaRendiment || b.errorRendiment) ? { breakdown: n.breakdown.map(resolComponent) } : {}),
            ...(n.measurements ? { measurements: n.measurements.map(resolLinia) } : {}),
            subChapters: (n.subChapters || []).map(resolNode),
            items: (n.items || []).map(resolNode),
        };
    };

    return { chapters: chapters.map(resolNode), liniesAmbError, parametres: resolts };
};

/** Quantes vegades surt cada paràmetre: a línies, a fórmules d'altres paràmetres i a condicions. */
export const usosDeParametres = (chapters = [], parametres = [], condicions = []) => {
    const usos = new Map();
    const compta = (text) => referencies(text).forEach(nom => usos.set(nom, (usos.get(nom) || 0) + 1));
    const recorre = (nodes) => nodes.forEach(n => {
        (n.measurements || []).forEach(m => {
            if (teFormules(m)) CAMPS_FORMULA.forEach(c => { if (m.formules[c]) compta(m.formules[c]); });
        });
        CAMPS_PLANTILLA.forEach(c => referenciesPlantilla(n[c]).forEach(nom => usos.set(nom, (usos.get(nom) || 0) + 1)));
        (n.breakdown || []).forEach(b => { if (b.formulaRendiment) compta(b.formulaRendiment); });
        recorre([...(n.subChapters || []), ...(n.items || [])]);
    });
    recorre(chapters);
    parametres.forEach(p => { if (p.formula) compta(p.formula); });
    condicions.forEach(c => { if (c.expressio) compta(c.expressio); });
    return usos;
};

/**
 * Reescriu totes les fórmules (de línies, de paràmetres i de condicions) amb `canvis`:
 * `Map` nom vell → nom nou.
 */
export const reescriuFormules = ({ chapters = [], parametres = [], condicions = [] }, canvis) => {
    if (!canvis.size) return { chapters, parametres, condicions };
    const reescriu = (text) => {
        let t = text;
        canvis.forEach((nou, vell) => { t = reanomenaA(t, vell, nou); });
        return t;
    };
    // Dos canvis encadenats (A→B i B→C) es farien malbé l'un a l'altre: es passa primer per
    // noms provisionals que no poden xocar amb res.
    const provisionals = new Map();
    const finals = new Map();
    [...canvis.entries()].forEach(([vell, nou], i) => {
        provisionals.set(vell, `__p${i}__`);
        finals.set(`__p${i}__`, nou);
    });
    const dosPassos = (text) => {
        let t = text;
        provisionals.forEach((tmp, vell) => { t = reanomenaA(t, vell, tmp); });
        finals.forEach((nou, tmp) => { t = reanomenaA(t, tmp, nou); });
        return t;
    };
    const fn = canvis.size > 1 ? dosPassos : reescriu;

    const linia = (m) => {
        if (!teFormules(m)) return m;
        const formules = {};
        CAMPS_FORMULA.forEach(c => { if (m.formules[c]) formules[c] = fn(m.formules[c]); });
        return { ...m, formules };
    };
    const textos = (n) => {
        const out = {};
        CAMPS_PLANTILLA.forEach(c => { if (esPlantilla(n[c])) out[c] = reescriuPlantilla(n[c], fn); });
        return out;
    };
    const node = (n) => ({
        ...n,
        ...textos(n),
        ...(n.breakdown?.some(b => b.formulaRendiment)
            ? { breakdown: n.breakdown.map(b => (b.formulaRendiment ? { ...b, formulaRendiment: fn(b.formulaRendiment) } : b)) }
            : {}),
        ...(n.measurements ? { measurements: n.measurements.map(linia) } : {}),
        subChapters: (n.subChapters || []).map(node),
        items: (n.items || []).map(node),
    });
    return {
        chapters: chapters.map(node),
        parametres: parametres.map(p => (p.formula ? { ...p, formula: fn(p.formula) } : p)),
        condicions: condicions.map(c => (c.expressio ? { ...c, expressio: fn(c.expressio) } : c)),
    };
};

// ─── Condicions ───
//
// Dues menes, totes dues opcionals:
// - **De cada paràmetre**: `min`, `max` i `enter` (nombre enter). Les més habituals, i es
//   posen sense escriure cap fórmula.
// - **Entre paràmetres**: `budget.condicions`, una llista de `{ id, expressio, missatge }` on
//   `expressio` és una fórmula que ha de donar cert (diferent de 0): `P2>=P1`,
//   `i(nAmple>=0; nAmple<=2)`. El missatge és el que es mostra quan no es compleix.
//
// Al projecte, una condició que no es compleix és un avís: el càlcul continua. En inserir un
// sistema, en canvi, no es deixa inserir fins que es compleixen totes.

const esEnter = (v) => Math.abs(v - Math.round(v)) < 1e-9;
const num = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
const text = (v) => String(v).replace('.', ',');

/** Els límits d'un paràmetre en text curt: «≥ 0 · ≤ 2 · enter». Buit si no en té. */
export const resumLimits = (p) => [
    num(p.min) !== null && `≥ ${text(num(p.min))}`,
    num(p.max) !== null && `≤ ${text(num(p.max))}`,
    p.enter && 'enter',
].filter(Boolean).join(' · ');

/**
 * Comprova les condicions amb els valors ja resolts (`resolParametres`).
 *
 * Torna `{ perParametre, generals, incomplertes }`:
 * - `perParametre`: `Map` id → llista de missatges dels límits que no compleix;
 * - `generals`: cada condició entre paràmetres amb `ok` i, si no, `missatge` (o `error` si la
 *   fórmula no es pot avaluar, que també compta com a no complerta);
 * - `incomplertes`: quantes en total no es compleixen.
 *
 * Un paràmetre sense valor (per un error de fórmula) no es comprova: l'error ja surt a part.
 */
export const comprovaCondicions = (parametres = [], condicions = [], resolts = resolParametres(parametres)) => {
    const perParametre = new Map();
    parametres.forEach(p => {
        const v = resolts.valors.get(p.nom);
        if (v === undefined || resolts.errors.has(p.id)) return;
        const msgs = [];
        const min = num(p.min);
        const max = num(p.max);
        // Amb marge per al soroll de la coma flotant: 0,1 + 0,2 no és menys de 0,3.
        if (min !== null && v < min - 1e-9) msgs.push(`Ha de ser com a mínim ${text(min)}`);
        if (max !== null && v > max + 1e-9) msgs.push(`Ha de ser com a màxim ${text(max)}`);
        if (p.enter && !esEnter(v)) msgs.push('Ha de ser un nombre enter');
        if (msgs.length) perParametre.set(p.id, msgs);
    });

    const valorDe = (nom) => resolts.valorDe(nom);
    const generals = condicions.map(c => {
        const r = avalua(c.expressio, valorDe);
        if (r.error) return { ...c, ok: false, error: r.error };
        return r.valor !== 0
            ? { ...c, ok: true }
            : { ...c, ok: false, missatge: c.missatge || `No es compleix: ${c.expressio}` };
    });

    const incomplertes = [...perParametre.values()].reduce((a, m) => a + m.length, 0)
        + generals.filter(g => !g.ok).length;
    return { perParametre, generals, incomplertes };
};

/** `base` si no és a `ocupats`; si no, `base_2`, `base_3`... */
export const nomLliure = (base, ocupats) => {
    if (!ocupats.has(base)) return base;
    let n = 2;
    while (ocupats.has(`${base}_${n}`)) n++;
    return `${base}_${n}`;
};
