import { describe, it, expect } from 'vitest';
import { processBC3Data } from '../src/utils/bc3Parser';
import { generateBC3 } from '../src/utils/bc3Writer';
import { buildWasteSummary, magnitudsDe, catalegResidus, nomTipus, formatMassa } from '../src/utils/waste';
import { buildWasteStudy, tarifesBuides, fraccioDe, FRACCIONS_RD105 } from '../src/utils/wasteStudy';
import { llegeixBC3, FITXERS, partida, amidament } from './ajuda';

/**
 * Residus: les dues menes que declara el `~R` i el que se'n deriva.
 *
 * Les xifres es van contrastar a mà contra els fitxers abans d'escriure el codi, aplicant les
 * fórmules de l'apartat «Compound-element waste» de la norma.
 */

const totals = (node) => (node.waste || []).reduce((acc, w) => {
    const m = magnitudsDe(w);
    return { mass: acc.mass + m.mass, volume: acc.volume + m.volume };
}, { mass: 0, volume: 0 });

describe('demolició: components addicionals', () => {
    const r = processBC3Data(llegeixBC3(FITXERS.demolicio));
    const p = partida(r.chapters, 'DCE010');

    it('llegeix els setze components amb el seu codi LER', () => {
        expect(p.waste).toHaveLength(16);
        expect(p.waste.every(w => w.origin === 'direct')).toBe(true);
        expect(p.waste.find(w => w.code === 'ruo170101').ler).toBe('17 01 01');
    });

    it('dona 62.722 kg i 45,78 m³ per unitat', () => {
        const t = totals(p);
        expect(t.mass).toBeCloseTo(62722, 0);
        expect(t.volume).toBeCloseTo(45.78, 2);
    });

    it('la densitat implícita del formigó de runa és la que toca', () => {
        const formigo = p.waste.find(w => w.ler === '17 01 01');
        expect(1 / formigo.volumePerUnit).toBeCloseTo(1500, -2);
    });

    it('conserva els components declarats amb quantitat zero', () => {
        // Guardant la massa ja multiplicada es perdrien, i l'exportació no podria refer el ~X.
        expect(p.waste.filter(w => w.quantity === 0).length).toBeGreaterThan(0);
    });
});

describe('construcció: col·locació i embalatge', () => {
    const r = processBC3Data(llegeixBC3(FITXERS.pilar));
    const p = partida(r.chapters, 'EHS010');

    it('llegeix el residu de col·locació com a rendiment × factor', () => {
        // §31. L'acer va a 120 kg/m³ al descomposat i el ~R en declara un factor de 0,0075.
        const acer = p.waste.find(w => w.code === 'mt07aco010c');
        expect(acer.origin).toBe('placement');
        expect(acer.wasteFactor).toBeCloseTo(0.0075, 6);
        expect(acer.quantity).toBeCloseTo(0.9, 5);
    });

    it('llegeix l\'embalatge que penja del material, no de la partida', () => {
        // 0,072 kg de cartró per separador × 12 separadors/m³.
        const cartro = p.waste.filter(w => w.origin === 'packaging' && w.ler === '15 01 01');
        expect(cartro.length).toBeGreaterThan(0);
        expect(cartro.some(w => Math.abs(w.quantity - 0.864) < 1e-6)).toBe(true);
        expect(cartro[0].via).toBeTruthy();
    });

    it('dona 19,99 kg i 0,0152 m³ per m³', () => {
        const t = totals(p);
        expect(t.mass).toBeCloseTo(19.992, 2);
        expect(t.volume).toBeCloseTo(0.01519, 4);
    });

    it('reparteix entre col·locació i embalatge', () => {
        const s = buildWasteSummary(r.chapters);
        const perTipus = Object.fromEntries(s.perTipus.map(t => [t.nom, t.mass]));
        expect(perTipus['Col·locació']).toBeCloseTo(18.54, 1);
        expect(perTipus['Embalatge']).toBeCloseTo(1.45, 1);
    });
});

describe('agregació', () => {
    it('multiplica per l\'amidament de la partida', () => {
        const r = processBC3Data(llegeixBC3(FITXERS.demolicio));
        amidament(partida(r.chapters, 'DCE010'), 3);
        const s = buildWasteSummary(r.chapters);
        expect(s.totals.mass).toBeCloseTo(62722 * 3, 0);
    });

    it('no compta els materials com si fossin partides', () => {
        // §31: baixant als fills d'una partida sortia «9 de 15» quan només n'hi havia una.
        const r = processBC3Data(llegeixBC3(FITXERS.pilar));
        const s = buildWasteSummary(r.chapters);
        expect(s.ambDades).toBe(1);
        expect(s.ambAportacio).toBe(1);
        expect(s.sense).toBe(0);
    });

    it('distingeix «sense dades» de «amidament a zero»', () => {
        // §30: tots dos donen zero però volen dir coses diferents.
        const r = processBC3Data(llegeixBC3(FITXERS.demolicio));
        const p = partida(r.chapters, 'DCE010');
        p.measurements = [];
        const s = buildWasteSummary(r.chapters);
        expect(s.ambDades).toBe(1);
        expect(s.ambAportacio).toBe(0);
        expect(s.senseAmidament).toHaveLength(1);
        expect(s.sense).toBe(0);

        delete p.waste;
        const t = buildWasteSummary(r.chapters);
        expect(t.ambDades).toBe(0);
        expect(t.sense).toBe(1);
    });

    it('agrupa per codi LER i ordena per massa', () => {
        const r = processBC3Data(llegeixBC3(FITXERS.demolicio));
        const s = buildWasteSummary(r.chapters);
        expect(s.perLer).toHaveLength(11); // els de quantitat zero no hi surten
        expect(s.perLer[0].ler).toBe('17 01 01');
        for (let i = 1; i < s.perLer.length; i++) {
            expect(s.perLer[i - 1].mass).toBeGreaterThanOrEqual(s.perLer[i].mass);
        }
    });
});

describe('cicle exportar → reimportar', () => {
    it.each([
        // El resum arrodoneix a dos decimals per fila, de manera que el volum agregat és
        // 45,79 i no els 45,7795 de la suma en cru. És el comportament volgut.
        ['demolició', FITXERS.demolicio, 62722, 45.79],
        ['construcció', FITXERS.pilar, 19.992, 0.01519],
    ])('conserva els residus de %s tres vegades', (_nom, fitxer, massa, volum) => {
        let r = processBC3Data(llegeixBC3(fitxer));
        for (let volta = 1; volta <= 3; volta++) {
            r = processBC3Data(generateBC3({
                budget: { name: 'X', chapters: r.chapters }, chapters: r.chapters, priceDatabase: r.prices,
            }));
            const s = buildWasteSummary(r.chapters);
            expect(s.totals.mass, `massa a la volta ${volta}`).toBeCloseTo(massa, 1);
            expect(s.totals.volume, `volum a la volta ${volta}`).toBeCloseTo(volum, 2);
        }
    });

    it('no duplica l\'embalatge a cada volta', () => {
        // §31: el material també és un node i ja porta el seu ~R; escrivint-lo també a la
        // partida, 19,99 kg passaven a 21,44, a 22,89…
        let r = processBC3Data(llegeixBC3(FITXERS.pilar));
        const primera = buildWasteSummary(r.chapters).totals.mass;
        r = processBC3Data(generateBC3({ budget: { name: 'X', chapters: r.chapters }, chapters: r.chapters, priceDatabase: r.prices }));
        expect(buildWasteSummary(r.chapters).totals.mass).toBeCloseTo(primera, 3);
    });

    it('escriu el residu de col·locació amb el factor, no amb la quantitat', () => {
        const r = processBC3Data(llegeixBC3(FITXERS.pilar));
        const bc3 = generateBC3({ budget: { name: 'X', chapters: r.chapters }, chapters: r.chapters, priceDatabase: r.prices });
        expect(bc3).toMatch(/~R\|[^|]+\|.*0\\mt07aco010c\\wf\\0,0075/);
    });
});

describe('catàleg de components', () => {
    it('es dedueix de les partides importades, sense desar res', () => {
        const r = processBC3Data(llegeixBC3(FITXERS.demolicio));
        const cataleg = catalegResidus(r.chapters);
        expect(cataleg.length).toBe(16);
        const formigo = cataleg.find(c => c.code === 'ruo170101');
        expect(formigo.ler).toBe('17 01 01');
        expect(formigo.massPerUnit).toBe(1);
    });
});

describe('estudi del RD 105/2008', () => {
    it('classifica cada codi LER a la fracció de l\'article 5.5', () => {
        expect(fraccioDe('17 01 01').id).toBe('formigo');
        expect(fraccioDe('17 01 02').id).toBe('ceramic');
        expect(fraccioDe('17 04 07').id).toBe('metall');   // per prefix de família
        expect(fraccioDe('17 02 01').id).toBe('fusta');
        expect(fraccioDe('15 01 01').id).toBe('paper');
    });

    it('les mescles no compten per a cap fracció', () => {
        // Per definició no estan separades: comptar-les faria saltar una obligació que la
        // norma no imposa.
        expect(fraccioDe('17 09 04')).toBeNull();
        expect(fraccioDe('17 05 04')).toBeNull();
    });

    it('els llindars són els vigents, no els originals del reial decret', () => {
        const llindars = Object.fromEntries(FRACCIONS_RD105.map(f => [f.id, f.llindar]));
        expect(llindars).toEqual({
            formigo: 80, ceramic: 40, metall: 2, fusta: 1, vidre: 1, plastic: 0.5, paper: 0.5,
        });
    });

    it('marca la separació obligatòria quan se supera el llindar', () => {
        const r = processBC3Data(llegeixBC3(FITXERS.demolicio));
        amidament(partida(r.chapters, 'DCE010'), 3);
        const e = buildWasteStudy(buildWasteSummary(r.chapters), tarifesBuides());
        const fusta = e.fraccions.find(f => f.id === 'fusta');
        const formigo = e.fraccions.find(f => f.id === 'formigo');
        expect(fusta.tones).toBeCloseTo(9.72, 1);
        expect(fusta.calSeparar).toBe(true);   // 9,72 t > 1 t
        expect(formigo.tones).toBeCloseTo(64.74, 1);
        expect(formigo.calSeparar).toBe(false); // 64,74 t < 80 t
        expect(e.calSepararAlguna).toBe(true);
    });

    it('sense tarifes l\'apartat 7 queda sense valorar', () => {
        const r = processBC3Data(llegeixBC3(FITXERS.demolicio));
        const s = buildWasteSummary(r.chapters);
        expect(buildWasteStudy(s, tarifesBuides()).valorada).toBe(false);
        const amb = buildWasteStudy(s, { ...tarifesBuides(), formigo: 8 });
        expect(amb.valorada).toBe(true);
        expect(amb.fraccions.find(f => f.id === 'formigo').cost).toBeCloseTo(21.58 * 8, 1);
    });
});

describe('presentació', () => {
    it('passa a tones a partir del miler', () => {
        expect(formatMassa(999)).toMatch(/kg$/);
        expect(formatMassa(1000)).toMatch(/t$/);
    });

    it('anomena els tipus de la norma', () => {
        expect(nomTipus('0')).toBe('Col·locació');
        expect(nomTipus('1')).toBe('Demolició');
        expect(nomTipus('3')).toBe('Embalatge');
        expect(nomTipus('9')).toBe('Sense classificar');
    });
});
