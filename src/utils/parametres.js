import { avalua, ErrorFormula, esNomValid, reanomenaA, referencies } from './formules';

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

    const resolNode = (n) => ({
        ...n,
        ...(n.measurements ? { measurements: n.measurements.map(resolLinia) } : {}),
        subChapters: (n.subChapters || []).map(resolNode),
        items: (n.items || []).map(resolNode),
    });

    return { chapters: chapters.map(resolNode), liniesAmbError, parametres: resolts };
};

/** Quantes vegades surt cada paramètre: a línies i a fórmules d'altres paràmetres. */
export const usosDeParametres = (chapters = [], parametres = []) => {
    const usos = new Map();
    const compta = (text) => referencies(text).forEach(nom => usos.set(nom, (usos.get(nom) || 0) + 1));
    const recorre = (nodes) => nodes.forEach(n => {
        (n.measurements || []).forEach(m => {
            if (teFormules(m)) CAMPS_FORMULA.forEach(c => { if (m.formules[c]) compta(m.formules[c]); });
        });
        recorre([...(n.subChapters || []), ...(n.items || [])]);
    });
    recorre(chapters);
    parametres.forEach(p => { if (p.formula) compta(p.formula); });
    return usos;
};

/** Reescriu totes les fórmules (de línies i de paràmetres) amb `canvis`: Map nom vell → nom nou. */
export const reescriuFormules = ({ chapters = [], parametres = [] }, canvis) => {
    if (!canvis.size) return { chapters, parametres };
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
    const node = (n) => ({
        ...n,
        ...(n.measurements ? { measurements: n.measurements.map(linia) } : {}),
        subChapters: (n.subChapters || []).map(node),
        items: (n.items || []).map(node),
    });
    return {
        chapters: chapters.map(node),
        parametres: parametres.map(p => (p.formula ? { ...p, formula: fn(p.formula) } : p)),
    };
};

/** `base` si no és a `ocupats`; si no, `base_2`, `base_3`... */
export const nomLliure = (base, ocupats) => {
    if (!ocupats.has(base)) return base;
    let n = 2;
    while (ocupats.has(`${base}_${n}`)) n++;
    return `${base}_${n}`;
};
