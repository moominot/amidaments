import { describe, it, expect } from 'vitest';
import {
    buildCertificationSummary, buildCertificationDetail,
    getPreviousCertId, safePct, calcChapterCertifiedTotal,
} from '../src/utils/calculations';

/**
 * El resum d'una certificació: anterior, període i origen.
 *
 * És la lògica més subtil de l'aplicació i la que ha donat més ensurts. El que es desa és
 * **sempre l'acumulat a origen**; el període és una resta, no una dada. Aquests tests ho
 * fixen perquè no torni a dependre del `method` de la fase.
 */

const FASES = [
    { id: 'f1', name: 'Primera', method: 'origin' },
    { id: 'f2', name: 'Segona', method: 'origin' },
    { id: 'f3', name: 'Tercera', method: 'partial' },
];

const partida = (code, preu, quantitat, certs = {}) => ({
    id: code, code, description: code, unit: 'm2', price: preu,
    measurements: [{ id: 'm', description: '', units: quantitat, length: 1, width: 1, height: 1 }],
    certifications: certs,
    breakdown: [], subChapters: [], items: [],
});

const projecte = () => ([{
    id: 'c1', code: 'C1', description: 'Enderrocs', subChapters: [],
    items: [
        // 100 m² a 10 € = 1.000 €. Certificat 30 a la primera i 70 a la segona.
        partida('P1', 10, 100, { f1: { quantity: 30, measurements: [] }, f2: { quantity: 70, measurements: [] } }),
    ],
}, {
    id: 'c2', code: 'C2', description: 'Estructura', subChapters: [],
    // 50 m² a 20 € = 1.000 €. Res certificat.
    items: [partida('P2', 20, 50)],
}]);

describe('getPreviousCertId', () => {
    it('dona la fase anterior per ordre de llista', () => {
        expect(getPreviousCertId(FASES, 'f2')).toBe('f1');
        expect(getPreviousCertId(FASES, 'f3')).toBe('f2');
    });

    it('la primera no en té', () => {
        expect(getPreviousCertId(FASES, 'f1')).toBeNull();
    });

    it('no peta amb entrades buides', () => {
        expect(getPreviousCertId(null, 'f1')).toBeNull();
        expect(getPreviousCertId(FASES, null)).toBeNull();
        expect(getPreviousCertId(FASES, 'inexistent')).toBeNull();
    });
});

describe('safePct', () => {
    it('evita el NaN i l\'infinit quan la base és zero', () => {
        expect(safePct(50, 200)).toBe(25);
        expect(safePct(10, 0)).toBe(0);
        expect(safePct(0, 0)).toBe(0);
    });
});

describe('buildCertificationSummary', () => {
    const preus = {};

    it('el període és origen menys anterior, no una dada pròpia', () => {
        const s = buildCertificationSummary(projecte(), 'f2', preus, FASES);
        const c1 = s.rows.find(r => r.code === 'C1');
        expect(c1.budget).toBe(1000);
        expect(c1.previous).toBe(300);  // 30 × 10
        expect(c1.origin).toBe(700);    // 70 × 10
        expect(c1.period).toBe(400);    // i el període surt de la resta
        expect(c1.pending).toBe(300);
    });

    it('a la primera fase no hi ha anterior i el període és tot l\'origen', () => {
        const s = buildCertificationSummary(projecte(), 'f1', preus, FASES);
        const c1 = s.rows.find(r => r.code === 'C1');
        expect(c1.previous).toBe(0);
        expect(c1.origin).toBe(300);
        expect(c1.period).toBe(300);
        expect(s.prevCertId).toBeNull();
    });

    it('els percentatges van sobre el pressupost del capítol', () => {
        const s = buildCertificationSummary(projecte(), 'f2', preus, FASES);
        const c1 = s.rows.find(r => r.code === 'C1');
        expect(c1.originPct).toBeCloseTo(70, 5);
        expect(c1.previousPct).toBeCloseTo(30, 5);
        expect(c1.periodPct).toBeCloseTo(40, 5);
    });

    it('un capítol sense certificar no dona NaN', () => {
        const s = buildCertificationSummary(projecte(), 'f2', preus, FASES);
        const c2 = s.rows.find(r => r.code === 'C2');
        expect(c2.origin).toBe(0);
        expect(c2.originPct).toBe(0);
        expect(c2.pending).toBe(1000);
    });

    it('els totals sumen els capítols', () => {
        const s = buildCertificationSummary(projecte(), 'f2', preus, FASES);
        expect(s.totals.budget).toBe(2000);
        expect(s.totals.origin).toBe(700);
        expect(s.totals.period).toBe(400);
        expect(s.totals.pending).toBe(1300);
        expect(s.totals.originPct).toBeCloseTo(35, 5);
    });

    it('la base de preus mana sobre el preu del node', () => {
        // Sense passar-la, els imports deixen de quadrar amb el PEM del capçal: §1, §6, §9.
        const s = buildCertificationSummary(projecte(), 'f2', { P1: { price: 20 } }, FASES);
        const c1 = s.rows.find(r => r.code === 'C1');
        expect(c1.budget).toBe(2000);
        expect(c1.origin).toBe(1400);
    });

    it('sense fase activa tot queda a zero i el pendent és el pressupost', () => {
        const s = buildCertificationSummary(projecte(), null, preus, FASES);
        expect(s.totals.origin).toBe(0);
        expect(s.totals.pending).toBe(2000);
    });
});

describe('calcChapterCertifiedTotal', () => {
    it('recorre subcapítols i partides', () => {
        const arbre = {
            id: 'c', code: 'C', subChapters: [{
                id: 'sc', code: 'SC', subChapters: [],
                items: [partida('P3', 10, 100, { f1: { quantity: 50, measurements: [] } })],
            }],
            items: [partida('P4', 5, 100, { f1: { quantity: 20, measurements: [] } })],
        };
        expect(calcChapterCertifiedTotal(arbre, 'f1', {})).toBe(600); // 50×10 + 20×5
    });
});

describe('buildCertificationDetail', () => {
    it('manté l\'ordre de lectura i marca el nivell de cada fila', () => {
        const files = buildCertificationDetail(projecte(), 'f2', {}, FASES);
        expect(files[0].code).toBe('C1');
        expect(files[0].isChapter).toBe(true);
        expect(files[0].level).toBe(0);

        const p1 = files.find(f => f.code === 'P1');
        expect(p1.isChapter).toBe(false);
        expect(p1.level).toBe(1);
        expect(p1.originAmount).toBe(700);
        expect(p1.previousAmount).toBe(300);
        expect(p1.periodAmount).toBe(400);
    });

    it('les quantitats de la partida també van a origen, anterior i període', () => {
        const p1 = buildCertificationDetail(projecte(), 'f2', {}, FASES).find(f => f.code === 'P1');
        expect(p1.budgetQty).toBe(100);
        expect(p1.originQty).toBe(70);
        expect(p1.previousQty).toBe(30);
        expect(p1.periodQty).toBe(40);
        expect(p1.originPct).toBeCloseTo(70, 5);
    });
});
