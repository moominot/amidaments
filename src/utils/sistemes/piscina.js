import joc from './piscina.partides.json';

/**
 * Sistema constructiu: piscina de bloc de formigó armat sobre llosa.
 *
 * A partir de les dimensions interiors del vas genera el capítol sencer amb les línies
 * d'amidament de cada partida. Les regles reprodueixen com s'havia amidat a mà el capítol de
 * referència (el capítol 22 d'un projecte real, d'on surten les partides i els preus de
 * `piscina.partides.json`):
 *
 * - **Parets interiors** (arrebossat, impermeabilització, gres): dues longitudinals de
 *   L × fondària mitjana i dues transversals de A, una a cada fondària. Amb fons inclinat
 *   linealment, la mitjana dona l'àrea exacta del trapezi.
 * - **Fons**: A × la llargària real del pla inclinat, √(L² + ΔP²). Amb el desnivell habitual
 *   la diferència amb la projecció és de mil·límetres, però és la superfície que es revesteix.
 * - **Mur**: amidat per l'eix, (L + e) i (A + e), a les mateixes alçades que les parets. Així
 *   les cantonades no es compten dues vegades.
 * - **Llosa**: el rectangle exterior dels murs, (L + 2e) × (A + 2e).
 * - **Formigó de neteja**: la llosa més un sobreample `s` per costat.
 * - **Coronament**: cada costat allarga `v` per extrem, (L + 2v) i (A + 2v). Els costats
 *   llargs que porten la peça ampla (40 cm) es trien amb un paràmetre; la resta va amb la
 *   peça de 30 cm.
 * - **Suport de tubs**: el bloc italià va per fora del mur, (L + 2e) o (A + 2e), als costats
 *   que es diguin.
 *
 * El fons inclinat es pren com un pla entre les dues fondàries. Una piscina amb esglaó o
 * amb zona fonda en punta de diamant no hi encaixa; les línies generades es poden retocar.
 *
 * ─── El mur del capítol de referència ───
 *
 * La partida RF22.01.03 portava el descomposat amb **tots els rendiments a 1** (un bloc, un
 * quilo d'acer, un metre cúbic de formigó, una hora d'oficial... per m²). Amb aquell
 * descomposat el preu calculat és 268,61 €/m² i no els 91,35 €/m² que diu el concepte, i el
 * capítol sumava 21.511,97 € en lloc de 16.474,24 €. Aquí es desa sense descomposat, de manera
 * que la partida val el preu del concepte.
 */

const r3 = (x) => Math.round((Number(x) + Number.EPSILON) * 1000) / 1000;

const linia = (description, units, length = 1, width = 1, height = 1) => ({
    description, units, length: r3(length), width: r3(width), height: r3(height),
});

const geometria = (p) => {
    const fondaMitjana = (p.P1 + p.P2) / 2;
    return {
        fondaMitjana,
        llargFons: Math.sqrt(p.L * p.L + (p.P2 - p.P1) ** 2),
    };
};

/** Parets interiors del vas. Si les dues fondàries són iguals, les transversals van juntes. */
const parets = (p, g) => [
    linia('Parets longitudinals', 2, p.L, 1, g.fondaMitjana),
    ...(p.P1 === p.P2
        ? [linia('Parets transversals', 2, p.A, 1, p.P1)]
        : [
            linia('Paret transversal, extrem baix', 1, p.A, 1, p.P1),
            linia('Paret transversal, extrem fondo', 1, p.A, 1, p.P2),
        ]),
];

const fons = (p, g) => linia('Fons', 1, g.llargFons, p.A);

const fmt = (x) => Number(x).toLocaleString('ca-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const PISCINA = {
    id: 'piscina',
    nom: 'Piscina',
    resum: 'Vas de bloc de formigó armat sobre llosa, revestit de gres, amb coronament de marès i equips de depuració.',
    codi: 'PISC',
    titol: (p) => `PISCINA ${fmt(p.L)} × ${fmt(p.A)} m, fondària ${p.P1 === p.P2 ? fmt(p.P1) : `${fmt(p.P1)}–${fmt(p.P2)}`} m`,

    parametres: [
        { id: 'L', grup: 'Vas (interior)', nom: 'Llargària', unitat: 'm', defecte: 8, min: 0.5 },
        { id: 'A', grup: 'Vas (interior)', nom: 'Amplada', unitat: 'm', defecte: 1.78, min: 0.5 },
        { id: 'P1', grup: 'Vas (interior)', nom: 'Fondària mínima', unitat: 'm', defecte: 1.3, min: 0.2 },
        { id: 'P2', grup: 'Vas (interior)', nom: 'Fondària màxima', unitat: 'm', defecte: 1.44, min: 0.2, ajuda: 'Igual que la mínima si el fons és pla' },

        { id: 'e', grup: 'Estructura', nom: 'Gruix del mur', unitat: 'm', defecte: 0.25, min: 0, max: 1 },
        { id: 's', grup: 'Estructura', nom: 'Sobreample de la neteja', unitat: 'm', defecte: 0.1, min: 0, max: 1, ajuda: 'Per costat, fora de la llosa' },

        { id: 'v', grup: 'Coronament', nom: 'Vol a cada extrem', unitat: 'm', defecte: 0.2, min: 0, max: 1, ajuda: 'El que allarga cada costat del coronament per extrem' },
        { id: 'nAmple', grup: 'Coronament', nom: 'Costats llargs amb peça de 40', unitat: 'ut', defecte: 1, enter: true, min: 0, max: 2, ajuda: 'La resta del perímetre va amb peça de 30' },

        { id: 'hT', grup: 'Suport de tubs', nom: 'Alçada', unitat: 'm', defecte: 1.2, min: 0 },
        { id: 'tLlargs', grup: 'Suport de tubs', nom: 'Costats llargs', unitat: 'ut', defecte: 1, enter: true, min: 0, max: 2 },
        { id: 'tCurts', grup: 'Suport de tubs', nom: 'Costats curts', unitat: 'ut', defecte: 1, enter: true, min: 0, max: 2 },

        { id: 'banc', grup: 'Equipament', nom: 'Banc i escala', unitat: 'ut', defecte: 1, enter: true, min: 0 },
        { id: 'depuracio', grup: 'Equipament', nom: 'Equip de depuració', unitat: 'ut', defecte: 1, enter: true, min: 0 },
        { id: 'focus', grup: 'Equipament', nom: 'Focus', unitat: 'ut', defecte: 2, enter: true, min: 0 },
        { id: 'electrolisi', grup: 'Equipament', nom: 'Electròlisi salina', unitat: 'ut', defecte: 1, enter: true, min: 0 },
    ],

    valida: (p) => {
        const errors = [];
        if (p.P2 < p.P1) errors.push('La fondària màxima no pot ser menor que la mínima');
        if (p.hT <= 0 && (p.tLlargs > 0 || p.tCurts > 0)) errors.push('El suport de tubs necessita una alçada');
        return errors;
    },

    capitols: [
        {
            sufix: '01',
            description: 'CONSTRUCCIÓ DEL VAS',
            partides: [
                {
                    codi: 'RF22.01.01',
                    linies: (p) => [linia('Sota la llosa', 1, p.L + 2 * p.e + 2 * p.s, p.A + 2 * p.e + 2 * p.s)],
                },
                {
                    codi: 'RF22.01.02',
                    linies: (p) => [linia('Llosa', 1, p.L + 2 * p.e, p.A + 2 * p.e)],
                },
                {
                    codi: 'RF22.01.03',
                    linies: (p, g) => [
                        linia('Murs longitudinals, per l\'eix', 2, p.L + p.e, 1, g.fondaMitjana),
                        ...(p.P1 === p.P2
                            ? [linia('Murs transversals, per l\'eix', 2, p.A + p.e, 1, p.P1)]
                            : [
                                linia('Mur transversal, extrem baix', 1, p.A + p.e, 1, p.P1),
                                linia('Mur transversal, extrem fondo', 1, p.A + p.e, 1, p.P2),
                            ]),
                    ],
                },
                {
                    codi: 'RF22.01.04',
                    linies: (p) => [linia('Banc i escala', p.banc)],
                },
                {
                    codi: 'RF22.01.05',
                    linies: (p) => [
                        linia('Suport de tubs, costat llarg', p.tLlargs, p.L + 2 * p.e, 1, p.hT),
                        linia('Suport de tubs, costat curt', p.tCurts, p.A + 2 * p.e, 1, p.hT),
                    ],
                },
                { codi: 'RF22.01.06', linies: (p, g) => parets(p, g) },
                { codi: 'RF22.01.07', linies: (p, g) => [...parets(p, g), fons(p, g)] },
                { codi: 'RF22.01.08', linies: (p, g) => [...parets(p, g), fons(p, g)] },
                { codi: 'RF22.01.09', linies: (p, g) => [...parets(p, g), fons(p, g)] },
                {
                    codi: 'RF22.01.10',
                    linies: (p) => [linia('Costat llarg', p.nAmple, p.L + 2 * p.v)],
                },
                {
                    codi: 'RF22.01.11',
                    linies: (p) => [
                        linia('Costat llarg', 2 - p.nAmple, p.L + 2 * p.v),
                        linia('Costats curts', 2, p.A + 2 * p.v),
                    ],
                },
            ],
        },
        {
            sufix: '02',
            description: 'INSTAL·LACIONS',
            partides: [
                { codi: 'RF22.02.01', linies: (p) => [linia('Equip de depuració', p.depuracio)] },
                { codi: 'RF22.02.02', linies: (p) => [linia('Focus', p.focus)] },
                { codi: 'RF22.02.03', linies: (p) => [linia('Electròlisi salina', p.electrolisi)] },
            ],
        },
    ],

    geometria,
    joc,
};
