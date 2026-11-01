import { describe, it, expect } from 'vitest';
import {
    documentDeProjecte, llegeixDocument, parametresADemanar, instancia, previsualitza,
    filtraPerInstancia, extreuInstancia, treuInstancia, nomInstanciaLliure, FORMAT_SISTEMA,
} from '../src/utils/sistemesDoc';
import { llistaSistemes, llegeixSistema } from '../src/utils/galeriaSistemes';
import { resolveFormules } from '../src/utils/parametres';
import { resolveMeasurementRefs } from '../src/utils/measurementRefs';
import { calcItemTotalQty, calcChapterTotal, getItemUnitPrice, normalizeCode } from '../src/utils/calculations';
import { generateBC3 } from '../src/utils/bc3Writer';
import { processBC3Data } from '../src/utils/bc3Parser';
import piscinaJson from '../src/utils/sistemes/piscina.sistema.json';

/**
 * Sistemes constructius com a documents amb paràmetres.
 *
 * Les quantitats de la piscina estan fetes a mà a partir de les regles de les fórmules, amb
 * els valors per defecte: L 8, A 1,78, P 1,30–1,44, mur 0,25, neteja 0,10, vol 0,20, suport de
 * tubs 1,20. Són les mateixes que donava el generador anterior, escrit en JavaScript.
 */

const partides = (nodes, out = {}) => {
    nodes.forEach(n => {
        if (n.unit) { out[normalizeCode(n.code)] = n; return; }
        partides([...(n.subChapters || []), ...(n.items || [])], out);
    });
    return out;
};
const resol = (chapters, parametres) => resolveMeasurementRefs(resolveFormules(chapters, parametres).chapters).chapters;
const quantitats = (chapters) => Object.fromEntries(Object.entries(partides(chapters)).map(([c, n]) => [c, calcItemTotalQty(n)]));
const total = (chapters, preus) => Math.round(chapters.reduce((a, c) => a + calcChapterTotal(c, preus), 0) * 100) / 100;

const PISCINA = llegeixDocument(piscinaJson);

describe('la piscina com a document', () => {
    const q = quantitats(resol(PISCINA.chapters, PISCINA.parametres));

    it('és a la galeria com a sistema integrat', () => {
        expect(llistaSistemes()[0]).toMatchObject({ id: 'integrat:piscina', nom: 'Piscina', integrat: true, nParametres: 15 });
        expect(llegeixSistema('integrat:piscina').chapters[0].code).toBe('PISC');
    });

    it('amida l\'estructura pels exteriors i per l\'eix', () => {
        expect(q['RF22.01.01']).toBe(21.58);           // (8 + 0,5 + 0,2) × (1,78 + 0,5 + 0,2)
        expect(q['RF22.01.02']).toBe(19.38);           // 8,5 × 2,28
        expect(q['RF22.01.03']).toBe(28.17);           // 2 × 8,25 × 1,37 + 2,03 × 1,30 + 2,03 × 1,44
    });

    it('amida les parets amb la fondària mitjana i el fons inclinat', () => {
        expect(q['RF22.01.06']).toBe(26.79);           // 2 × 8 × 1,37 + 1,78 × 1,30 + 1,78 × 1,44
        expect(q['RF22.01.07']).toBe(41.03);           // + √(8² + 0,14²) × 1,78
        expect(q['RF22.01.09']).toBe(41.03);
    });

    it('reparteix el coronament i amida el suport de tubs i els equips', () => {
        expect(q['RF22.01.10']).toBe(8.4);
        expect(q['RF22.01.11']).toBe(12.76);           // 8,4 + 2 × 2,18
        expect(q['RF22.01.05']).toBe(12.94);           // 8,5 × 1,2 + 2,28 × 1,2
        expect(q['RF22.02.02']).toBe(2);
    });

    it('suma el mateix total que el generador anterior', () => {
        expect(total(resol(PISCINA.chapters, PISCINA.parametres), PISCINA.prices)).toBe(16362.97);
    });

    it('cada partida val el preu del seu concepte', () => {
        Object.values(partides(PISCINA.chapters)).forEach(p => {
            expect(Math.abs(getItemUnitPrice(p, PISCINA.prices) - p.price), p.code).toBeLessThanOrEqual(0.01);
        });
    });
});

describe('crear un sistema d\'un projecte', () => {
    const budget = {
        name: 'Envà',
        parametres: [{ id: 'p1', nom: 'H', valor: 3, unitat: 'm', sistema: 'x', nomOriginal: 'H' }],
        chapters: [{
            id: 'c', code: 'E', description: 'ENVANS', subChapters: [], items: [{
                id: 'i', code: 'ENV', unit: 'm2', breakdown: [{ code: 'mo1', yield: 1 }],
                certifications: { f1: { quantity: 3 } },
                measurements: [{ id: 'l', description: 'Envà', units: 1, length: 4, height: 0, formules: { height: 'H' }, calc: { height: 3 }, sistema: 'x' }],
            }],
        }],
    };
    const preus = { ENV: { price: 30 }, mo1: { price: 20 }, ALTRE: { price: 1 }, E: { price: 0 } };

    it('porta l\'arbre amb les fórmules, els paràmetres i només els preus que fa servir', () => {
        const doc = documentDeProjecte(budget, preus, { descripcio: 'De prova' });
        expect(doc).toMatchObject({ format: FORMAT_SISTEMA, nom: 'Envà', descripcio: 'De prova' });
        const linia = doc.chapters[0].items[0].measurements[0];
        expect(linia.formules).toEqual({ height: 'H' });
        expect(linia.calc).toBeUndefined();
        expect(linia.sistema).toBeUndefined();
        expect(doc.chapters[0].items[0].certifications).toBeUndefined();
        expect(doc.parametres[0].sistema).toBeUndefined();
        expect(Object.keys(doc.prices).sort()).toEqual(['E', 'ENV', 'mo1']);
    });

    it('llegeix tant un document de sistema com un fitxer de projecte', () => {
        expect(llegeixDocument({ budget, priceDatabase: preus }).nom).toBe('Envà');
        expect(llegeixDocument(documentDeProjecte(budget, preus)).chapters).toHaveLength(1);
        expect(llegeixDocument({ format: FORMAT_SISTEMA })).toBeNull();
        expect(llegeixDocument({ res: 1 })).toBeNull();
        expect(llegeixDocument(null)).toBeNull();
    });
});

describe('inserir un sistema', () => {
    const projecte = [{ id: 'q1', nom: 'L', valor: 30 }, { id: 'q2', nom: 'H', valor: 3 }];

    it('demana els paràmetres que no són fórmula i diu quins ja hi són', () => {
        const d = parametresADemanar(PISCINA, projecte);
        expect(d.filter(p => !p.derivat)).toHaveLength(15);
        expect(d.find(p => p.nom === 'Pm').derivat).toBe(true);
        expect(d.find(p => p.nom === 'L').existent.valor).toBe(30);
        expect(d.find(p => p.nom === 'A').existent).toBeNull();
    });

    it('reanomena els que xoquen, els agrupa per instància i reescriu les fórmules', () => {
        const r = instancia(PISCINA, { nomInstancia: 'Piscina jardí', parametresProjecte: projecte, id: 'I1' });
        const L = r.parametres.find(p => p.nomOriginal === 'L');
        expect(L).toMatchObject({ nom: 'L_2', grup: 'Piscina jardí · Vas (interior)', sistema: 'I1' });
        expect(r.parametres.find(p => p.nom === 'Lf').formula).toBe('arrel(L_2^2+(P2-P1)^2)');
        const llosa = partides(r.chapters)['RF22.01.02'].measurements[0];
        expect(llosa.formules.length).toBe('L_2+2*e');
        expect(llosa.sistema).toBe('I1');
        expect(r.instancia).toEqual({ id: 'I1', nom: 'Piscina jardí', sistema: 'Piscina' });
    });

    it('pot fer servir el paràmetre del projecte amb el mateix nom', () => {
        const r = instancia(PISCINA, { parametresProjecte: projecte, respostes: new Map([['L', { enllaca: true }]]) });
        expect(r.parametres.find(p => p.nomOriginal === 'L')).toBeUndefined();
        expect(partides(r.chapters)['RF22.01.02'].measurements[0].formules.length).toBe('L+2*e');
        const q = quantitats(resol(r.chapters, [...projecte, ...r.parametres]));
        expect(q['RF22.01.02']).toBe(Math.round(30.5 * 2.28 * 100) / 100);
    });

    it('les respostes poden ser valors o fórmules sobre el projecte, sense reanomenar-les', () => {
        const r = instancia(PISCINA, {
            parametresProjecte: projecte,
            respostes: new Map([['A', { valor: 4 }], ['P2', { formula: 'H/2' }], ['L', { valor: 10 }]]),
        });
        expect(r.parametres.find(p => p.nom === 'A').valor).toBe(4);
        expect(r.parametres.find(p => p.nom === 'P2').formula).toBe('H/2');
        expect(r.parametres.find(p => p.nom === 'L_2').valor).toBe(10);
        const q = quantitats(resol(r.chapters, [...projecte, ...r.parametres]));
        expect(q['RF22.01.02']).toBe(Math.round(10.5 * 4.5 * 100) / 100);
    });

    it('dona ids nous i manté els vincles a línies dins del sistema', () => {
        const doc = {
            ...PISCINA,
            chapters: [{
                id: 'c', code: 'X', subChapters: [], items: [
                    { id: 'a', code: 'A1', unit: 'm2', measurements: [{ id: 'la', description: 'a', units: 2, length: 3 }] },
                    { id: 'b', code: 'B1', unit: 'm2', measurements: [{ id: 'lb', refCode: 'A1', refLineId: 'la', factor: 1 }] },
                ],
            }],
        };
        const r = instancia(doc);
        const [a, b] = r.chapters[0].items;
        expect(a.id).not.toBe('a');
        expect(a.measurements[0].id).not.toBe('la');
        expect(b.measurements[0].refLineId).toBe(a.measurements[0].id);
        expect(calcItemTotalQty(resol(r.chapters, r.parametres)[0].items[1])).toBe(6);
    });

    it('previsualitza el total amb els preus del projecte per davant', () => {
        expect(Math.round(previsualitza(PISCINA).total * 100) / 100).toBe(16362.97);
        // El mur no té descomposat: val el preu del concepte, i el del projecte mana.
        const amb = previsualitza(PISCINA, {}, { 'RF22.01.03': { price: 0 } });
        expect(Math.round(amb.total * 100) / 100).toBe(Math.round((16362.97 - 2573.33) * 100) / 100);
    });

    it('no repeteix el nom de la instància', () => {
        expect(nomInstanciaLliure('Piscina', [])).toBe('Piscina');
        expect(nomInstanciaLliure('Piscina', [{ nom: 'Piscina' }, { nom: 'Piscina 2' }])).toBe('Piscina 3');
    });
});

describe('instàncies dins del projecte', () => {
    // Un projecte amb una partida pròpia i una piscina inserida, amb una de les seves línies
    // afegida a una partida que ja hi era.
    const muntaProjecte = () => {
        const inst = instancia(PISCINA, { nomInstancia: 'Piscina', parametresProjecte: [{ id: 'q', nom: 'L', valor: 30 }], id: 'I1' });
        const perCodi = partides(inst.chapters);
        const liniaAfegida = perCodi['RF22.02.02'].measurements[0];
        return {
            budget: {
                parametres: [{ id: 'q', nom: 'L', valor: 30, grup: '' }, ...inst.parametres],
                sistemes: [inst.instancia],
                chapters: [
                    { id: 'c0', code: '01', description: 'PROPI', subChapters: [], items: [
                        { id: 'f', code: 'RF22.02.02', unit: 'u', measurements: [{ id: 'mine', description: 'meu', units: 1 }, liniaAfegida] },
                        { id: 'g', code: 'G', unit: 'u', measurements: [{ id: 'g1', units: 3 }] },
                    ] },
                    inst.chapters[0],
                ],
            },
            prices: inst.prices,
        };
    };

    it('filtra només el que ve de la instància', () => {
        const { budget } = muntaProjecte();
        const f = filtraPerInstancia(budget.chapters, 'I1');
        expect(f.map(c => c.code)).toEqual(['01', 'PISC']);
        expect(f[0].items.map(i => i.code)).toEqual(['RF22.02.02']);
        expect(f[0].items[0].measurements).toHaveLength(1);
    });

    it('torna a fer el sistema amb els noms originals i els paràmetres externs', () => {
        const { budget, prices } = muntaProjecte();
        const doc = extreuInstancia(budget, prices, 'I1');
        expect(doc.nom).toBe('Piscina');
        const L = doc.parametres.find(p => p.nom === 'L');
        expect(L).toBeTruthy();
        expect(doc.parametres.some(p => p.nom === 'L_2')).toBe(false);
        expect(doc.parametres.find(p => p.nom === 'A').grup).toBe('Vas (interior)');
        expect(partides(doc.chapters)['RF22.01.02'].measurements[0].formules.length).toBe('L+2*e');
        expect(partides(doc.chapters)['RF22.01.02'].measurements[0].sistema).toBeUndefined();
    });

    it('extreure i tornar a inserir dona les mateixes quantitats', () => {
        const { budget, prices } = muntaProjecte();
        const abans = quantitats(resol(filtraPerInstancia(budget.chapters, 'I1'), budget.parametres));
        const doc = extreuInstancia(budget, prices, 'I1');
        const r = instancia(doc);
        expect(quantitats(resol(r.chapters, r.parametres))).toEqual(abans);
    });

    it('treure-la deixa el que ja hi era', () => {
        const { budget } = muntaProjecte();
        const r = treuInstancia(budget, 'I1');
        expect(r.chapters.map(c => c.code)).toEqual(['01', 'PISC']);
        expect(r.chapters[0].items.map(i => i.code)).toEqual(['RF22.02.02', 'G']);
        expect(r.chapters[0].items[0].measurements.map(m => m.id)).toEqual(['mine']);
        expect(partides(r.chapters[1].subChapters)).toEqual({});
        expect(r.parametres.map(p => p.nom)).toEqual(['L']);
        expect(r.sistemes).toEqual([]);
    });
});

describe('exportació BC3 d\'un projecte amb fórmules', () => {
    it('escriu els números calculats i el cicle conserva el total', () => {
        const chapters = resol(PISCINA.chapters, PISCINA.parametres);
        let ch = chapters;
        let preus = PISCINA.prices;
        for (let i = 0; i < 3; i++) {
            const r = processBC3Data(generateBC3({ budget: { name: 'P', chapters: ch }, chapters: ch, priceDatabase: preus }));
            ch = r.chapters;
            preus = r.prices;
            expect(total(ch, preus)).toBe(16362.97);
            expect(quantitats(ch)).toEqual(quantitats(chapters));
        }
    });

    it('una dimensió que dona 0 no torna com a 1 en reimportar', () => {
        const params = PISCINA.parametres.map(p => (p.nom === 'tCurts' ? { ...p, valor: 0 } : p.nom === 'nAmple' ? { ...p, valor: 2 } : p));
        const chapters = resol(PISCINA.chapters, params);
        const r = processBC3Data(generateBC3({ budget: { name: 'P', chapters }, chapters, priceDatabase: PISCINA.prices }));
        expect(quantitats(r.chapters)['RF22.01.11']).toBe(4.36);   // només els costats curts
        expect(quantitats(r.chapters)['RF22.01.05']).toBe(10.2);   // sense costats curts
    });
});
