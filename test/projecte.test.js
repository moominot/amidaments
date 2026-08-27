import { describe, it, expect } from 'vitest';
import {
    EXTENSIO_PROJECTE, esFitxerProjecte, esFitxerBC3, ambExtensioProjecte,
    serialitzaProjecte, llegeixProjecte,
} from '../src/utils/projectFile';
import { migrateBudget, SCHEMA_VERSION } from '../src/utils/migrateBudget';
import { safeFileName } from '../src/utils/fileName';
import { calcItemCertifiedQty } from '../src/utils/calculations';

describe('el fitxer natiu', () => {
    it('es desa amb .amid i accepta els .json d\'abans', () => {
        expect(EXTENSIO_PROJECTE).toBe('.amid');
        expect(esFitxerProjecte('obra.amid')).toBe(true);
        expect(esFitxerProjecte('obra.json')).toBe(true);
        expect(esFitxerProjecte('OBRA.AMID')).toBe(true);
        expect(esFitxerProjecte('obra.bc3')).toBe(false);
        expect(esFitxerBC3('obra.BC3')).toBe(true);
    });

    it('no duplica l\'extensió', () => {
        expect(ambExtensioProjecte('obra')).toBe('obra.amid');
        expect(ambExtensioProjecte('obra.amid')).toBe('obra.amid');
        expect(ambExtensioProjecte('obra.json')).toBe('obra.json');
    });

    it('va i torna sense perdre res', () => {
        const budget = { id: '1', name: 'Obra', chapters: [{ id: 'c', code: 'C1' }], certifications: [] };
        const prices = { P1: { code: 'P1', price: 10 } };
        const llegit = llegeixProjecte(serialitzaProjecte(budget, prices));
        expect(llegit.budget).toEqual(budget);
        expect(llegit.priceDatabase).toEqual(prices);
    });

    it('accepta un projecte sense base de preus pròpia', () => {
        // Exigir-la descartava fitxers perfectament vàlids: §27.
        const llegit = llegeixProjecte(JSON.stringify({ budget: { chapters: [] } }));
        expect(llegit).not.toBeNull();
        expect(llegit.priceDatabase).toEqual({});
    });

    it('retorna null quan no és un projecte nostre, en comptes de callar', () => {
        expect(llegeixProjecte('{}')).toBeNull();
        expect(llegeixProjecte('no és json')).toBeNull();
        expect(llegeixProjecte(JSON.stringify({ hola: 1 }))).toBeNull();
        expect(llegeixProjecte(JSON.stringify({ budget: 'text' }))).toBeNull();
    });
});

describe('safeFileName', () => {
    it('translitera els accents en comptes d\'esborrar-los', () => {
        // Chromium descarta l'atribut `download` sencer si porta caràcters no ASCII: §11.
        expect(safeFileName("Reforma d'habitatge a Sóller")).toBe("Reforma d'habitatge a Soller");
        expect(safeFileName('Certificació nº2')).toMatch(/^Certificacio n/);
    });

    it('conserva el # de la convenció de nom de les certificacions', () => {
        expect(safeFileName('Obra#certification 0001')).toBe('Obra#certification 0001');
    });

    it('treu els caràcters que no valen en un nom de fitxer', () => {
        expect(safeFileName('a/b:c*d?e"f<g>h|i')).toBe('abcdefghi');
    });

    it('cau al valor per defecte quan no en queda res', () => {
        expect(safeFileName('', 'projecte')).toBe('projecte');
        expect(safeFileName('※※', 'projecte')).toBe('projecte');
    });
});

describe('migració de l\'esquema', () => {
    const fases = [
        { id: 'f1', name: 'Primera', method: 'partial' },
        { id: 'f2', name: 'Segona', method: 'partial' },
    ];

    it('converteix les fases parcials en acumulat a origen', () => {
        // §22: el valor desat sempre ha de ser l'acumulat. 30 i 40 per període són 30 i 70.
        const budget = {
            certifications: fases,
            chapters: [{
                id: 'p', code: 'P1', unit: 'm2',
                certifications: { f1: { quantity: 30, measurements: [] }, f2: { quantity: 40, measurements: [] } },
            }],
        };
        const { budget: migrat, migrat: haCanviat } = migrateBudget(budget);
        expect(haCanviat).toBe(true);
        const p = migrat.chapters[0];
        expect(calcItemCertifiedQty(p, 'f1')).toBe(30);
        expect(calcItemCertifiedQty(p, 'f2')).toBe(70);
    });

    it('conserva el detall d\'amidament afegint-hi l\'anterior al davant', () => {
        const budget = {
            certifications: fases,
            chapters: [{
                id: 'p', code: 'P1', unit: 'm2',
                certifications: {
                    f1: { quantity: 30, measurements: [] },
                    f2: { quantity: 0, measurements: [{ id: 'a', description: 'planta', units: 40, length: 1, width: 1, height: 1 }] },
                },
            }],
        };
        const { budget: migrat } = migrateBudget(budget);
        const f2 = migrat.chapters[0].certifications.f2;
        expect(f2.measurements).toHaveLength(2);
        expect(f2.measurements[0].description).toMatch(/anterior/i);
        expect(calcItemCertifiedQty(migrat.chapters[0], 'f2')).toBe(70);
    });

    it('és idempotent: no torna a migrar el que ja ho està', () => {
        const budget = { schemaVersion: SCHEMA_VERSION, certifications: fases, chapters: [] };
        expect(migrateBudget(budget).migrat).toBe(false);
    });

    it('no toca les fases que ja eren a origen', () => {
        const budget = {
            certifications: [{ id: 'f1', method: 'origin' }, { id: 'f2', method: 'origin' }],
            chapters: [{ id: 'p', code: 'P1', unit: 'm2', certifications: { f1: { quantity: 30 }, f2: { quantity: 70 } } }],
        };
        const { budget: migrat } = migrateBudget(budget);
        expect(calcItemCertifiedQty(migrat.chapters[0], 'f2')).toBe(70);
    });
});
