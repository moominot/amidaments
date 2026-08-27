import { normalizeCode, round2, calcItemTotalQty, getComponentCategory } from './calculations';

/**
 * Petjada de carboni i cost energètic del projecte.
 *
 * ─── D'on surten les dades ───
 *
 * Del mateix registre `~X` que els residus, però de dues propietats diferents: `ce` (cost
 * energètic, MJ) i `eCO2` (emissió de CO₂, kg), **per unitat del concepte**. Són propietats del
 * concepte, com el preu, i per això el parser les desa a `priceDatabase` i no al node: un mateix
 * material surt a moltes partides i el valor no hi canvia.
 *
 * Els porten els **materials** d'una partida de construcció. Una partida de demolició no en té:
 * el que genera són residus, no energia incorporada. Per això el fitxer de `DCE010` declara les
 * dues propietats a la capçalera i no les omple enlloc, mentre que el d'`EHS010` sí.
 *
 * ─── El càlcul ───
 *
 *   energia de la partida = amidament × Σ (rendiment de cada component × ce del component)
 *   CO₂ de la partida     = amidament × Σ (rendiment de cada component × eCO2 del component)
 *
 * És l'energia **incorporada als materials**, no la de l'obra: no hi ha ni transport, ni
 * maquinària, ni la fase d'ús de l'edifici. El document ho ha de dir.
 */

/** Un component amb dades de petjada. */
const petjadaDe = (linia, priceDatabase) => {
    const codi = normalizeCode(linia.code);
    const concepte = priceDatabase[codi];
    if (!concepte) return null;
    const ce = Number(concepte.energy);
    const co2 = Number(concepte.co2);
    if (!Number.isFinite(ce) && !Number.isFinite(co2)) return null;
    return {
        energy: Number.isFinite(ce) ? ce : 0,
        co2: Number.isFinite(co2) ? co2 : 0,
        description: concepte.summary || linia.description || '',
        unit: concepte.unit || linia.unit || '',
    };
};

/** Energia (MJ) i emissions (kg CO₂) d'una partida, ja multiplicades pel seu amidament. */
export const calcItemCarbon = (item, priceDatabase = {}) => {
    const quantitat = calcItemTotalQty(item);
    let energy = 0;
    let co2 = 0;
    (item.breakdown || []).forEach(linia => {
        // Les línies de percentatge són costos indirectes, no material: no incorporen res.
        if (getComponentCategory(linia.code) === 'percent') return;
        const p = petjadaDe(linia, priceDatabase);
        if (!p) return;
        const rendiment = Number(linia.yield) || 0;
        energy += rendiment * p.energy * quantitat;
        co2 += rendiment * p.co2 * quantitat;
    });
    return { energy, co2 };
};

/**
 * Agrega la petjada de tot el projecte.
 *
 * @param {Array} chapters arbre **resolt** (`resolvedChapters`)
 * @param {object} priceDatabase base de preus, que és on viuen `energy` i `co2`
 * @returns {{
 *   perMaterial: Array, partides: Array, capitols: Array,
 *   totals: {energy: number, co2: number},
 *   ambDades: number, ambAportacio: number, senseAmidament: Array, sense: number
 * }}
 */
export const buildCarbonSummary = (chapters = [], priceDatabase = {}) => {
    const perMaterial = new Map();
    const partides = [];
    const capitols = [];
    const senseAmidament = [];
    let ambDades = 0;
    let sense = 0;

    const visita = (node, capitol) => {
        if (node.unit) {
            const linies = (node.breakdown || []).filter(l => getComponentCategory(l.code) !== 'percent');
            const ambPetjada = linies.filter(l => petjadaDe(l, priceDatabase));

            if (ambPetjada.length === 0) { sense++; return; }
            ambDades++;

            const quantitat = calcItemTotalQty(node);
            let energy = 0;
            let co2 = 0;

            ambPetjada.forEach(linia => {
                const p = petjadaDe(linia, priceDatabase);
                const rendiment = Number(linia.yield) || 0;
                const e = rendiment * p.energy * quantitat;
                const c = rendiment * p.co2 * quantitat;
                energy += e;
                co2 += c;
                if (e === 0 && c === 0) return;

                const codi = normalizeCode(linia.code);
                const fila = perMaterial.get(codi) || {
                    code: linia.code, description: p.description, unit: p.unit, energy: 0, co2: 0, partides: 0,
                };
                fila.energy += e;
                fila.co2 += c;
                fila.partides++;
                perMaterial.set(codi, fila);
            });

            if (energy > 0 || co2 > 0) {
                partides.push({
                    id: node.id, code: node.code, description: node.description,
                    unit: node.unit, capitol, quantity: quantitat,
                    energy: round2(energy), co2: round2(co2),
                });
            } else if (quantitat === 0) {
                senseAmidament.push({ id: node.id, code: node.code, description: node.description });
            }
            return;
        }
        [...(node.subChapters || []), ...(node.items || [])]
            .forEach(fill => visita(fill, node.description || capitol));
    };

    chapters.forEach(node => {
        const abans = { energy: 0, co2: 0 };
        const inici = partides.length;
        visita(node, '');
        // El total del capítol surt de les partides que hi han entrat en aquesta passada.
        const seves = partides.slice(inici);
        if (seves.length > 0) {
            capitols.push({
                id: node.id, code: node.code, description: node.description,
                energy: round2(seves.reduce((a, p) => a + p.energy, abans.energy)),
                co2: round2(seves.reduce((a, p) => a + p.co2, abans.co2)),
            });
        }
    });

    const ordena = (a, b) => b.co2 - a.co2;
    const materials = [...perMaterial.values()]
        .map(m => ({ ...m, energy: round2(m.energy), co2: round2(m.co2) }))
        .sort(ordena);

    return {
        perMaterial: materials,
        partides: partides.sort(ordena),
        capitols: capitols.sort(ordena),
        totals: {
            energy: round2(partides.reduce((a, p) => a + p.energy, 0)),
            co2: round2(partides.reduce((a, p) => a + p.co2, 0)),
        },
        ambDades,
        ambAportacio: partides.length,
        senseAmidament,
        sense,
    };
};

/** MJ es fan inllegibles a partir del miler; a sobre de 1.000 es passa a GJ. */
export const formatEnergia = (mj) => {
    const n = Number(mj) || 0;
    if (Math.abs(n) >= 1000) return `${(n / 1000).toLocaleString('ca-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GJ`;
    return `${n.toLocaleString('ca-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MJ`;
};

/** Les emissions, en kg fins al miler i en tones a partir d'allà. */
export const formatCO2 = (kg) => {
    const n = Number(kg) || 0;
    if (Math.abs(n) >= 1000) return `${(n / 1000).toLocaleString('ca-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} t`;
    return `${n.toLocaleString('ca-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
};
