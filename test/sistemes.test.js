import { describe, it, expect } from 'vitest';
import { SISTEMES, generaSistema, codiLliure, codisDelProjecte, valorsPerDefecte } from '../src/utils/sistemes';
import { PISCINA } from '../src/utils/sistemes/piscina';
import { calcItemTotalQty, calcChapterTotal, getItemUnitPrice, normalizeCode } from '../src/utils/calculations';
import { embolcallaPerEnganxar } from '../src/utils/portaRetalls';
import { generateBC3 } from '../src/utils/bc3Writer';
import { processBC3Data } from '../src/utils/bc3Parser';

/**
 * Sistemes constructius. Les quantitats esperades estan fetes a mà a partir de les regles
 * documentades a `src/utils/sistemes/piscina.js`, amb els valors per defecte:
 * L 8, A 1,78, P 1,30–1,44, mur 0,25, neteja 0,10, vol 0,20, suport de tubs 1,20.
 */

// No baixa dins de les partides: un cop reimportat, els components del descomposat hi
// tornen com a fills.
const partides = (node, out = {}) => {
    if (node.unit) {
        out[normalizeCode(node.code)] = node;
        return out;
    }
    [...(node.subChapters || []), ...(node.items || [])].forEach(n => partides(n, out));
    return out;
};

const quantitats = (resultat) => Object.fromEntries(
    resultat.nodes.flatMap(n => Object.entries(partides(n))).map(([codi, n]) => [codi, calcItemTotalQty(n)]),
);

describe('piscina amb els valors per defecte', () => {
    const r = generaSistema(PISCINA, {});
    const q = quantitats(r);

    it('genera un capítol amb dos subcapítols i les catorze partides', () => {
        expect(r.errors).toEqual([]);
        expect(r.nodes).toHaveLength(1);
        expect(r.nodes[0].code).toBe('PISC');
        expect(r.nodes[0].unit).toBeFalsy();
        expect(r.nodes[0].subChapters.map(c => c.code)).toEqual(['PISC.01', 'PISC.02']);
        expect(Object.keys(q)).toHaveLength(14);
    });

    it('amida l\'estructura pels exteriors i per l\'eix', () => {
        // (8 + 0,5 + 0,2) × (1,78 + 0,5 + 0,2)
        expect(q['RF22.01.01']).toBe(21.58);
        // 8,5 × 2,28
        expect(q['RF22.01.02']).toBe(19.38);
        // 2 × 8,25 × 1,37 + 2,03 × 1,30 + 2,03 × 1,44
        expect(q['RF22.01.03']).toBe(22.61 + 2.64 + 2.92);
    });

    it('amida les parets interiors amb la fondària mitjana i el fons inclinat', () => {
        // 2 × 8 × 1,37 + 1,78 × 1,30 + 1,78 × 1,44
        expect(q['RF22.01.06']).toBe(26.79);
        // + fons: √(8² + 0,14²) = 8,001 × 1,78
        expect(q['RF22.01.07']).toBe(41.03);
        expect(q['RF22.01.08']).toBe(41.03);
        expect(q['RF22.01.09']).toBe(41.03);
    });

    it('reparteix el coronament entre la peça de 40 i la de 30', () => {
        expect(q['RF22.01.10']).toBe(8.4);
        // 8,4 + 2 × 2,18
        expect(q['RF22.01.11']).toBe(12.76);
    });

    it('amida el suport de tubs i els equips', () => {
        // 8,5 × 1,2 + 2,28 × 1,2
        expect(q['RF22.01.05']).toBe(10.2 + 2.74);
        expect(q['RF22.01.04']).toBe(1);
        expect(q['RF22.02.01']).toBe(1);
        expect(q['RF22.02.02']).toBe(2);
        expect(q['RF22.02.03']).toBe(1);
    });

    it('suma el total amb el preu de cada concepte', () => {
        expect(Math.round(calcChapterTotal(r.nodes[0], r.prices) * 100) / 100).toBe(16362.97);
    });

    it('no porta components fills ni preus que no surtin a cap partida', () => {
        Object.values(partides(r.nodes[0])).forEach(n => expect(n.items).toEqual([]));
        const usats = new Set();
        Object.values(partides(r.nodes[0])).forEach(n => {
            usats.add(normalizeCode(n.code));
            n.breakdown.forEach(b => usats.add(normalizeCode(b.code)));
        });
        Object.keys(r.prices).forEach(k => expect(usats.has(normalizeCode(k))).toBe(true));
    });

    it('dona ids diferents a cada generació', () => {
        const altra = generaSistema(PISCINA, {});
        expect(altra.nodes[0].id).not.toBe(r.nodes[0].id);
    });
});

describe('el joc de partides de la piscina', () => {
    // El capítol de referència portava el mur amb tots els rendiments a 1, i el preu
    // calculat (268,61 €/m²) no tenia res a veure amb el del concepte (91,35 €/m²).
    it('cada partida val el preu del seu concepte', () => {
        PISCINA.joc.partides.forEach(p => {
            const calculat = getItemUnitPrice(p, PISCINA.joc.prices);
            expect(Math.abs(calculat - p.price), p.code).toBeLessThanOrEqual(0.01);
        });
    });

    it('totes les partides del sistema hi són', () => {
        const codis = new Set(PISCINA.joc.partides.map(p => p.code));
        PISCINA.capitols.flatMap(c => c.partides).forEach(d => expect(codis.has(d.codi), d.codi).toBe(true));
    });
});

describe('paràmetres', () => {
    it('amb el fons pla ajunta les dues transversals', () => {
        const r = generaSistema(PISCINA, { P1: 1.4, P2: 1.4 });
        const arrebossat = partides(r.nodes[0])['RF22.01.06'];
        expect(arrebossat.measurements).toHaveLength(2);
        expect(arrebossat.measurements[1]).toMatchObject({ units: 2, length: 1.78, height: 1.4 });
        // 2 × 8 × 1,4 + 2 × 1,78 × 1,4
        expect(calcItemTotalQty(arrebossat)).toBe(22.4 + 4.98);
    });

    it('treu les partides que es queden sense línies', () => {
        const r = generaSistema(PISCINA, { focus: 0, nAmple: 0, banc: 0 });
        const p = partides(r.nodes[0]);
        expect(p['RF22.02.02']).toBeUndefined();
        expect(p['RF22.01.10']).toBeUndefined();
        expect(p['RF22.01.04']).toBeUndefined();
        // Sense peça de 40, la de 30 fa tot el perímetre: 2 × 8,4 + 2 × 2,18
        expect(calcItemTotalQty(p['RF22.01.11'])).toBe(21.16);
    });

    it('treu el subcapítol si es queda buit', () => {
        const r = generaSistema(PISCINA, { depuracio: 0, focus: 0, electrolisi: 0 });
        expect(r.nodes[0].subChapters.map(c => c.code)).toEqual(['PISC.01']);
    });

    it('rebutja una fondària màxima menor que la mínima', () => {
        const r = generaSistema(PISCINA, { P1: 1.5, P2: 1.2 });
        expect(r.errors).toContain('La fondària màxima no pot ser menor que la mínima');
        expect(r.nodes).toBeUndefined();
    });

    it('rebutja els valors fora de límits i els enters amb decimals', () => {
        expect(generaSistema(PISCINA, { L: 0 }).errors[0]).toMatch(/^Llargària/);
        expect(generaSistema(PISCINA, { focus: 1.5 }).errors[0]).toMatch(/enter/);
        expect(generaSistema(PISCINA, { nAmple: 3 }).errors[0]).toMatch(/màxim/);
        expect(generaSistema(PISCINA, { L: NaN }).errors[0]).toMatch(/falta/);
    });

    it('tots els sistemes tenen un valor per defecte vàlid per a cada paràmetre', () => {
        SISTEMES.forEach(s => {
            expect(Object.keys(valorsPerDefecte(s))).toHaveLength(s.parametres.length);
            expect(generaSistema(s, {}).errors).toEqual([]);
        });
    });
});

describe('inserció al projecte', () => {
    it('busca un codi lliure per al capítol', () => {
        expect(codiLliure('PISC', new Set())).toBe('PISC');
        expect(codiLliure('PISC', new Set(['PISC', 'PISC_2']))).toBe('PISC_3');
        const r = generaSistema(PISCINA, {}, { codisOcupats: new Set(['PISC']) });
        expect(r.nodes[0].code).toBe('PISC_2');
        expect(r.nodes[0].subChapters[0].code).toBe('PISC_2.01');
    });

    it('recull els codis del projecte normalitzats', () => {
        const codis = codisDelProjecte([{ code: '01#', subChapters: [{ code: '01.01#' }], items: [{ code: 'P1 ', unit: 'm2' }] }]);
        expect([...codis].sort()).toEqual(['01', '01.01', 'P1']);
    });

    it('entra dins del capítol de destí pel mateix camí que una partida enganxada', () => {
        const projecte = [{ id: 'c1', code: '01', description: 'OBRA', subChapters: [], items: [] }];
        const r = generaSistema(PISCINA, {});
        const desti = embolcallaPerEnganxar(projecte, 'c1', r.nodes);
        expect(desti.cami).toEqual(['c1']);
        expect(desti.chapters[0].code).toBe('01');
        expect(desti.chapters[0].subChapters[0].code).toBe('PISC');
    });
});

describe('exportació BC3 del capítol generat', () => {
    const total = (chapters, prices) => Math.round(chapters.reduce((a, c) => a + calcChapterTotal(c, prices), 0) * 100) / 100;

    it('conserva el total i les quantitats encadenant tres cicles', () => {
        const r = generaSistema(PISCINA, { L: 10.5 });
        let chapters = r.nodes;
        let prices = r.prices;
        const esperat = total(chapters, prices);
        const q = quantitats(r);
        for (let i = 0; i < 3; i++) {
            const bc3 = generateBC3({ budget: { name: 'Piscina', chapters }, chapters, priceDatabase: prices });
            const reimportat = processBC3Data(bc3);
            chapters = reimportat.chapters;
            prices = reimportat.prices;
            expect(total(chapters, prices)).toBe(esperat);
            expect(quantitats({ nodes: chapters })).toEqual(q);
        }
    });
});
