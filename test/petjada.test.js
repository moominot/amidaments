import { describe, it, expect } from 'vitest';
import { processBC3Data } from '../src/utils/bc3Parser';
import { generateBC3 } from '../src/utils/bc3Writer';
import { buildCarbonSummary, calcItemCarbon, formatEnergia, formatCO2 } from '../src/utils/carbon';
import { llegeixBC3, FITXERS, partida, amidament } from './ajuda';

/**
 * Petjada de carboni: les propietats `ce` i `eCO2` del `~X`.
 *
 * Van a `priceDatabase` i no al node, perquè són propietats del concepte com el preu. Els
 * tests d'aquí fixen tant el lloc on es desen com el càlcul.
 */

describe('lectura del ~X', () => {
    it('desa el cost energètic i les emissions a la base de preus', () => {
        const r = processBC3Data(llegeixBC3(FITXERS.pilar));
        expect(r.prices.mt10haf010ctms.energy).toBe(1876);
        expect(r.prices.mt10haf010ctms.co2).toBe(234.5);
        expect(r.prices.mt07aco010c.energy).toBe(12.72);
    });

    it('no inventa cap valor quan el concepte no en declara', () => {
        // Un zero voldria dir «zero MJ», que no és el mateix que «no se'n sap res».
        const r = processBC3Data(llegeixBC3(FITXERS.pilar));
        expect(r.prices.mo044?.energy).toBeUndefined();
        expect(r.prices.mo044?.co2).toBeUndefined();
    });

    it('una partida de demolició declara les propietats però no les omple', () => {
        const r = processBC3Data(llegeixBC3(FITXERS.demolicio));
        const amb = Object.values(r.prices).filter(p => p.energy !== undefined);
        expect(amb).toHaveLength(0);
    });
});

describe('càlcul', () => {
    const r = processBC3Data(llegeixBC3(FITXERS.pilar));
    const p = partida(r.chapters, 'EHS010');

    it('dona 3,86 GJ i 337,04 kg per m³ de pilar', () => {
        const u = calcItemCarbon(p, r.prices);
        expect(u.energy).toBeCloseTo(3857.6, 0);
        expect(u.co2).toBeCloseTo(337.04, 1);
    });

    it('el formigó s\'endú tres quartes parts de les emissions', () => {
        const s = buildCarbonSummary(r.chapters, r.prices);
        expect(s.perMaterial[0].code).toBe('mt10haf010ctms');
        expect(s.perMaterial[0].co2).toBeCloseTo(246.23, 1);
        expect(s.perMaterial[0].co2 / s.totals.co2).toBeGreaterThan(0.7);
    });

    it('la mà d\'obra i les línies de percentatge no incorporen res', () => {
        const nomesMaObra = { ...p, breakdown: p.breakdown.filter(l => l.code.startsWith('mo') || l.code === '%') };
        const u = calcItemCarbon(nomesMaObra, r.prices);
        expect(u.energy).toBe(0);
        expect(u.co2).toBe(0);
    });

    it('multiplica per l\'amidament', () => {
        const dotze = processBC3Data(llegeixBC3(FITXERS.pilar));
        amidament(partida(dotze.chapters, 'EHS010'), 12);
        const s = buildCarbonSummary(dotze.chapters, dotze.prices);
        expect(s.totals.co2).toBeCloseTo(337.04 * 12, 0);
    });

    it('sense base de preus no s\'inventa res', () => {
        const s = buildCarbonSummary(r.chapters, {});
        expect(s.totals.co2).toBe(0);
        expect(s.ambDades).toBe(0);
    });
});

describe('estats del resum', () => {
    it('distingeix «sense dades» de «amidament a zero»', () => {
        const r = processBC3Data(llegeixBC3(FITXERS.pilar));
        partida(r.chapters, 'EHS010').measurements = [];
        const s = buildCarbonSummary(r.chapters, r.prices);
        expect(s.ambDades).toBe(1);
        expect(s.ambAportacio).toBe(0);
        expect(s.senseAmidament).toHaveLength(1);
    });

    it('no baixa als components del descomposat', () => {
        const r = processBC3Data(llegeixBC3(FITXERS.pilar));
        const s = buildCarbonSummary(r.chapters, r.prices);
        expect(s.ambDades + s.sense).toBe(1);
    });
});

describe('cicle exportar → reimportar', () => {
    it('conserva la petjada tres vegades seguides', () => {
        let r = processBC3Data(llegeixBC3(FITXERS.pilar));
        for (let volta = 1; volta <= 3; volta++) {
            r = processBC3Data(generateBC3({
                budget: { name: 'X', chapters: r.chapters }, chapters: r.chapters, priceDatabase: r.prices,
            }));
            const s = buildCarbonSummary(r.chapters, r.prices);
            expect(s.totals.co2, `CO₂ a la volta ${volta}`).toBeCloseTo(337.04, 1);
            expect(s.totals.energy, `energia a la volta ${volta}`).toBeCloseTo(3857.6, 0);
        }
    });

    it('un concepte amb petjada i residu escriu les cinc propietats al mateix ~X', () => {
        const r = processBC3Data(llegeixBC3(FITXERS.pilar));
        const bc3 = generateBC3({ budget: { name: 'X', chapters: r.chapters }, chapters: r.chapters, priceDatabase: r.prices });
        const x = bc3.split('\n').find(l => l.startsWith('~X|mt10haf010ctms|'));
        expect(x).toContain('ce\\');
        expect(x).toContain('eCO2\\');
        expect(x).toContain('ler\\');
        expect(x).toContain('m\\');
        expect(x).toContain('v\\');
    });

    it('la capçalera del ~X declara què vol dir cada propietat', () => {
        const r = processBC3Data(llegeixBC3(FITXERS.pilar));
        const bc3 = generateBC3({ budget: { name: 'X', chapters: r.chapters }, chapters: r.chapters, priceDatabase: r.prices });
        const capcalera = bc3.split('\n').find(l => l.startsWith('~X||'));
        expect(capcalera).toContain('ce\\Cost energètic\\MJ');
        expect(capcalera).toContain('eCO2\\Emissió de CO2\\kg');
    });
});

describe('presentació', () => {
    it('passa a GJ i a tones a partir del miler', () => {
        expect(formatEnergia(999)).toMatch(/MJ$/);
        expect(formatEnergia(1000)).toMatch(/GJ$/);
        expect(formatCO2(999)).toMatch(/kg$/);
        expect(formatCO2(1000)).toMatch(/t$/);
    });
});
