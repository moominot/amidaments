/**
 * Línies d'amidament a partir d'entitats d'AutoCAD.
 *
 * El LISP `public/cad/amidaments.lsp` (ordre AMIDA) posa al porta-retalls un text tabulat amb
 * una fila per entitat. El LISP no sap a quina partida anirà, així que exporta les magnituds
 * en brut (llargada, àrea, si és tancada) i és aquí on es tria què se'n fa segons la unitat:
 *
 *   · m2 / m3, entitat tancada → l'àrea a Ll.
 *   · m2, entitat oberta        → la llargada a Ll i Al pendent.
 *   · m3                        → sempre queda Al (gruix) pendent; si és oberta, també Am.
 *   · m                         → la llargada, tancada o no (en una tancada, el perímetre).
 *   · ud                        → 1 per entitat, sigui el que sigui.
 *
 * Format (separat per tabuladors, una entitat per fila):
 *
 *   AMIDAMENTS-CAD  1  <dibuix>
 *   <tipus>  <tancada 0|1>  <llargada>  <àrea>  <capa>  <nom de bloc>  <handle>
 *
 * Les xifres ja arriben en metres: la conversió des de les unitats del dibuix la fa el LISP.
 */

export const CAD_HEADER = 'AMIDAMENTS-CAD';

const num = (s) => {
    const v = parseFloat(String(s ?? '').trim().replace(',', '.'));
    return Number.isFinite(v) ? v : 0;
};

/** Torna `null` si el text no és una exportació del LISP. */
export const parseCadClipboard = (text) => {
    if (!text) return null;
    const files = String(text).replace(/^\uFEFF/, '').split(/\r?\n/).filter(f => f.trim() !== '');
    if (files.length === 0 || !files[0].trim().startsWith(CAD_HEADER)) return null;

    const capcal = files[0].split('\t');
    const entitats = files.slice(1).map(f => {
        const c = f.split('\t');
        return {
            type: (c[0] || '').trim().toUpperCase(),
            closed: (c[1] || '').trim() === '1',
            length: num(c[2]),
            area: Math.abs(num(c[3])),
            layer: (c[4] || '').trim(),
            name: (c[5] || '').trim(),
            handle: (c[6] || '').trim(),
        };
    }).filter(e => e.type);

    return { version: (capcal[1] || '').trim(), drawing: (capcal[2] || '').trim(), entities: entitats };
};

/** Redueix la unitat de la partida a una de les que sabem amidar des del CAD. */
export const cadUnitKind = (unit) => {
    const u = String(unit || '').trim().toLowerCase().replace(/\.$/, '').replace('²', '2').replace('³', '3');
    if (['m2', 'm^2', 'm.2'].includes(u)) return 'm2';
    if (['m3', 'm^3', 'm.3'].includes(u)) return 'm3';
    if (['m', 'ml', 'm.l', 'mts'].includes(u)) return 'm';
    if (['u', 'ud', 'uds', 'un', 'ut', 'uts', 'unitat', 'unitats', 'pza', 'pa'].includes(u)) return 'ud';
    return null;
};

/** Text per a la columna Ref: el nom del bloc si n'és un, si no la capa. */
const descripcioDe = (e) => e.name || e.layer || e.type;

const linia = (e, camps) => ({
    id: crypto.randomUUID(),
    description: descripcioDe(e),
    units: 1,
    length: 0,
    width: 0,
    height: 0,
    ...camps,
});

/**
 * Converteix les entitats en línies d'amidament per a una partida amb aquesta unitat.
 *
 * Torna `{ lines, pendingHeight, pendingWidth, skipped, kind }`; `kind` és `null` si la unitat
 * no és cap de les que es poden amidar des del CAD, i llavors `lines` és buit.
 */
export const cadEntitiesToMeasurements = (entities, unit) => {
    const kind = cadUnitKind(unit);
    const resultat = { lines: [], pendingHeight: 0, pendingWidth: 0, skipped: [], kind };
    if (!kind) return resultat;

    entities.forEach(e => {
        const teArea = e.closed && e.area > 0;
        const teLlargada = e.length > 0;

        if (kind === 'ud') {
            resultat.lines.push(linia(e, {}));
        } else if (kind === 'm') {
            if (teLlargada) resultat.lines.push(linia(e, { length: e.length }));
            else resultat.skipped.push(e);
        } else if (teArea) {
            // Superfície tancada: per a m2 ja és l'amidament; per a m3 en falta el gruix.
            const pendent = kind === 'm3';
            resultat.lines.push(linia(e, { length: e.area, ...(pendent ? { needsHeight: true } : {}) }));
            if (pendent) resultat.pendingHeight++;
        } else if (teLlargada) {
            // Oberta: només en tenim la llargada, l'alçada l'ha de posar qui amida.
            const senseAmple = kind === 'm3';
            resultat.lines.push(linia(e, { length: e.length, needsHeight: true, ...(senseAmple ? { needsWidth: true } : {}) }));
            resultat.pendingHeight++;
            if (senseAmple) resultat.pendingWidth++;
        } else {
            resultat.skipped.push(e);
        }
    });

    return resultat;
};
