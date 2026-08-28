import { describe, it, expect } from 'vitest';
import { resolveMeasurementRefs, isRefLine, refLabel } from '../src/utils/measurementRefs';
import { calcItemTotalQty } from '../src/utils/calculations';

/**
 * Amidaments vinculats entre partides.
 *
 * El cas que els va motivar: en una terrassa, la solera, la formació de pendents, la
 * impermeabilització, l'aïllant i el paviment tenen la mateixa superfície.
 */

const partida = (code, measurements) => ({ id: code, code, description: code, unit: 'm2', measurements });
const linia = (id, description, units, length = 1) => ({ id, description, units, length, width: 1, height: 1 });
const vincle = (refCode, extra = {}) => ({ id: `v-${refCode}`, description: 'vinculat', refCode, factor: 1, ...extra });

const arbre = (...items) => [{ id: 'cap', code: 'C1', description: 'Capítol', subChapters: [], items }];
const quantitat = (chapters, code) => {
    const busca = (nodes) => {
        for (const n of nodes) {
            if (n.code === code) return n;
            const dins = busca([...(n.subChapters || []), ...(n.items || [])]);
            if (dins) return dins;
        }
        return null;
    };
    return calcItemTotalQty(busca(chapters));
};

describe('vincle a tota la partida', () => {
    const origen = partida('SOLERA', [linia('a', 'terrassa A', 4, 3), linia('b', 'terrassa B', 5, 4)]);
    const desti = partida('IMPER', [vincle('SOLERA')]);
    const { chapters } = resolveMeasurementRefs(arbre(origen, desti));

    it('pren el total de l\'origen', () => {
        expect(quantitat(chapters, 'SOLERA')).toBe(32); // 12 + 20
        expect(quantitat(chapters, 'IMPER')).toBe(32);
    });

    it('segueix el total encara que s\'hi afegeixin línies', () => {
        origen.measurements.push(linia('c', 'terrassa C', 1, 8));
        const { chapters: ara } = resolveMeasurementRefs(arbre(origen, desti));
        expect(quantitat(ara, 'IMPER')).toBe(40);
        origen.measurements.pop();
    });
});

describe('vincle a una línia concreta', () => {
    const origen = partida('SOLERA', [linia('a', 'terrassa A', 4, 3), linia('b', 'terrassa B', 5, 4)]);
    const desti = partida('IMPER', [vincle('SOLERA', { refLineId: 'a' })]);

    it('pren només aquella línia', () => {
        const { chapters } = resolveMeasurementRefs(arbre(origen, desti));
        expect(quantitat(chapters, 'IMPER')).toBe(12);
    });

    it('canviar una altra línia de l\'origen no el mou', () => {
        const canviat = { ...origen, measurements: [linia('a', 'terrassa A', 4, 3), linia('b', 'terrassa B', 8, 5)] };
        const { chapters } = resolveMeasurementRefs(arbre(canviat, desti));
        expect(quantitat(chapters, 'SOLERA')).toBe(52);
        expect(quantitat(chapters, 'IMPER')).toBe(12);
    });

    it('la descripció de l\'origen es recalcula i no es desa', () => {
        // Només se'n desa l'id: reanomenar la línia d'origen ha de propagar-se.
        const reanomenat = { ...origen, measurements: [linia('a', 'coberta principal', 4, 3), origen.measurements[1]] };
        const { chapters } = resolveMeasurementRefs(arbre(reanomenat, desti));
        const node = chapters[0].items.find(n => n.code === 'IMPER');
        expect(refLabel(node.measurements[0])).toContain('coberta principal');
    });

    it('si la línia d\'origen desapareix, val zero i queda registrat', () => {
        const sense = { ...origen, measurements: [origen.measurements[1]] };
        const { chapters, missingLines } = resolveMeasurementRefs(arbre(sense, desti));
        expect(quantitat(chapters, 'IMPER')).toBe(0);
        expect([...missingLines]).toHaveLength(1);
        const node = chapters[0].items.find(n => n.code === 'IMPER');
        expect(refLabel(node.measurements[0])).toContain('línia esborrada');
    });
});

describe('factor', () => {
    it('multiplica la quantitat de l\'origen', () => {
        const origen = partida('SOLERA', [linia('a', 'terrassa', 10)]);
        const dues = partida('IMPER', [vincle('SOLERA', { factor: 2 })]);
        const mitja = partida('AILLANT', [vincle('SOLERA', { factor: 0.5 })]);
        const { chapters } = resolveMeasurementRefs(arbre(origen, dues, mitja));
        expect(quantitat(chapters, 'IMPER')).toBe(20);
        expect(quantitat(chapters, 'AILLANT')).toBe(5);
    });

    it('surt a l\'etiqueta amb coma decimal', () => {
        expect(refLabel({ refCode: 'SOLERA', factor: 2 })).toBe('= SOLERA × 2');
        expect(refLabel({ refCode: 'SOLERA', factor: 0.5 })).toBe('= SOLERA × 0,5');
        expect(refLabel({ refCode: 'SOLERA', factor: 1 })).toBe('= SOLERA');
    });
});

describe('casos límit', () => {
    it('una línia de percentatge es resol per la seva aportació', () => {
        const origen = partida('SOLERA', [linia('a', 'base', 100), { id: 'p', description: 'merma', units: 10, isIncrement: true }]);
        const desti = partida('IMPER', [vincle('SOLERA', { refLineId: 'p' })]);
        const { chapters } = resolveMeasurementRefs(arbre(origen, desti));
        expect(quantitat(chapters, 'SOLERA')).toBe(110);
        expect(quantitat(chapters, 'IMPER')).toBe(10); // el 10 % de 100, no el número 10
    });

    it('una referència circular es talla a zero en comptes de penjar-se', () => {
        const a = partida('A', [vincle('B')]);
        const b = partida('B', [vincle('A')]);
        const { chapters, cycles } = resolveMeasurementRefs(arbre(a, b));
        expect(quantitat(chapters, 'A')).toBe(0);
        expect(cycles.size).toBeGreaterThan(0);
    });

    it('una referència a un codi inexistent queda registrada', () => {
        const desti = partida('IMPER', [vincle('NO_HI_ES')]);
        const { chapters, missing } = resolveMeasurementRefs(arbre(desti));
        expect(quantitat(chapters, 'IMPER')).toBe(0);
        expect([...missing]).toContain('NO_HI_ES');
    });

    it('les cadenes de vincles es resolen', () => {
        const a = partida('A', [linia('x', 'base', 10)]);
        const b = partida('B', [vincle('A', { factor: 2 })]);
        const c = partida('C', [vincle('B', { factor: 3 })]);
        const { chapters } = resolveMeasurementRefs(arbre(a, b, c));
        expect(quantitat(chapters, 'C')).toBe(60);
    });

    it('compta quantes línies apunten a cada codi', () => {
        const origen = partida('SOLERA', [linia('a', 'base', 10)]);
        const { refsPerCode } = resolveMeasurementRefs(arbre(origen, partida('X', [vincle('SOLERA')]), partida('Y', [vincle('SOLERA')])));
        expect(refsPerCode.get('SOLERA')).toBe(2);
    });
});

describe('estructura compartida', () => {
    it('una branca sense vincles es retorna tal qual', () => {
        // Els useMemo que en depenen comparen per identitat: recrear l'arbre sencer els
        // invalidaria a cada render.
        const entrada = arbre(partida('A', [linia('x', 'base', 1)]));
        const { chapters } = resolveMeasurementRefs(entrada);
        expect(chapters).toBe(entrada);
    });
});

describe('isRefLine', () => {
    it('distingeix una línia vinculada d\'una de normal', () => {
        expect(isRefLine({ refCode: 'A' })).toBe(true);
        expect(isRefLine({ units: 1 })).toBe(false);
        expect(isRefLine(null)).toBe(false);
    });
});
