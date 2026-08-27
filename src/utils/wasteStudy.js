import { round2 } from './calculations';

/**
 * Estudi de gestió de residus de construcció i demolició (RD 105/2008).
 *
 * L'article 4.1.a) obliga el projecte d'execució a incloure un estudi amb set apartats. Aquest
 * mòdul resol els que es poden calcular a partir de l'amidament —l'estimació, les fraccions que
 * cal separar i la valoració del cost—; la redacció dels altres viu a `wasteStudyPdf.js`.
 *
 * Les xifres surten de `buildWasteSummary` (`utils/waste.js`), que agrega per codi LER el que
 * declaren els registres `~R` i `~X` del BC3. Veure `docs/residus.md`.
 */

/**
 * Fraccions de l'article 5.5 i els llindars a partir dels quals la separació en obra és
 * **obligatòria**. Són els valors vigents: el reial decret en va fixar uns de dobles amb una
 * reducció a partir del 14 de febrer de 2010, i els que hi ha aquí són els reduïts.
 *
 * Els codis LER es comparen per prefix, sense espais: «17 04» agafa tota la família dels
 * metalls.
 */
export const FRACCIONS_RD105 = [
    { id: 'formigo', nom: 'Formigó', llindar: 80, ler: ['170101'] },
    { id: 'ceramic', nom: 'Maons, teules i materials ceràmics', llindar: 40, ler: ['170102', '170103'] },
    { id: 'metall', nom: 'Metall', llindar: 2, ler: ['1704'] },
    { id: 'fusta', nom: 'Fusta', llindar: 1, ler: ['170201'] },
    { id: 'vidre', nom: 'Vidre', llindar: 1, ler: ['170202'] },
    { id: 'plastic', nom: 'Plàstic', llindar: 0.5, ler: ['170203'] },
    { id: 'paper', nom: 'Paper i cartró', llindar: 0.5, ler: ['150101', '200101'] },
];

const netejaLer = (ler) => (ler || '').replace(/\s+/g, '');

/** A quina fracció de l'article 5.5 correspon un codi LER, si és que en correspon a cap. */
export const fraccioDe = (ler) => {
    const net = netejaLer(ler);
    if (!net) return null;
    return FRACCIONS_RD105.find(f => f.ler.some(p => net.startsWith(p))) || null;
};

/** Tarifes buides, una per fracció més les no classificades. */
export const tarifesBuides = () => ({
    ...Object.fromEntries(FRACCIONS_RD105.map(f => [f.id, 0])),
    altres: 0,
});

/**
 * @param {object} summary el que retorna `buildWasteSummary`
 * @param {object} tarifes €/t per fracció (`tarifesBuides()` com a punt de partida)
 * @returns {{
 *   fraccions: Array, totals: object, calSepararAlguna: boolean, valorada: boolean
 * }}
 *   Cada fila porta massa en tones, volum, si supera el llindar i el cost previst.
 */
export const buildWasteStudy = (summary, tarifes = {}) => {
    const buides = tarifesBuides();
    const files = new Map();

    const afegeix = (clau, base, fila) => {
        const f = files.get(clau) || { ...base, mass: 0, volume: 0, codis: [] };
        f.mass += fila.mass;
        f.volume += fila.volume;
        if (fila.ler) f.codis.push({ ler: fila.ler, description: fila.description, mass: fila.mass, volume: fila.volume });
        files.set(clau, f);
    };

    (summary?.perLer || []).forEach(fila => {
        const fraccio = fraccioDe(fila.ler);
        if (fraccio) {
            afegeix(fraccio.id, { id: fraccio.id, nom: fraccio.nom, llindar: fraccio.llindar }, fila);
        } else {
            // Les mescles (17 01 07, 17 09 04…) no compten per a cap llindar: per definició no
            // estan separades, i comptar-les a una fracció faria saltar una obligació que la
            // norma no imposa.
            afegeix('altres', { id: 'altres', nom: 'Altres residus i mescles', llindar: null }, fila);
        }
    });

    // Ordre del reial decret, i les no classificades al final.
    const ordre = [...FRACCIONS_RD105.map(f => f.id), 'altres'];
    const fraccions = ordre
        .filter(id => files.has(id))
        .map(id => {
            const f = files.get(id);
            const tones = round2(f.mass / 1000);
            const tarifa = Number(tarifes[id] ?? buides[id]) || 0;
            return {
                ...f,
                mass: round2(f.mass),
                tones,
                volume: round2(f.volume),
                calSeparar: f.llindar !== null && tones > f.llindar,
                tarifa,
                cost: round2(tones * tarifa),
                codis: f.codis.sort((a, b) => b.mass - a.mass),
            };
        });

    const suma = (camp) => round2(fraccions.reduce((a, f) => a + f[camp], 0));

    return {
        fraccions,
        totals: { mass: suma('mass'), tones: suma('tones'), volume: suma('volume'), cost: suma('cost') },
        calSepararAlguna: fraccions.some(f => f.calSeparar),
        // Sense cap tarifa, l'apartat 7 no es pot escriure: val més ometre'l que publicar zeros.
        valorada: fraccions.some(f => f.tarifa > 0),
    };
};
