import { describe, it, expect } from 'vitest';
import {
    round2, normalizeCode, calcItemTotalQty, getItemUnitPrice,
    calcItemCertifiedQty, calcItemTotalAmount,
} from '../src/utils/calculations';

/**
 * Les funcions que han estat l'origen de més defectes al projecte. Cada `it` d'aquí fixa un
 * comportament que es va trencar de veritat alguna vegada; la referència al § és la del
 * registre de `docs/estat-actual.md`.
 */

const linia = (units, length = 1, width = 1, height = 1, extra = {}) =>
    ({ id: Math.random().toString(), description: '', units, length, width, height, ...extra });

describe('round2', () => {
    it('arrodoneix a dos decimals', () => {
        expect(round2(1.005)).toBe(1.01);
        expect(round2(2.344)).toBe(2.34);
        expect(round2(2.345)).toBe(2.35);
    });

    it('tracta els no-números com a zero en comptes de propagar NaN', () => {
        expect(round2(undefined)).toBe(0);
        expect(round2(null)).toBe(0);
        expect(round2('hola')).toBe(0);
    });
});

describe('normalizeCode', () => {
    it('treu els espais i els coixinets finals', () => {
        expect(normalizeCode('  RE02.08#  ')).toBe('RE02.08');
        expect(normalizeCode('EHS010##')).toBe('EHS010');
    });

    it('deixa buit el concepte arrel, que és «##»', () => {
        // Això és el que va fer perdre el `~D` de l'arrel: veure §26.
        expect(normalizeCode('##')).toBe('');
    });
});

describe('calcItemTotalQty', () => {
    it('multiplica unitats per les tres dimensions', () => {
        expect(calcItemTotalQty({ measurements: [linia(2, 3, 4, 5)] })).toBe(120);
    });

    it('arrodoneix cada línia abans de sumar, com fa Presto', () => {
        // Tres línies de 0,333. Arrodonint només al final: 0,999 → 1,00. Arrodonint cada
        // línia, que és el que fa Presto i el que vol aquest projecte: 0,33×3 → 0,99.
        // Si algú treu el `round2` intermedi «per netedat», aquest test salta.
        const item = { measurements: [linia(0.333), linia(0.333), linia(0.333)] };
        expect(calcItemTotalQty(item)).toBe(0.99);
        expect(round2(0.333 * 3)).toBe(1);
    });

    it('aplica les línies de percentatge sobre el subtotal de les normals', () => {
        const item = { measurements: [linia(100), linia(10, 1, 1, 1, { isIncrement: true })] };
        expect(calcItemTotalQty(item)).toBe(110);
    });

    it('sense línies val zero, no NaN', () => {
        expect(calcItemTotalQty({})).toBe(0);
        expect(calcItemTotalQty({ measurements: [] })).toBe(0);
    });
});

describe('getItemUnitPrice', () => {
    const item = {
        code: 'P1',
        price: 999,
        breakdown: [
            { code: 'mt01', description: 'material', unit: 'kg', yield: 2, price: 10 },
            { code: 'mo01', description: 'peó', unit: 'h', yield: 1, price: 20 },
        ],
    };

    it('el preu del descomposat surt de la base de preus, no de la línia', () => {
        // §1, §6 i §9: passar `priceDatabase` no és opcional. Sense ella cau a `line.price`
        // i els imports deixen de quadrar amb el PEM del capçal.
        expect(getItemUnitPrice(item, {})).toBe(40);              // 2×10 + 1×20
        expect(getItemUnitPrice(item, { mt01: { price: 30 } })).toBe(80); // 2×30 + 1×20
    });

    it('sense descomposat mana la base de preus per sobre de node.price', () => {
        const solt = { code: 'P2', price: 100 };
        expect(getItemUnitPrice(solt, {})).toBe(100);
        expect(getItemUnitPrice(solt, { P2: { price: 55 } })).toBe(55);
    });

    it('les línies de percentatge s\'apliquen sobre el subtotal de la resta', () => {
        const amb = {
            code: 'P3',
            breakdown: [
                { code: 'mt01', unit: 'kg', yield: 2, price: 10 },
                { code: '%', unit: '%', yield: 3, price: 0 },
            ],
        };
        expect(getItemUnitPrice(amb, {})).toBe(20.6); // 20 + 3% de 20
    });
});

describe('calcItemCertifiedQty', () => {
    const certId = 'c1';

    it('el valor desat sempre és l\'acumulat a origen, sigui quin sigui el mètode', () => {
        // §22: abans el significat depenia del `method` de la fase i commutar-lo movia els
        // imports sense avisar. Ara la funció ni tan sols el mira.
        const item = { certifications: { [certId]: { quantity: 40, measurements: [] } } };
        expect(calcItemCertifiedQty(item, certId)).toBe(40);
    });

    it('amb detall d\'amidament, suma les línies', () => {
        const item = {
            certifications: { [certId]: { quantity: 0, measurements: [linia(10), linia(5, 2)] } },
        };
        expect(calcItemCertifiedQty(item, certId)).toBe(20);
    });

    it('sense dades de la fase val zero', () => {
        expect(calcItemCertifiedQty({}, certId)).toBe(0);
        expect(calcItemCertifiedQty({ certifications: {} }, certId)).toBe(0);
        expect(calcItemCertifiedQty({ certifications: { altra: { quantity: 9 } } }, certId)).toBe(0);
    });
});

describe('calcItemTotalAmount', () => {
    it('és amidament × preu unitari, amb la base de preus manant', () => {
        const item = {
            code: 'P1', price: 10,
            measurements: [linia(3)],
        };
        expect(calcItemTotalAmount(item, {})).toBe(30);
        expect(calcItemTotalAmount(item, { P1: { price: 20 } })).toBe(60);
    });
});
