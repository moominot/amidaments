import { describe, it, expect } from 'vitest';
import { avalua, compila, interpretaCamp, reanomenaA, referencies, esNomValid } from '../src/utils/formules';
import { resolParametres, resolveFormules, usosDeParametres, reescriuFormules, nomLliure } from '../src/utils/parametres';
import { calcItemTotalQty, calcMeasureTotal } from '../src/utils/calculations';
import { resolveMeasurementRefs } from '../src/utils/measurementRefs';

const vals = (o) => (nom) => o[nom];

describe('avaluar fórmules', () => {
    it('fa les operacions amb la prioritat habitual', () => {
        expect(avalua('2+3*4').valor).toBe(14);
        expect(avalua('(2+3)*4').valor).toBe(20);
        expect(avalua('2^3^2').valor).toBe(512);
        expect(avalua('2^-1').valor).toBe(0.5);
        expect(avalua('-2^2').valor).toBe(-4);
        expect(avalua('10/4').valor).toBe(2.5);
        expect(avalua('3×2÷4').valor).toBe(1.5);
    });

    it('accepta la coma i el punt decimals, i un = al davant', () => {
        expect(avalua('2,5*2').valor).toBe(5);
        expect(avalua('2.5*2').valor).toBe(5);
        expect(avalua('=1,5+,5').valor).toBe(2);
    });

    it('fa servir els paràmetres', () => {
        expect(avalua('L+2*e', vals({ L: 8, e: 0.25 })).valor).toBe(8.5);
        expect(avalua('(P1+P2)/2', vals({ P1: 1.3, P2: 1.44 })).valor).toBeCloseTo(1.37, 10);
        expect(avalua('al·lèrgia*2', vals({ 'al·lèrgia': 3 })).valor).toBe(6);
    });

    it('té les funcions amb arguments separats per punt i coma', () => {
        expect(avalua('max(2,5;A)', vals({ A: 1 })).valor).toBe(2.5);
        expect(avalua('min(3;1;2)').valor).toBe(1);
        expect(avalua('arrel(L^2+0,14^2)', vals({ L: 8 })).valor).toBeCloseTo(8.001225, 6);
        expect(avalua('sqrt(16)').valor).toBe(4);
        expect(avalua('sostre(2,1)').valor).toBe(3);
        expect(avalua('arrod(2,345;2)').valor).toBe(2.35);
        expect(avalua('pi*2').valor).toBeCloseTo(6.2832, 4);
    });

    it('dona errors entenedors i mai no llança', () => {
        expect(avalua('L*2').error).toBe('Paràmetre desconegut: L');
        expect(avalua('2/(1-1)').error).toBe('Divisió per zero');
        expect(avalua('2+').error).toMatch(/massa aviat/);
        expect(avalua('(2+3').error).toMatch(/Falta «\)»/);
        expect(avalua('2$3').error).toMatch(/Caràcter no vàlid/);
        expect(avalua('foo(2)').error).toBe('Funció desconeguda: foo');
        expect(avalua('max(2,3)').error).toBeUndefined();   // 2,3 és un decimal
        expect(avalua('abs(2;3)').error).toMatch(/arguments/);
        expect(avalua('').error).toBe('Fórmula buida');
        expect(avalua('arrel(-1)').error).toMatch(/no és un número/);
    });

    it('no executa codi', () => {
        expect(avalua('constructor').error).toMatch(/desconegut/);
        expect(avalua('alert(1)').error).toMatch(/Funció desconeguda/);
        expect(compila('__proto__').refs.has('__proto__')).toBe(true);
    });
});

describe('camps, referències i noms', () => {
    it('distingeix número de fórmula en el que s\'escriu', () => {
        expect(interpretaCamp('12,5')).toEqual({ valor: 12.5 });
        expect(interpretaCamp('1.234,5')).toEqual({ valor: 1234.5 });
        expect(interpretaCamp('')).toEqual({ valor: 0 });
        expect(interpretaCamp('L+1')).toEqual({ formula: 'L+1' });
        expect(interpretaCamp('=8')).toEqual({ formula: '8' });
        expect(interpretaCamp('2+')).toEqual({ formula: '2+' });
    });

    it('troba els paràmetres d\'una fórmula', () => {
        expect([...referencies('max(L;A)+L*e')].sort()).toEqual(['A', 'L', 'e']);
        expect(referencies('2+').size).toBe(0);
    });

    it('reanomena sense tocar res més', () => {
        expect(reanomenaA('L + L2*L', 'L', 'Llarg')).toBe('Llarg + L2*Llarg');
        expect(reanomenaA('max(max;2)', 'max', 'M')).toBe('max(M;2)');
        expect(reanomenaA('2,5*L', 'L', 'X')).toBe('2,5*X');
    });

    it('valida els noms', () => {
        expect(esNomValid('L')).toBe(true);
        expect(esNomValid('alçada_planta')).toBe(true);
        expect(esNomValid('P1')).toBe(true);
        expect(esNomValid('1P')).toBe(false);
        expect(esNomValid('a b')).toBe(false);
        expect(esNomValid('max')).toBe(false);
        expect(esNomValid('')).toBe(false);
    });

    it('busca un nom lliure', () => {
        expect(nomLliure('L', new Set(['A']))).toBe('L');
        expect(nomLliure('L', new Set(['L', 'L_2']))).toBe('L_3');
    });
});

describe('paràmetres', () => {
    const p = (id, nom, valor, formula) => ({ id, nom, valor, formula });

    it('calcula els que depenen d\'altres, en qualsevol ordre', () => {
        const r = resolParametres([p('3', 'Pm', 0, '(P1+P2)/2'), p('1', 'P1', 1.3), p('2', 'P2', 1.44)]);
        expect(r.valors.get('Pm')).toBeCloseTo(1.37, 10);
        expect(r.errors.size).toBe(0);
    });

    it('detecta cicles, noms repetits i errors en cadena', () => {
        const r = resolParametres([
            p('a', 'A', 0, 'B+1'), p('b', 'B', 0, 'A+1'),
            p('c', 'C', 1), p('c2', 'C', 2),
            p('d', 'D', 0, 'X*2'), p('e', 'E', 0, 'D+1'),
            p('f', '2x', 1),
        ]);
        expect(r.errors.get('a')).toMatch(/circular|error/);
        expect(r.errors.get('b')).toMatch(/circular|error/);
        expect(r.errors.get('c2')).toBe('Nom repetit: C');
        expect(r.valors.get('C')).toBe(1);
        expect(r.errors.get('d')).toBe('Paràmetre desconegut: X');
        expect(r.errors.get('e')).toBe('El paràmetre D té un error');
        expect(r.errors.get('f')).toMatch(/Nom no vàlid/);
    });
});

describe('línies amb fórmula', () => {
    const parametres = [
        { id: '1', nom: 'L', valor: 8 }, { id: '2', nom: 'A', valor: 1.78 },
        { id: '3', nom: 'e', valor: 0.25 }, { id: '4', nom: 'n', valor: 0 },
    ];
    const partida = (code, measurements) => ({ id: code, code, unit: 'm2', measurements });
    const arbre = () => [{
        id: 'c', code: 'C', subChapters: [], items: [
            partida('LLOSA', [{ id: 'l1', description: 'Llosa', units: 1, length: 0, width: 0, height: 1, formules: { length: 'L+2*e', width: 'A+2*e' } }]),
            partida('PEÇA', [{ id: 'l2', description: 'Peça', units: 0, length: 3, width: 1, height: 1, formules: { units: 'n' } }]),
            partida('COSTAT', [{ id: 'l3', description: 'Costat', units: 2, length: 0, width: 1, height: 1, formules: { length: 'n*L' } }]),
            partida('MAL', [{ id: 'l4', description: 'Mal', units: 1, length: 0, formules: { length: 'X+1' } }]),
            partida('FIXA', [{ id: 'l5', description: 'Fixa', units: 2, length: 3 }]),
            partida('VINCLE', [{ id: 'l6', description: '', refCode: 'LLOSA', factor: 2 }]),
        ],
    }];

    it('calcula els camps amb fórmula i deixa la resta', () => {
        const r = resolveFormules(arbre(), parametres);
        const [llosa, peca, costat, mal, fixa] = r.chapters[0].items;
        expect(llosa.measurements[0]).toMatchObject({ length: 8.5, width: 2.28, calc: { length: 8.5, width: 2.28 } });
        expect(calcItemTotalQty(llosa)).toBe(19.38);
        expect(calcItemTotalQty(peca)).toBe(0);
        // Una dimensió que dona 0 no compta com a 1.
        expect(costat.measurements[0].units).toBe(0);
        expect(calcMeasureTotal(costat.measurements[0])).toBe(0);
        expect(mal.measurements[0].errorsFormula).toEqual({ length: 'Paràmetre desconegut: X' });
        expect(calcItemTotalQty(mal)).toBe(0);
        expect(r.liniesAmbError).toBe(1);
        expect(calcItemTotalQty(fixa)).toBe(6);
    });

    it('els vincles prenen la quantitat ja calculada', () => {
        const r = resolveMeasurementRefs(resolveFormules(arbre(), parametres).chapters);
        expect(calcItemTotalQty(r.chapters[0].items[5])).toBe(38.76);
    });

    it('sense cap fórmula torna el mateix arbre', () => {
        const sense = [{ id: 'c', code: 'C', items: [partida('P', [{ id: 'x', units: 1, length: 2 }])] }];
        expect(resolveFormules(sense, parametres).chapters).toBe(sense);
    });

    it('compta els usos i reescriu les fórmules en reanomenar', () => {
        const ps = [...parametres, { id: '5', nom: 'Lt', formula: 'L+A' }];
        const usos = usosDeParametres(arbre(), ps);
        expect(usos.get('L')).toBe(3);
        expect(usos.get('n')).toBe(2);
        const r = reescriuFormules({ chapters: arbre(), parametres: ps }, new Map([['L', 'Llarg']]));
        expect(r.chapters[0].items[0].measurements[0].formules.length).toBe('Llarg+2*e');
        expect(r.parametres.find(x => x.id === '5').formula).toBe('Llarg+A');
    });

    it('reescriu canvis encadenats sense trepitjar-se', () => {
        const r = reescriuFormules({ chapters: [], parametres: [{ id: 'x', nom: 'X', formula: 'A+B' }] }, new Map([['A', 'B'], ['B', 'C']]));
        expect(r.parametres[0].formula).toBe('B+C');
    });
});
