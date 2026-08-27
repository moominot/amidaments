import { normalizeCode, round2, calcItemTotalQty } from './calculations';

/**
 * Residus de construcció i demolició.
 *
 * D'on surten les dades: un BC3 amb els registres `~R` i `~X` —els del Generador de Preus de
 * CYPE en porten— declara, per a cada partida, quins components generen residu, quant, amb
 * quin codi **LER** (Llista Europea de Residus, Ordre MAM/304/2002) i amb quina massa i volum.
 * El parser ho desa a `node.waste` amb les magnituds primitives:
 *
 *   { code, description, unit, type, ler, quantity, massPerUnit, volumePerUnit }
 *
 * on `quantity` és quant component surt **per unitat de partida** i `massPerUnit` i
 * `volumePerUnit` són la massa i el volum **per unitat de component**. La massa d'un
 * component al projecte és, doncs, `quantity × massPerUnit × amidament`. La suma per codi LER
 * és l'estimació que demana el RD 105/2008 per a l'estudi de gestió de residus.
 *
 * Els tipus surten de la norma FIEBDC (camp DECOMPOSITION_TYPE del `~R`) i no són decoratius:
 * el reial decret separa la terra d'excavació de la resta, i els envasos no van al mateix
 * gestor que la runa.
 */

export const TIPUS_RESIDU = {
    0: { nom: 'Col·locació', descripcio: 'Material que es llença en el procés d\'execució' },
    1: { nom: 'Demolició', descripcio: 'Runa procedent d\'enderrocs' },
    2: { nom: 'Excavació', descripcio: 'Terres i pedres de moviment de terres' },
    3: { nom: 'Embalatge', descripcio: 'Envasos i embolcalls dels materials' },
};

export const nomTipus = (type) => TIPUS_RESIDU[String(type)]?.nom || 'Sense classificar';

/** Un node té dades de residus? Els capítols no en tenen mai de propis. */
export const teResidus = (node) => Array.isArray(node?.waste) && node.waste.length > 0;

/** Massa (kg) i volum (m³) d'un component de residu per unitat de partida. */
export const magnitudsDe = (w) => ({
    mass: (w.quantity || 0) * (w.massPerUnit ?? 1),
    volume: (w.quantity || 0) * (w.volumePerUnit ?? 0),
});

/** Massa i volum de residu d'una partida, ja multiplicats pel seu amidament. */
export const calcItemWaste = (item) => {
    if (!teResidus(item)) return { mass: 0, volume: 0 };
    const quantitat = calcItemTotalQty(item);
    return item.waste.reduce((acc, w) => {
        const m = magnitudsDe(w);
        return { mass: acc.mass + m.mass * quantitat, volume: acc.volume + m.volume * quantitat };
    }, { mass: 0, volume: 0 });
};

/**
 * Agrega els residus de tot el projecte.
 *
 * @param {Array} chapters arbre **resolt** (`resolvedChapters`): els amidaments vinculats han
 *   d'estar resolts o les partides que en depenen comptarien zero.
 * @returns {{
 *   perLer: Array, perTipus: Array, partides: Array,
 *   totals: {mass: number, volume: number},
 *   ambDades: number, ambAportacio: number, senseAmidament: Array, sense: number
 * }}
 *   Es distingeix la partida que **no porta dades** de la que **en porta però té l'amidament
 *   a zero**: totes dues donen zero kg, però la primera és un fitxer sense residus i la segona
 *   és un amidament per omplir. Sense separar-les, la pestanya ensenyava «1 de 1 partides» amb
 *   la taula buida i no hi havia manera de saber quin dels dos casos era.
 */
export const buildWasteSummary = (chapters = []) => {
    const perLer = new Map();     // codi LER -> { ler, description, type, mass, volume, codis:Set }
    const perTipus = new Map();   // tipus -> { type, nom, mass, volume }
    const partides = [];
    const senseAmidament = [];
    let ambDades = 0;
    let sense = 0;

    const visita = (node, capitol) => {
        if (node.unit) {
            if (teResidus(node)) {
                ambDades++;
                const quantitat = calcItemTotalQty(node);
                const propi = { mass: 0, volume: 0 };

                node.waste.forEach(w => {
                    const unitari = magnitudsDe(w);
                    const massa = unitari.mass * quantitat;
                    const volum = unitari.volume * quantitat;
                    if (massa === 0 && volum === 0) return; // declarat però sense aportació

                    propi.mass += massa;
                    propi.volume += volum;

                    const clau = w.ler || `sense-ler:${normalizeCode(w.code)}`;
                    const fila = perLer.get(clau) || {
                        ler: w.ler || '', description: w.description || '', type: w.type,
                        mass: 0, volume: 0, codis: new Set(),
                    };
                    fila.mass += massa;
                    fila.volume += volum;
                    fila.codis.add(normalizeCode(w.code));
                    // Sense descripció encara, la de qualsevol component serveix.
                    if (!fila.description && w.description) fila.description = w.description;
                    perLer.set(clau, fila);

                    const t = perTipus.get(String(w.type)) || { type: w.type, nom: nomTipus(w.type), mass: 0, volume: 0 };
                    t.mass += massa;
                    t.volume += volum;
                    perTipus.set(String(w.type), t);
                });

                if (propi.mass > 0 || propi.volume > 0) {
                    partides.push({
                        id: node.id, code: node.code, description: node.description,
                        unit: node.unit, capitol, quantity: quantitat,
                        mass: round2(propi.mass), volume: round2(propi.volume),
                    });
                } else if (quantitat === 0) {
                    senseAmidament.push({ id: node.id, code: node.code, description: node.description, unit: node.unit });
                }
            } else {
                sense++;
            }
        }
        [...(node.subChapters || []), ...(node.items || [])]
            .forEach(fill => visita(fill, node.unit ? capitol : (node.description || capitol)));
    };

    chapters.forEach(node => visita(node, ''));

    const ordena = (a, b) => b.mass - a.mass;
    const files = [...perLer.values()]
        .map(f => ({ ...f, mass: round2(f.mass), volume: round2(f.volume), codis: [...f.codis] }))
        .sort(ordena);

    return {
        perLer: files,
        perTipus: [...perTipus.values()].map(t => ({ ...t, mass: round2(t.mass), volume: round2(t.volume) })).sort(ordena),
        partides: partides.sort(ordena),
        totals: {
            mass: round2(files.reduce((a, f) => a + f.mass, 0)),
            volume: round2(files.reduce((a, f) => a + f.volume, 0)),
        },
        ambDades,
        ambAportacio: partides.length,
        senseAmidament,
        sense,
    };
};

/**
 * Catàleg de components de residu que ja hi ha al projecte.
 *
 * No cal desar-lo: es dedueix de les partides importades. Un cop entra una partida del
 * Generador de Preus, el projecte ja té els seus disset components amb codi LER, massa i
 * volum, i una partida feta a mà els pot reaprofitar sense tornar-los a teclejar.
 */
export const catalegResidus = (chapters = []) => {
    const cataleg = new Map();
    const visita = (node) => {
        (node.waste || []).forEach(w => {
            const codi = normalizeCode(w.code);
            if (!codi || cataleg.has(codi)) return;
            cataleg.set(codi, {
                code: w.code,
                description: w.description || '',
                unit: w.unit || 'kg',
                type: w.type ?? '1',
                ler: w.ler || '',
                massPerUnit: w.massPerUnit ?? 1,
                volumePerUnit: w.volumePerUnit ?? 0,
            });
        });
        [...(node.subChapters || []), ...(node.items || [])].forEach(visita);
    };
    chapters.forEach(visita);
    return [...cataleg.values()].sort((a, b) => (a.ler || a.code).localeCompare(b.ler || b.code));
};

/** Massa en la unitat que toca: els kg es fan inllegibles a partir del miler. */
export const formatMassa = (kg) => {
    const n = Number(kg) || 0;
    if (Math.abs(n) >= 1000) return `${(n / 1000).toLocaleString('ca-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} t`;
    return `${n.toLocaleString('ca-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
};
