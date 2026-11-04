import { describe, it, expect } from 'vitest';
import {
    documentDeProjecte, llegeixDocument, parametresADemanar, instancia, previsualitza,
    filtraPerInstancia, extreuInstancia, treuInstancia, nomInstanciaLliure, reanomenaInstancia, FORMAT_SISTEMA,
} from '../src/utils/sistemesDoc';
import { llistaSistemes, desaSistema } from '../src/utils/galeriaSistemes';
import { resolveFormules } from '../src/utils/parametres';
import { resolveMeasurementRefs } from '../src/utils/measurementRefs';
import { calcItemTotalQty, calcChapterTotal, getItemUnitPrice, normalizeCode } from '../src/utils/calculations';
import { generateBC3 } from '../src/utils/bc3Writer';
import { processBC3Data } from '../src/utils/bc3Parser';

/**
 * Sistemes constructius com a documents amb paràmetres.
 *
 * El sistema de prova és un mur genèric pensat perquè les xifres es puguin fer a mà i perquè
 * hi surti cada peça del format: paràmetres amb límits, paràmetres que són fórmula d'altres,
 * condicions entre paràmetres, una línia amb Ud de fórmula, una dimensió que pot donar 0, una
 * partida amb descomposat i una de vinculada. Valors per defecte: L 5, H 2,5, e 0,2, 2
 * pilastres, extrems arrebossats i un punt de llum cada 2 m.
 */

const linia = (id, description, camps, formules) => ({
    id, description, units: 0, length: 0, width: 0, height: 0, ...camps, ...(formules ? { formules } : {}),
});
const partida = (id, code, unit, description, price, measurements, breakdown = []) => ({
    id, code, unit, description, fullDescription: description, price, breakdown, measurements, subChapters: [], items: [],
});

const MUR = llegeixDocument({
    format: FORMAT_SISTEMA,
    versio: 1,
    nom: 'Mur de prova',
    descripcio: 'Sistema de prova dels tests',
    parametres: [
        { id: 'pL', nom: 'L', valor: 5, unitat: 'm', grup: 'Mur', descripcio: 'Llargària', min: 0.5 },
        { id: 'pH', nom: 'H', valor: 2.5, unitat: 'm', grup: 'Mur', descripcio: 'Alçada', min: 0.5, max: 4 },
        { id: 'pe', nom: 'e', valor: 0.2, unitat: 'm', grup: 'Mur', descripcio: 'Gruix', min: 0.1, max: 0.5 },
        { id: 'pS', nom: 'S', formula: 'L*H', unitat: 'm2', grup: 'Mur', descripcio: 'Superfície d\'una cara' },
        { id: 'pP', nom: 'nPilars', valor: 2, unitat: 'ut', grup: 'Acabats', min: 0, max: 10, enter: true },
        { id: 'pX', nom: 'extrems', valor: 1, unitat: 'ut', grup: 'Acabats', min: 0, max: 1, enter: true },
        { id: 'ps', nom: 'sep', valor: 2, unitat: 'm', grup: 'Il·luminació', min: 0.5 },
        { id: 'pN', nom: 'nLlums', formula: 'terra(L/sep)', unitat: 'ut', grup: 'Il·luminació' },
    ],
    condicions: [
        { id: 'k1', expressio: 'H<=L', missatge: 'El mur no pot ser més alt que llarg' },
        { id: 'k2', expressio: 'o(nPilars=0; nPilars>=2)', missatge: 'Si hi ha pilastres, n\'hi ha d\'haver almenys dues' },
    ],
    chapters: [{
        id: 'c0', code: 'TST', description: 'SISTEMA DE PROVA', items: [], subChapters: [
            {
                id: 'c1', code: 'TST.01', description: 'OBRA', subChapters: [], items: [
                    partida('i1', 'TST001', 'm3', 'Fonament', 100,
                        [linia('l1', 'Fonament', { units: 1, height: 0.4 }, { length: 'L', width: '2*e' })],
                        [{ code: 'mtFORM', description: 'Formigó', unit: 'm3', yield: 1, price: 100 }]),
                    partida('i2', 'TST002', 'm2', 'Mur', 40,
                        [linia('l2', 'Mur', { units: 1, width: 1 }, { length: 'L', height: 'H' })]),
                    partida('i3', 'TST003', 'm2', 'Arrebossat', 10, [
                        linia('l3a', 'Cares', { units: 2, width: 1 }, { length: 'L', height: 'H' }),
                        linia('l3b', 'Extrems', { width: 1 }, { units: '2*extrems', length: 'e', height: 'H' }),
                    ]),
                    partida('i4', 'TST004', 'm', 'Pilastres', 20,
                        [linia('l4', 'Pilastres', { units: 1, width: 1, height: 1 }, { length: 'nPilars*H' })]),
                    partida('i5', 'TST005', 'm2', 'Pintura', 5,
                        [{ id: 'l5', description: 'Igual que l\'arrebossat', refCode: 'TST003', factor: 1 }]),
                ],
            },
            {
                id: 'c2', code: 'TST.02', description: 'INSTAL·LACIONS', subChapters: [], items: [
                    partida('i10', 'TST010', 'u', 'Punt de llum', 30,
                        [linia('l10', 'Punts de llum', { length: 1, width: 1, height: 1 }, { units: 'nLlums' })]),
                ],
            },
        ],
    }],
    prices: {
        TST001: { code: 'TST001', price: 100, unit: 'm3', summary: 'Fonament' },
        mtFORM: { code: 'mtFORM', price: 100, unit: 'm3', summary: 'Formigó' },
        TST002: { code: 'TST002', price: 40, unit: 'm2', summary: 'Mur' },
        TST003: { code: 'TST003', price: 10, unit: 'm2', summary: 'Arrebossat' },
        TST004: { code: 'TST004', price: 20, unit: 'm', summary: 'Pilastres' },
        TST005: { code: 'TST005', price: 5, unit: 'm2', summary: 'Pintura' },
        TST010: { code: 'TST010', price: 30, unit: 'u', summary: 'Punt de llum' },
    },
});

// No baixa dins de les partides: un cop reimportat, els components del descomposat hi
// tornen com a fills.
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

describe('un sistema com a document', () => {
    const q = quantitats(resol(MUR.chapters, MUR.parametres));

    it('amida cada partida amb les fórmules', () => {
        expect(q.TST001).toBe(0.8);     // 5 × (2 × 0,2) × 0,4
        expect(q.TST002).toBe(12.5);    // 5 × 2,5
        expect(q.TST003).toBe(26);      // 2 × 5 × 2,5 + 2 × 0,2 × 2,5
        expect(q.TST004).toBe(5);       // 2 × 2,5
        expect(q.TST005).toBe(26);      // vinculada a l'arrebossat
        expect(q.TST010).toBe(2);       // terra(5 / 2)
    });

    it('suma el total amb el preu de cada concepte', () => {
        // 80 + 500 + 260 + 100 + 130 + 60
        expect(total(resol(MUR.chapters, MUR.parametres), MUR.prices)).toBe(1130);
    });

    it('cada partida val el preu del seu concepte', () => {
        Object.values(partides(MUR.chapters)).forEach(p => {
            expect(getItemUnitPrice(p, MUR.prices), p.code).toBe(p.price);
        });
    });

    it('l\'aplicació no porta cap sistema de sèrie', () => {
        // Sense localStorage (com als tests) la galeria és buida i desar-hi no peta.
        expect(llistaSistemes()).toEqual([]);
        expect(desaSistema(MUR).ok).toBe(false);
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
        const l = doc.chapters[0].items[0].measurements[0];
        expect(l.formules).toEqual({ height: 'H' });
        expect(l.calc).toBeUndefined();
        expect(l.sistema).toBeUndefined();
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
        const d = parametresADemanar(MUR, projecte);
        expect(d.filter(p => !p.derivat).map(p => p.nom)).toEqual(['L', 'H', 'e', 'nPilars', 'extrems', 'sep']);
        expect(d.find(p => p.nom === 'S').derivat).toBe(true);
        expect(d.find(p => p.nom === 'L').existent.valor).toBe(30);
        expect(d.find(p => p.nom === 'e').existent).toBeNull();
    });

    it('reanomena els que xoquen, els agrupa per instància i reescriu les fórmules', () => {
        const r = instancia(MUR, { nomInstancia: 'Mur jardí', parametresProjecte: projecte, id: 'I1' });
        expect(r.parametres.find(p => p.nomOriginal === 'L')).toMatchObject({ nom: 'L_2', grup: 'Mur jardí · Mur', sistema: 'I1' });
        expect(r.parametres.find(p => p.nom === 'S').formula).toBe('L_2*H_2');
        const mur = partides(r.chapters).TST002.measurements[0];
        expect(mur.formules).toEqual({ length: 'L_2', height: 'H_2' });
        expect(mur.sistema).toBe('I1');
        expect(r.instancia).toEqual({ id: 'I1', nom: 'Mur jardí', sistema: 'Mur de prova' });
    });

    it('pot fer servir el paràmetre del projecte amb el mateix nom', () => {
        const r = instancia(MUR, { parametresProjecte: projecte, respostes: new Map([['L', { enllaca: true }]]) });
        expect(r.parametres.find(p => p.nomOriginal === 'L')).toBeUndefined();
        expect(partides(r.chapters).TST002.measurements[0].formules.length).toBe('L');
        expect(quantitats(resol(r.chapters, [...projecte, ...r.parametres])).TST002).toBe(75);   // 30 × 2,5
    });

    it('les respostes poden ser valors o fórmules sobre el projecte, sense reanomenar-les', () => {
        const r = instancia(MUR, {
            parametresProjecte: projecte,
            respostes: new Map([['e', { valor: 0.3 }], ['H', { formula: 'H/2' }], ['L', { valor: 10 }]]),
        });
        expect(r.parametres.find(p => p.nom === 'e').valor).toBe(0.3);
        expect(r.parametres.find(p => p.nom === 'H_2').formula).toBe('H/2');   // H del projecte, 3
        expect(r.parametres.find(p => p.nom === 'L_2').valor).toBe(10);
        const q = quantitats(resol(r.chapters, [...projecte, ...r.parametres]));
        expect(q.TST002).toBe(15);     // 10 × 1,5
        expect(q.TST001).toBe(2.4);    // 10 × 0,6 × 0,4
    });

    it('dona ids nous i manté els vincles a línies dins del sistema', () => {
        const doc = {
            ...MUR,
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
        expect(Math.round(previsualitza(MUR).total * 100) / 100).toBe(1130);
        // El mur no té descomposat: val el preu del concepte, i el del projecte mana.
        const amb = previsualitza(MUR, {}, { TST002: { price: 0 } });
        expect(Math.round(amb.total * 100) / 100).toBe(630);
    });

    it('no repeteix el nom de la instància', () => {
        expect(nomInstanciaLliure('Mur', [])).toBe('Mur');
        expect(nomInstanciaLliure('Mur', [{ nom: 'Mur' }, { nom: 'Mur 2' }])).toBe('Mur 3');
    });
});

describe('instàncies dins del projecte', () => {
    // Un projecte amb una partida pròpia i un mur inserit, amb una de les seves línies afegida a
    // una partida que ja hi era.
    const muntaProjecte = () => {
        const inst = instancia(MUR, { nomInstancia: 'Mur', parametresProjecte: [{ id: 'q', nom: 'L', valor: 30 }], id: 'I1' });
        const liniaAfegida = partides(inst.chapters).TST010.measurements[0];
        return {
            budget: {
                parametres: [{ id: 'q', nom: 'L', valor: 30, grup: '' }, ...inst.parametres],
                sistemes: [inst.instancia],
                chapters: [
                    { id: 'c0', code: '01', description: 'PROPI', subChapters: [], items: [
                        { id: 'f', code: 'TST010', unit: 'u', measurements: [{ id: 'mine', description: 'meu', units: 1 }, liniaAfegida] },
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
        expect(f.map(c => c.code)).toEqual(['01', 'TST']);
        expect(f[0].items.map(i => i.code)).toEqual(['TST010']);
        expect(f[0].items[0].measurements).toHaveLength(1);
    });

    it('torna a fer el sistema amb els noms originals', () => {
        const { budget, prices } = muntaProjecte();
        const doc = extreuInstancia(budget, prices, 'I1');
        expect(doc.nom).toBe('Mur de prova');
        expect(doc.parametres.find(p => p.nom === 'L')).toBeTruthy();
        expect(doc.parametres.some(p => p.nom === 'L_2')).toBe(false);
        expect(doc.parametres.find(p => p.nom === 'e').grup).toBe('Mur');
        expect(partides(doc.chapters).TST002.measurements[0].formules.length).toBe('L');
        expect(partides(doc.chapters).TST002.measurements[0].sistema).toBeUndefined();
    });

    it('extreure i tornar a inserir dona les mateixes quantitats', () => {
        const { budget, prices } = muntaProjecte();
        const abans = quantitats(resol(filtraPerInstancia(budget.chapters, 'I1'), budget.parametres));
        const r = instancia(extreuInstancia(budget, prices, 'I1'));
        expect(quantitats(resol(r.chapters, r.parametres))).toEqual(abans);
    });

    it('treure-la deixa el que ja hi era', () => {
        const { budget } = muntaProjecte();
        const r = treuInstancia(budget, 'I1');
        expect(r.chapters.map(c => c.code)).toEqual(['01', 'TST']);
        expect(r.chapters[0].items.map(i => i.code)).toEqual(['TST010', 'G']);
        expect(r.chapters[0].items[0].measurements.map(m => m.id)).toEqual(['mine']);
        expect(partides(r.chapters[1].subChapters)).toEqual({});
        expect(r.parametres.map(p => p.nom)).toEqual(['L']);
        expect(r.sistemes).toEqual([]);
    });
});

describe('exportació BC3 d\'un projecte amb fórmules', () => {
    it('escriu els números calculats i el cicle conserva el total', () => {
        const chapters = resol(MUR.chapters, MUR.parametres);
        let ch = chapters;
        let preus = MUR.prices;
        for (let i = 0; i < 3; i++) {
            const r = processBC3Data(generateBC3({ budget: { name: 'P', chapters: ch }, chapters: ch, priceDatabase: preus }));
            ch = r.chapters;
            preus = r.prices;
            expect(total(ch, preus)).toBe(1130);
            expect(quantitats(ch)).toEqual(quantitats(chapters));
        }
    });

    it('una dimensió que dona 0 no torna com a 1 en reimportar', () => {
        const params = MUR.parametres.map(p => (p.nom === 'nPilars' ? { ...p, valor: 0 } : p.nom === 'extrems' ? { ...p, valor: 0 } : p));
        const chapters = resol(MUR.chapters, params);
        const r = processBC3Data(generateBC3({ budget: { name: 'P', chapters }, chapters, priceDatabase: MUR.prices }));
        expect(quantitats(r.chapters).TST004).toBe(0);    // longitud nPilars × H = 0, no 1 × 1
        expect(quantitats(r.chapters).TST003).toBe(25);   // sense els extrems
    });
});

describe('condicions dels sistemes', () => {
    it('el sistema porta els límits i les condicions, i amb els valors per defecte es compleixen', () => {
        expect(MUR.parametres.find(p => p.nom === 'nPilars')).toMatchObject({ min: 0, max: 10, enter: true });
        expect(MUR.condicions.map(c => c.expressio)).toEqual(['H<=L', 'o(nPilars=0; nPilars>=2)']);
        expect(previsualitza(MUR).incomplertes).toBe(0);
    });

    it('la previsualització diu què no es compleix, pel nom del sistema', () => {
        const v = previsualitza(MUR, {
            parametresProjecte: [{ id: 'q', nom: 'H', valor: 3 }],
            respostes: new Map([['H', { valor: 6 }], ['nPilars', { valor: 1 }], ['extrems', { valor: 0.5 }]]),
        });
        expect(v.condicions.map(c => c.ok)).toEqual([false, false]);
        expect(v.condicions[0].missatge).toBe('El mur no pot ser més alt que llarg');
        // H s'ha reanomenat a H_2 (el projecte ja en té un), però l'avís surt pel nom del sistema.
        expect(v.limitsPerNom.get('H')).toEqual(['Ha de ser com a màxim 4']);
        expect(v.limitsPerNom.get('extrems')).toEqual(['Ha de ser un nombre enter']);
        expect(v.incomplertes).toBe(4);
    });

    it('en inserir, les condicions es reanomenen amb els paràmetres i es marquen', () => {
        const r = instancia(MUR, { nomInstancia: 'Mur B', id: 'I9', parametresProjecte: [{ id: 'q', nom: 'H', valor: 3 }] });
        expect(r.condicions[0]).toMatchObject({ expressio: 'H_2<=L', sistema: 'I9', grup: 'Mur B' });
        expect(r.condicions[0].id).not.toBe('k1');
    });

    it('extreure i treure una instància fan el mateix amb les seves condicions', () => {
        const inst = instancia(MUR, { parametresProjecte: [{ id: 'q', nom: 'H', valor: 3 }], id: 'I1' });
        const budget = {
            parametres: [{ id: 'q', nom: 'H', valor: 3 }, ...inst.parametres],
            condicions: [{ id: 'propia', expressio: 'H>0' }, ...inst.condicions],
            sistemes: [inst.instancia],
            chapters: inst.chapters,
        };
        const doc = extreuInstancia(budget, inst.prices, 'I1');
        expect(doc.condicions.map(c => c.expressio)).toEqual(['H<=L', 'o(nPilars=0; nPilars>=2)']);
        expect(doc.condicions[0].sistema).toBeUndefined();
        expect(treuInstancia(budget, 'I1').condicions.map(c => c.id)).toEqual(['propia']);
    });

    it('desar un projecte com a sistema hi porta les condicions', () => {
        const doc = documentDeProjecte({ chapters: [], parametres: [], condicions: [{ id: 'k', expressio: 'A>0', sistema: 'x', grup: 'g' }] });
        expect(doc.condicions).toEqual([{ id: 'k', expressio: 'A>0' }]);
        expect(llegeixDocument({ budget: { chapters: [], condicions: [{ id: 'k', expressio: 'A>0' }] } }).condicions).toHaveLength(1);
    });
});

describe('ometre les partides que surten a zero', () => {
    // Sense pilastres i amb una separació entre llums més gran que el mur: cap punt de llum.
    const sense = new Map([['nPilars', { valor: 0 }], ['sep', { valor: 6 }]]);

    it('no les insereix, ni els capítols que es queden buits', () => {
        const r = instancia(MUR, { respostes: sense, ometZero: true });
        const codis = Object.keys(partides(r.chapters));
        expect(codis.sort()).toEqual(['TST001', 'TST002', 'TST003', 'TST005']);
        expect(r.omeses.map(o => o.code).sort()).toEqual(['TST004', 'TST010']);
        expect(r.chapters[0].subChapters.map(c => c.code)).toEqual(['TST.01']);
        expect(r.prices.TST010).toBeUndefined();
        expect(r.prices.TST003).toBeTruthy();
    });

    it('el total és el mateix que inserint-les a zero', () => {
        const amb = previsualitza(MUR, { respostes: sense });
        const sen = previsualitza(MUR, { respostes: sense, ometZero: true });
        expect(Math.round(sen.total * 100) / 100).toBe(Math.round(amb.total * 100) / 100);
        expect(sen.omeses).toHaveLength(2);
        expect(amb.omeses).toHaveLength(0);
    });

    it('sense l\'opció, les insereix totes', () => {
        expect(Object.keys(partides(instancia(MUR, { respostes: sense }).chapters))).toHaveLength(6);
    });

    it('té en compte els paràmetres del projecte i els vincles', () => {
        const doc = {
            ...MUR,
            parametres: [{ id: 'v', nom: 'var', valor: 1 }],
            condicions: [],
            chapters: [{
                id: 'c', code: 'X', subChapters: [], items: [
                    { id: 'a', code: 'A48', unit: 'm2', measurements: [{ id: 'la', units: 0, length: 3, formules: { units: 'si(var=1;1;0)' } }] },
                    { id: 'b', code: 'A70', unit: 'm2', measurements: [{ id: 'lb', units: 0, length: 3, formules: { units: 'si(var=2;1;0)' } }] },
                    { id: 'k', code: 'PLACA', unit: 'm2', measurements: [{ id: 'lk', units: 0, length: 0, formules: { units: 'H', length: 2 } }] },
                    { id: 'r', code: 'CINTA', unit: 'm2', measurements: [{ id: 'lr', refCode: 'A70', factor: 1 }] },
                ],
            }],
        };
        const r = instancia(doc, { respostes: new Map([['var', { valor: 1 }]]), parametresProjecte: [{ id: 'h', nom: 'H', valor: 3 }], ometZero: true });
        expect(Object.keys(partides(r.chapters)).sort()).toEqual(['A48', 'PLACA']);
    });
});

describe('nom de la zona a les línies de cada instància', () => {
    const totes = (chapters) => Object.values(partides(chapters));

    it('amb una sola línia, el nom de la zona n\'és el text; amb diverses, va en un títol al davant', () => {
        const r = instancia(MUR, { nomInstancia: 'Façana nord', liniaZona: true, id: 'Z1' });
        const ps = totes(r.chapters).filter(p => (p.measurements || []).length);
        const unes = ps.filter(p => p.measurements.length === 1);
        const diverses = ps.filter(p => p.measurements.length > 1);
        expect(unes.length).toBeGreaterThan(0);
        expect(diverses.length).toBeGreaterThan(0);
        unes.forEach(p => expect(p.measurements[0]).toMatchObject({ description: 'Façana nord', nomZona: true, sistema: 'Z1' }));
        diverses.forEach(p => {
            expect(p.measurements[0]).toMatchObject({ description: 'Façana nord', units: 0, zona: true, sistema: 'Z1' });
            expect(p.measurements.filter(m => m.zona)).toHaveLength(1);
        });
        // El text que tenia la línia al sistema es guarda.
        const original = totes(MUR.chapters).find(p => p.code === unes[0].code).measurements[0].description;
        expect(unes[0].measurements[0].descripcioSistema).toBe(original);
    });

    it('no canvia cap quantitat ni el total', () => {
        const amb = instancia(MUR, { liniaZona: true });
        const sense = instancia(MUR, { liniaZona: false });
        expect(quantitats(resol(amb.chapters, amb.parametres))).toEqual(quantitats(resol(sense.chapters, sense.parametres)));
        expect(totes(sense.chapters).some(p => (p.measurements || []).some(m => m.zona || m.nomZona))).toBe(false);
    });

    it('extreure la instància torna els textos del sistema, i tornar-la a inserir hi posa el nom nou', () => {
        const inst = instancia(MUR, { nomInstancia: 'Pati', liniaZona: true, id: 'Z2' });
        const budget = { chapters: inst.chapters, parametres: inst.parametres, condicions: inst.condicions, sistemes: [inst.instancia] };
        const doc = extreuInstancia(budget, inst.prices, 'Z2');
        const descripcions = (chapters) => totes(chapters).flatMap(p => (p.measurements || []).map(m => m.description));
        expect(descripcions(doc.chapters)).toEqual(descripcions(MUR.chapters));
        expect(totes(doc.chapters).some(p => (p.measurements || []).some(m => m.zona || m.nomZona || m.descripcioSistema !== undefined))).toBe(false);
        const dues = instancia(doc, { nomInstancia: 'Jardí', liniaZona: true });
        expect(descripcions(dues.chapters)).toContain('Jardí');
        expect(descripcions(dues.chapters)).not.toContain('Pati');
    });

    it('treure la instància ho treu tot', () => {
        const inst = instancia(MUR, { nomInstancia: 'Pati', liniaZona: true, id: 'Z3' });
        const budget = { chapters: inst.chapters, parametres: inst.parametres, condicions: inst.condicions, sistemes: [inst.instancia] };
        const r = treuInstancia(budget, 'Z3');
        expect(totes(r.chapters)).toHaveLength(0);
    });
});

describe('esquema del sistema', () => {
    const esquema = { dades: 'data:image/svg+xml;base64,PHN2Zy8+', nom: 'mur.svg' };

    it('passa del projecte al document, a la instància i torna en extreure', () => {
        const doc = documentDeProjecte({ chapters: MUR.chapters, parametres: MUR.parametres, esquema }, {}, { nom: 'Mur' });
        expect(doc.esquema).toEqual(esquema);
        expect(llegeixDocument(JSON.parse(JSON.stringify(doc))).esquema).toEqual(esquema);
        const inst = instancia(doc, { id: 'E1' });
        expect(inst.instancia.esquema).toEqual(esquema);
        const budget = { chapters: inst.chapters, parametres: inst.parametres, condicions: inst.condicions, sistemes: [inst.instancia] };
        expect(extreuInstancia(budget, inst.prices, 'E1').esquema).toEqual(esquema);
    });

    it('un projecte amb esquema es pot obrir com a sistema', () => {
        const doc = llegeixDocument({ budget: { chapters: MUR.chapters, parametres: MUR.parametres, esquema }, priceDatabase: {} });
        expect(doc.esquema).toEqual(esquema);
    });

    it('descarta el que no és una imatge', () => {
        expect(llegeixDocument({ ...MUR, esquema: { dades: 'javascript:alert(1)' } }).esquema).toBeUndefined();
        expect(llegeixDocument({ ...MUR, esquema: { dades: 'data:text/html;base64,PGI+' } }).esquema).toBeUndefined();
        expect(documentDeProjecte({ chapters: [], esquema: 'no' }).esquema).toBeUndefined();
    });
});

describe('canviar el nom d\'una instància', () => {
    const muntat = () => {
        const inst = instancia(MUR, { nomInstancia: 'Façana nord', liniaZona: true, id: 'R1' });
        return { chapters: inst.chapters, parametres: inst.parametres, condicions: inst.condicions, sistemes: [inst.instancia, { id: 'R2', nom: 'Façana sud' }] };
    };
    const linies = (b) => Object.values(partides(b.chapters)).flatMap(p => p.measurements || []);

    it('el canvia a la instància, als grups i a les línies de la zona', () => {
        const r = reanomenaInstancia(muntat(), 'R1', 'Façana est');
        expect(r.sistemes[0].nom).toBe('Façana est');
        expect(r.parametres.every(p => p.grup === 'Façana est' || p.grup.startsWith('Façana est · '))).toBe(true);
        expect(r.condicions.every(c => c.grup === 'Façana est')).toBe(true);
        expect(linies(r).filter(m => m.zona || m.nomZona).every(m => m.description === 'Façana est')).toBe(true);
        expect(linies(r).some(m => m.description === 'Façana nord')).toBe(false);
    });

    it('respecta una línia on s\'ha escrit una altra cosa, i no repeteix el nom d\'una altra instància', () => {
        const b = muntat();
        const primera = linies(b).find(m => m.nomZona);
        primera.description = 'Façana nord, tram del portal';
        const r = reanomenaInstancia(b, 'R1', 'Façana sud');
        expect(r.sistemes[0].nom).toBe('Façana sud 2');
        expect(linies(r).find(m => m.id === primera.id).description).toBe('Façana nord, tram del portal');
    });

    it('un nom buit o el mateix no canvia res', () => {
        const b = muntat();
        expect(reanomenaInstancia(b, 'R1', '  ')).toBe(b);
        expect(reanomenaInstancia(b, 'R1', 'Façana nord')).toBe(b);
    });
});
