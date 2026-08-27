import { round2 } from './calculations';

/**
 * Migració de l'esquema del projecte.
 *
 * Fins ara el valor desat a `node.certifications[certId]` significava una cosa o una altra
 * segons el `method` de la fase: en `origin` era l'acumulat, en `partial` era el del període.
 * Commutar el mètode reinterpretava les dades i l'import certificat canviava sol.
 *
 * Ara el valor desat **sempre és l'acumulat a origen**. Els projectes que tenien fases en
 * `partial` porten xifres per període, i cal convertir-les una sola vegada perquè els totals
 * no es moguin. La conversió es fa en ordre de fase i sobre els valors originals.
 *
 * Quan una fase té detall d'amidament, no es pot sumar-hi l'anterior aritmèticament sense
 * perdre les línies: s'hi afegeix una línia «Certificat anterior» al davant, de manera que
 * la suma dona l'acumulat i el detall introduït es conserva tal com estava.
 */

export const SCHEMA_VERSION = 2;

const quantitatDe = (certData) => {
    if (!certData) return 0;
    if (certData.measurements && certData.measurements.length > 0) {
        let subtotal = 0;
        certData.measurements.forEach(m => {
            if (!m.isIncrement) subtotal += round2((m.units || 0) * (m.length || 1) * (m.width || 1) * (m.height || 1));
        });
        const increments = certData.measurements
            .filter(m => m.isIncrement)
            .reduce((acc, m) => acc + (subtotal * ((parseFloat(m.units) || 0) / 100)), 0);
        return round2(subtotal + increments);
    }
    return parseFloat(certData.quantity) || 0;
};

const LINIA_ANTERIOR = 'Certificat anterior (acumulat)';

const migraNode = (node, fases) => {
    const seguent = {
        ...node,
        subChapters: (node.subChapters || []).map(n => migraNode(n, fases)),
        items: (node.items || []).map(n => migraNode(n, fases)),
    };

    if (!node.certifications || Object.keys(node.certifications).length === 0) return seguent;

    const certifications = { ...node.certifications };
    let acumulat = 0;

    // En ordre de fase: l'acumulat d'una fase parcial és el de l'anterior més el seu període.
    fases.forEach(fase => {
        const dades = certifications[fase.id];
        const propi = quantitatDe(dades);

        if (fase.method !== 'partial') {
            // Ja era a origen: el valor desat ja és l'acumulat.
            acumulat = dades ? propi : acumulat;
            return;
        }

        acumulat = round2(acumulat + propi);
        if (!dades) return;

        const anterior = round2(acumulat - propi);
        if (dades.measurements && dades.measurements.length > 0 && anterior !== 0) {
            certifications[fase.id] = {
                ...dades,
                quantity: acumulat,
                measurements: [
                    {
                        id: `migracio-${fase.id}`,
                        description: LINIA_ANTERIOR,
                        units: anterior, length: 1, width: 1, height: 1,
                    },
                    ...dades.measurements,
                ],
            };
        } else {
            certifications[fase.id] = { ...dades, quantity: acumulat, measurements: dades.measurements || [] };
        }
    });

    seguent.certifications = certifications;
    return seguent;
};

/**
 * Aplica les migracions pendents a un projecte. Idempotent: marca la versió a `schemaVersion`.
 * @returns {{budget: object, migrat: boolean}}
 */
export const migrateBudget = (budget) => {
    if (!budget || typeof budget !== 'object') return { budget, migrat: false };
    if ((budget.schemaVersion || 1) >= SCHEMA_VERSION) return { budget, migrat: false };

    const fases = budget.certifications || [];
    const calConvertir = fases.some(c => c.method === 'partial');

    const migrat = {
        ...budget,
        schemaVersion: SCHEMA_VERSION,
        chapters: calConvertir
            ? (budget.chapters || []).map(n => migraNode(n, fases))
            : (budget.chapters || []),
        // El mètode passa a ser només una preferència d'entrada, però es conserva perquè
        // el document de certificació el continua indicant.
        certifications: fases,
    };

    return { budget: migrat, migrat: calConvertir };
};
