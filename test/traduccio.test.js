import { describe, it, expect } from 'vitest';
import { processBC3Data } from '../src/utils/bc3Parser';
import { calcChapterTotal, calcItemTotalQty, normalizeCode, round2 } from '../src/utils/calculations';
import { recullTextos, aplicaTraduccions, parteixEnTrossos, estimaTokens } from '../src/utils/traduccio';
import { llegeixBC3, FITXERS, partides } from './ajuda';

/**
 * Traducció: recollir els textos i tornar-los a posar. La crida a l'API no es prova aquí; en el
 * seu lloc, una «traducció» que posa una marca davant de cada text, per veure que arriba a tots
 * els camps i que no toca res més. Contra el BC3 de referència: el PEM no s'ha de moure.
 */

const pem = (chapters, prices) => round2(chapters.reduce((a, c) => a + calcChapterTotal(c, prices), 0));
const carrega = () => {
    const r = processBC3Data(llegeixBC3(FITXERS.referencia));
    return { budget: { chapters: r.chapters, parametres: [], condicions: [] }, priceDatabase: r.prices };
};
const marca = (textos) => new Map(textos.map(t => [t, `«TR» ${t}`]));

describe('traduir el projecte de referència', () => {
    const estat = carrega();
    const textos = recullTextos(estat);
    const traduit = aplicaTraduccions(estat, marca(textos));

    it('recull textos diferents, sense repetits ni números sols', () => {
        expect(textos.length).toBeGreaterThan(248);
        expect(new Set(textos).size).toBe(textos.length);
        expect(textos.every(t => /\p{L}/u.test(t))).toBe(true);
    });

    it('no mou el PEM, ni els codis, ni les quantitats', () => {
        expect(pem(traduit.budget.chapters, traduit.priceDatabase)).toBe(135202.54);
        const abans = partides(estat.budget.chapters);
        const despres = partides(traduit.budget.chapters);
        expect(despres.map(p => p.code)).toEqual(abans.map(p => p.code));
        expect(despres.map(p => calcItemTotalQty(p))).toEqual(abans.map(p => calcItemTotalQty(p)));
    });

    it('arriba a les descripcions, els textos llargs, el descomposat i la base de preus', () => {
        const ps = partides(traduit.budget.chapters);
        expect(ps.every(p => !p.description || p.description.startsWith('«TR»'))).toBe(true);
        expect(ps.filter(p => p.fullDescription).every(p => p.fullDescription.startsWith('«TR»'))).toBe(true);
        const comp = ps.flatMap(p => p.breakdown || []).filter(b => /\p{L}/u.test(b.description || ''));
        expect(comp.length).toBeGreaterThan(0);
        expect(comp.every(b => b.description.startsWith('«TR»'))).toBe(true);
        // No tots els components tenen entrada a la base de preus: se'n pren un que sí.
        const codi = normalizeCode(comp.find(x => estat.priceDatabase[normalizeCode(x.code)]?.summary).code);
        expect(traduit.priceDatabase[codi].summary.startsWith('«TR»')).toBe(true);
        expect(traduit.priceDatabase[codi].price).toBe(estat.priceDatabase[codi].price);
    });

    it('no toca l\'estat original', () => {
        expect(partides(estat.budget.chapters).some(p => p.description?.startsWith('«TR»'))).toBe(false);
    });
});

describe('traduir una part', () => {
    it('només el subarbre del node, i la base de preus dels seus codis', () => {
        const estat = carrega();
        const cap = estat.budget.chapters[1];
        const textos = recullTextos(estat, { idNode: cap.id });
        const traduit = aplicaTraduccions(estat, marca(textos), { idNode: cap.id });
        expect(traduit.budget.chapters[1].description.startsWith('«TR»')).toBe(true);
        expect(partides([traduit.budget.chapters[1]]).every(p => !p.description || p.description.startsWith('«TR»'))).toBe(true);
        // Un capítol de fora amb un text que no surt al subarbre es queda igual.
        const altre = traduit.budget.chapters[0];
        expect(altre.description).toBe(estat.budget.chapters[0].description);
    });

    it('sense línies d\'amidament, les seves descripcions no es recullen', () => {
        const estat = { budget: { chapters: [{ id: 'c', code: '01', description: 'Capítol', items: [{ id: 'p', code: 'P', unit: 'm2', description: 'Partida', measurements: [{ id: 'l', description: 'Planta baixa' }] }] }] }, priceDatabase: {} };
        expect(recullTextos(estat, { linies: false })).toEqual(['Capítol', 'Partida']);
        expect(recullTextos(estat)).toEqual(['Capítol', 'Partida', 'Planta baixa']);
    });

    it('amb tot el projecte, també paràmetres i condicions', () => {
        const estat = { budget: { chapters: [], parametres: [{ nom: 'L', descripcio: 'Llargària' }], condicions: [{ expressio: 'L>0', missatge: 'Ha de ser positiva' }] }, priceDatabase: {} };
        const t = aplicaTraduccions(estat, marca(recullTextos(estat)));
        expect(t.budget.parametres[0]).toEqual({ nom: 'L', descripcio: '«TR» Llargària' });
        expect(t.budget.condicions[0].missatge).toBe('«TR» Ha de ser positiva');
        expect(t.budget.condicions[0].expressio).toBe('L>0');
    });
});

describe('trossos i estimació', () => {
    it('cap tros passa del límit, tret d\'un text sol més llarg', () => {
        const textos = ['a'.repeat(5000), 'b'.repeat(5000), 'c'.repeat(5000), 'd'.repeat(20000), 'e'];
        const trossos = parteixEnTrossos(textos, 12000);
        expect(trossos.map(t => t.map(x => x.i))).toEqual([[0, 1], [2], [3], [4]]);
    });

    it('l\'estimació creix amb el text', () => {
        expect(estimaTokens(['x'.repeat(3500)]).entrada).toBeGreaterThan(estimaTokens(['x'.repeat(350)]).entrada);
    });
});
