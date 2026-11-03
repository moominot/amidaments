import { describe, it, expect } from 'vitest';
import { omplePlantilla, referenciesPlantilla, reescriuPlantilla, formataValor, esPlantilla } from '../src/utils/plantilles';
import { resolveFormules, reescriuFormules, usosDeParametres, resolParametres } from '../src/utils/parametres';
import { llegeixDocument, instancia, extreuInstancia, parametresADemanar, FORMAT_SISTEMA } from '../src/utils/sistemesDoc';
import { generateBC3 } from '../src/utils/bc3Writer';
import { processBC3Data } from '../src/utils/bc3Parser';
import { creaFragment, llegeixFragment } from '../src/utils/portaRetalls';

/**
 * Títols i descripcions amb variables: `{expressió}` i `{si(condició; "text"; "text")}`.
 * Les xifres són fetes a mà: B 0,4, H 0,6, acabat 1.
 */

const PARAMS = [
    { id: 'b', nom: 'B', valor: 0.4 },
    { id: 'h', nom: 'H', valor: 0.6 },
    { id: 'a', nom: 'acabat', valor: 1 },
    { id: 's', nom: 'S', formula: 'B*H' },
];
const valorDe = resolParametres(PARAMS).valorDe;

describe('omplir un text', () => {
    it('números amb coma i sense zeros sobrers', () => {
        expect(omplePlantilla('Biga de {B*100}x{H*100} cm, secció {S} m²', valorDe).text).toBe('Biga de 40x60 cm, secció 0,24 m²');
        expect(formataValor(1 / 3)).toBe('0,333');
        expect(formataValor(1250)).toBe('1250');
    });

    it('tria un text amb si(), també niats', () => {
        expect(omplePlantilla('{si(acabat=1; "encofrat vist"; "per revestir")}', valorDe).text).toBe('encofrat vist');
        expect(omplePlantilla('{si(acabat=0; "a"; si(B>0,5; "b"; "c"))}', valorDe).text).toBe('c');
        expect(omplePlantilla('{si(acabat=1; "de "; "x")}{H*100} cm', valorDe).text).toBe('de 60 cm');
    });

    it('un si() sense textos és una fórmula normal', () => {
        expect(omplePlantilla('{si(B>0,3; 2; 1)} capes', valorDe).text).toBe('2 capes');
    });

    it('el que no es pot resoldre es queda amb les claus i es diu', () => {
        const r = omplePlantilla('Mur de {G*100} cm i {B*100}', valorDe);
        expect(r.text).toBe('Mur de {G*100} cm i 40');
        expect(r.errors).toHaveLength(1);
        expect(r.errors[0].expressio).toBe('G*100');
    });

    it('un text sense claus no es toca', () => {
        expect(esPlantilla('Formigó HA-25/B/20/IIa')).toBe(false);
        expect(omplePlantilla('Formigó HA-25', valorDe)).toEqual({ text: 'Formigó HA-25', errors: [] });
    });

    it('sap quins paràmetres fa servir i els reanomena sense tocar els textos', () => {
        const t = 'De {B*100} cm, {si(acabat=1; "acabat B"; "sense")}';
        expect([...referenciesPlantilla(t)].sort()).toEqual(['B', 'acabat']);
        const r = reescriuPlantilla(t, f => f.replace(/\bB\b/g, 'B_2'));
        expect(r).toBe('De {B_2*100} cm, {si(acabat=1; "acabat B"; "sense")}');
    });
});

const partida = (over = {}) => ({
    id: 'p1', code: 'BIGA', unit: 'm', price: 50, breakdown: [], subChapters: [], items: [],
    description: 'Biga de {B*100}x{H*100} cm',
    fullDescription: 'Biga de formigó armat de {B*100}x{H*100} cm, {si(acabat=1; "encofrat vist"; "per revestir")}.',
    measurements: [{ id: 'l1', description: 'Pòrtic', units: 2, length: 5, width: 1, height: 1 }],
    ...over,
});
const arbre = (p = partida()) => [{ id: 'c', code: 'EST', description: 'ESTRUCTURA ({B*100} cm)', subChapters: [], items: [p] }];

describe('dins del projecte', () => {
    it('el resolt porta el text omplert i guarda el que s\'edita', () => {
        const r = resolveFormules(arbre(), PARAMS).chapters;
        const p = r[0].items[0];
        expect(p.description).toBe('Biga de 40x60 cm');
        expect(p.fullDescription).toBe('Biga de formigó armat de 40x60 cm, encofrat vist.');
        expect(p.plantilles.description).toBe('Biga de {B*100}x{H*100} cm');
        expect(r[0].description).toBe('ESTRUCTURA (40 cm)');
    });

    it('canviar un paràmetre canvia el text', () => {
        const altres = PARAMS.map(x => (x.nom === 'B' ? { ...x, valor: 0.3 } : x.nom === 'acabat' ? { ...x, valor: 0 } : x));
        const p = resolveFormules(arbre(), altres).chapters[0].items[0];
        expect(p.fullDescription).toBe('Biga de formigó armat de 30x60 cm, per revestir.');
    });

    it('reanomenar un paràmetre reescriu els textos', () => {
        const r = reescriuFormules({ chapters: arbre(), parametres: PARAMS }, new Map([['B', 'base']]));
        expect(r.chapters[0].items[0].description).toBe('Biga de {base*100}x{H*100} cm');
        expect(r.parametres.find(x => x.nom === 'S').formula).toBe('base*H');
    });

    it('compta com a ús d\'un paràmetre', () => {
        const usos = usosDeParametres(arbre(), PARAMS);
        expect(usos.get('acabat')).toBe(1);
        expect(usos.get('H')).toBe(3);   // títol, descripció i la fórmula de S
    });

    it('el BC3 porta el text omplert, i en reimportar es llegeix tal qual', () => {
        const chapters = resolveFormules(arbre(), PARAMS).chapters;
        const bc3 = generateBC3({ budget: { name: 'Prova', chapters }, chapters, priceDatabase: {} });
        expect(bc3).toContain('Biga de 40x60 cm');
        expect(bc3).toContain('Biga de formigó armat de 40x60 cm, encofrat vist.');
        expect(bc3).not.toContain('{B*100}');
        const p = processBC3Data(bc3).chapters[0].items.find(i => i.code === 'BIGA');
        expect(p.description).toBe('Biga de 40x60 cm');
    });

    it('copiar a una altra finestra porta el text omplert, no les variables', () => {
        const p = resolveFormules(arbre(), PARAMS).chapters[0].items[0];
        const f = llegeixFragment(creaFragment(p, {}));
        expect(f.nodes[0].description).toBe('Biga de 40x60 cm');
        expect(f.nodes[0].plantilles).toBeUndefined();
    });
});

describe('en un sistema', () => {
    const DOC = llegeixDocument({
        format: FORMAT_SISTEMA, versio: 1, nom: 'Biga', descripcio: '',
        parametres: [
            { id: 'b', nom: 'B', valor: 0.4, unitat: 'm' },
            { id: 'h', nom: 'H', valor: 0.6, unitat: 'm' },
            { id: 'a', nom: 'acabat', valor: 1, min: 0, max: 1, enter: true },
        ],
        condicions: [],
        chapters: arbre(),
        prices: {},
    });

    it('un paràmetre que només surt al text també es demana', () => {
        expect(parametresADemanar(DOC, []).map(p => p.nom)).toContain('acabat');
    });

    it('en inserir-lo, els noms que xoquen es reanomenen també al text', () => {
        const r = instancia(DOC, { nomInstancia: 'Biga 2', parametresProjecte: [{ id: 'q', nom: 'B', valor: 1 }], id: 'I2' });
        const p = r.chapters[0].items[0];
        expect(p.description).toBe('Biga de {B_2*100}x{H*100} cm');
        const resolt = resolveFormules(r.chapters, [{ id: 'q', nom: 'B', valor: 1 }, ...r.parametres]).chapters[0].items[0];
        expect(resolt.description).toBe('Biga de 40x60 cm');
    });

    it('extreure la instància torna els noms originals al text', () => {
        const r = instancia(DOC, { nomInstancia: 'Biga 2', parametresProjecte: [{ id: 'q', nom: 'B', valor: 1 }], id: 'I2' });
        const budget = { chapters: r.chapters, parametres: [{ id: 'q', nom: 'B', valor: 1 }, ...r.parametres], condicions: r.condicions || [], sistemes: [r.instancia] };
        const doc = extreuInstancia(budget, r.prices, 'I2');
        expect(doc.chapters[0].items[0].description).toBe('Biga de {B*100}x{H*100} cm');
    });
});
