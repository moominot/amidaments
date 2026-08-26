import { normalizeCode, round2 } from './calculations';

/**
 * Línies d'amidament vinculades a una altra partida.
 *
 * Cas típic: en una terrassa, la solera, la formació de pendents, la impermeabilització,
 * l'aïllant i el paviment tenen tots la mateixa superfície. Amb una línia vinculada s'entra
 * l'amidament un sol cop, a una partida, i les altres hi apunten: si la terrassa canvia, es
 * mouen totes alhora.
 *
 * Una línia vinculada porta `refCode` (el codi de la partida d'origen) i `factor`, en comptes
 * d'unitats i dimensions. El factor cobreix els casos de proporció: dues capes
 * d'impermeabilització són factor 2, mitja superfície és 0,5.
 *
 * ─── Com s'integra amb la resta del càlcul ───
 *
 * En comptes de fer que totes les funcions de `calculations.js` sàpiguen resoldre vincles
 * —serien una dotzena de signatures noves amb un paràmetre que es pot oblidar, que és
 * justament el parany que ja ha causat defectes en aquest projecte— es resol **abans**:
 * `resolveMeasurementRefs` retorna l'arbre amb les línies vinculades ja convertides en línies
 * normals amb la quantitat calculada. A partir d'aquí tot el codi existent funciona igual.
 *
 * L'arbre original (amb els vincles) segueix essent el que s'edita i el que es desa; el
 * resolt és el que es mostra i es calcula.
 */

export const isRefLine = (linia) => !!(linia && linia.refCode);

/** Etiqueta llegible d'una línia vinculada, per a la interfície i els llistats. */
export const refLabel = (linia) => {
    if (!isRefLine(linia)) return '';
    const f = Number(linia.factor);
    const factor = Number.isFinite(f) && f !== 1 ? ` × ${String(f).replace('.', ',')}` : '';
    return `= ${linia.refCode}${factor}`;
};

const parcialDe = (m) => round2((m.units || 0) * (m.length || 1) * (m.width || 1) * (m.height || 1));

/** Quantitat d'una partida a partir de les seves línies, amb els vincles ja resolts. */
const quantitatDeLinies = (linies) => {
    let subtotal = 0;
    linies.forEach(m => { if (!m.isIncrement) subtotal += parcialDe(m); });
    const increments = linies
        .filter(m => m.isIncrement)
        .reduce((acc, m) => acc + (subtotal * ((parseFloat(m.units) || 0) / 100)), 0);
    return round2(subtotal + increments);
};

/**
 * Resol les línies vinculades de tot l'arbre.
 *
 * @returns {{chapters: Array, cycles: Set<string>, missing: Set<string>, refsPerCode: Map<string, number>}}
 *   · `chapters`  arbre amb les línies vinculades convertides en línies normals
 *   · `cycles`    codis implicats en una referència circular (es compten com a 0)
 *   · `missing`   codis referenciats que no existeixen
 *   · `refsPerCode` quantes línies apunten a cada codi, per poder avisar en esborrar
 */
export const resolveMeasurementRefs = (chapters = []) => {
    const perCodi = new Map();      // normCode -> node original
    const cycles = new Set();
    const missing = new Set();
    const refsPerCode = new Map();

    const indexa = (nodes) => nodes.forEach(n => {
        if (n.unit) {
            const codi = normalizeCode(n.code);
            if (codi && !perCodi.has(codi)) perCodi.set(codi, n);
        }
        indexa([...(n.subChapters || []), ...(n.items || [])]);
    });
    indexa(chapters);

    // Quantes línies apunten a cada codi (per avisar abans d'esborrar la partida d'origen).
    const comptaRefs = (nodes) => nodes.forEach(n => {
        (n.measurements || []).forEach(m => {
            if (!isRefLine(m)) return;
            const codi = normalizeCode(m.refCode);
            refsPerCode.set(codi, (refsPerCode.get(codi) || 0) + 1);
        });
        comptaRefs([...(n.subChapters || []), ...(n.items || [])]);
    });
    comptaRefs(chapters);

    const memo = new Map();
    const visitant = new Set();

    const quantitatDe = (normCode) => {
        if (memo.has(normCode)) return memo.get(normCode);

        if (visitant.has(normCode)) {
            // Referència circular: es talla aquí i es compta com a 0 en comptes de penjar-se.
            cycles.add(normCode);
            return 0;
        }

        const node = perCodi.get(normCode);
        if (!node) { missing.add(normCode); return 0; }

        visitant.add(normCode);
        const valor = quantitatDeLinies(liniesResoltes(node));
        visitant.delete(normCode);

        memo.set(normCode, valor);
        return valor;
    };

    const liniesResoltes = (node) => (node.measurements || []).map(m => {
        if (!isRefLine(m)) return m;
        const codi = normalizeCode(m.refCode);
        const factor = Number.isFinite(Number(m.factor)) ? Number(m.factor) : 1;
        return {
            ...m,
            units: round2(quantitatDe(codi) * factor),
            length: 1, width: 1, height: 1,
        };
    });

    const teVincles = (node) => (node.measurements || []).some(isRefLine);

    // Estructura compartida: si una branca no conté cap vincle es retorna tal qual, de manera
    // que l'arbre resolt gairebé no ocupa memòria i les comparacions per identitat dels
    // useMemo que en depenen segueixen essent útils.
    const resol = (nodes) => {
        if (!nodes || nodes.length === 0) return nodes;
        let canviat = false;
        const seguents = nodes.map(n => {
            const subChapters = resol(n.subChapters || []);
            const items = resol(n.items || []);
            const propis = teVincles(n);
            if (!propis && subChapters === n.subChapters && items === n.items) return n;

            canviat = true;
            const seguent = { ...n, subChapters, items };
            if (propis) seguent.measurements = liniesResoltes(n);
            return seguent;
        });
        return canviat ? seguents : nodes;
    };

    const resolts = resol(chapters);

    return { chapters: resolts, cycles, missing, refsPerCode };
};
