import { describe, it, expect } from 'vitest';
import { creaFragment, llegeixFragment, embolcallaPerEnganxar } from '../src/utils/portaRetalls';
import { resolveMeasurementRefs } from '../src/utils/measurementRefs';

/**
 * Copiar i enganxar capítols i partides entre finestres a través del porta-retalls.
 */

const linia = (id, description, units, length = 1) => ({ id, description, units, length, width: 1, height: 1 });
const partida = (code, extra = {}) => ({
    id: `id-${code}`, code, description: code, unit: 'm2',
    measurements: [linia(`l-${code}`, 'base', 2, 3)], ...extra,
});
const capitol = (code, { subChapters = [], items = [] } = {}) => ({ id: `id-${code}`, code, description: code, subChapters, items });

const arbre = () => [
    capitol('01', {
        subChapters: [capitol('01.01', { items: [partida('P1', { breakdown: [{ code: 'MAT', yield: 2, price: 5 }] })] })],
        items: [partida('P2', { measurements: [{ id: 'v', description: '', refCode: 'P1', factor: 2 }] })],
    }),
    capitol('02'),
];

describe('crear i llegir el fragment', () => {
    const preus = { P1: { price: 10 }, MAT: { price: 5 }, ALTRE: { price: 99 } };

    it('porta el subarbre i només els preus dels codis que hi surten', () => {
        const f = llegeixFragment(creaFragment(arbre()[0], preus));
        expect(f.nodes).toHaveLength(1);
        expect(f.nodes[0].code).toBe('01');
        expect(f.nodes[0].subChapters[0].items[0].code).toBe('P1');
        expect(Object.keys(f.prices).sort()).toEqual(['MAT', 'P1']);
    });

    it('dona ids nous, també a les línies', () => {
        const f = llegeixFragment(creaFragment(arbre()[0], preus));
        const p1 = f.nodes[0].subChapters[0].items[0];
        expect(f.nodes[0].id).not.toBe('id-01');
        expect(p1.id).not.toBe('id-P1');
        expect(p1.measurements[0].id).not.toBe('l-P1');
    });

    it('congela les línies vinculades amb la quantitat resolta', () => {
        const resolt = resolveMeasurementRefs(arbre()).chapters;
        const f = llegeixFragment(creaFragment(resolt[0].items[0], preus));
        const m = f.nodes[0].measurements[0];
        expect(m.refCode).toBeUndefined();
        expect(m.factor).toBeUndefined();
        expect(m.units).toBe(12); // 2 × 3 de P1, per factor 2
        expect(m.description).toBe('= P1 × 2');
    });

    it('no porta certificacions', () => {
        const node = partida('P9', { certifications: { fase1: { quantity: 3 } } });
        expect(llegeixFragment(creaFragment(node)).nodes[0].certifications).toBeUndefined();
    });

    it('qualsevol altre text no és un fragment', () => {
        expect(llegeixFragment('hola')).toBeNull();
        expect(llegeixFragment('{"a":1}')).toBeNull();
        expect(llegeixFragment('{"format":"amidaments/fragment" trencat')).toBeNull();
        expect(llegeixFragment(JSON.stringify({ format: 'amidaments/fragment', nodes: [] }))).toBeNull();
    });
});

describe('on va el que s\'enganxa', () => {
    const p = partida('NOVA');
    const c = capitol('NOU');

    it('dins del capítol seleccionat, embolcallat amb la cadena fins a l\'arrel', () => {
        const r = embolcallaPerEnganxar(arbre(), 'id-01.01', [p]);
        expect(r.cami).toEqual(['id-01', 'id-01.01']);
        expect(r.chapters[0].code).toBe('01');
        expect(r.chapters[0].items).toEqual([]);
        expect(r.chapters[0].subChapters[0].code).toBe('01.01');
        expect(r.chapters[0].subChapters[0].items).toEqual([p]);
    });

    it('amb una partida seleccionada, al capítol que la conté', () => {
        const r = embolcallaPerEnganxar(arbre(), 'id-P1', [p]);
        expect(r.cami).toEqual(['id-01', 'id-01.01']);
    });

    it('un capítol hi entra com a subcapítol', () => {
        const r = embolcallaPerEnganxar(arbre(), 'id-02', [c]);
        expect(r.chapters[0].subChapters).toEqual([c]);
    });

    it('sense selecció, un capítol va a l\'arrel i una partida no té on anar', () => {
        expect(embolcallaPerEnganxar(arbre(), null, [c])).toEqual({ chapters: [c], cami: [] });
        expect(embolcallaPerEnganxar(arbre(), null, [p])).toBeNull();
    });
});
