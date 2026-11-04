import { describe, it, expect } from 'vitest';
import { parseCadClipboard, netejaMtext, nomDeRetols } from '../src/utils/cadPaste';
import {
    magnituds, agrupaEntitats, modePerDefecte, fontPerDefecte, muntaInstancies, fusionaArbres,
    instanciesVinculades, actualitzaDesDeCad, entitatsLliures,
} from '../src/utils/cadSistemes';
import { llegeixDocument, FORMAT_SISTEMA } from '../src/utils/sistemesDoc';
import { resolveFormules } from '../src/utils/parametres';
import { calcItemTotalQty, calcChapterTotal, round2 } from '../src/utils/calculations';

/**
 * Del CAD als sistemes. El text del porta-retalls és el que escriu el LISP (versió 2, amb la
 * columna de rètols), fet a mà amb tres sales:
 *   - Cuina: una polilínia de 4 × 3 m (12 m², 14 m de perímetre);
 *   - Menjador: dues polilínies, 5 × 4 (20 m², 18 m) i 2 × 1,5 (3 m², 7 m);
 *   - Estar: una trama de 6 × 5 amb un pilar de 0,5 × 0,5 (àrea neta 29,75 m²; perímetre
 *     22 + 2 = 24 m, el del contorn i el de l'illa).
 * El sistema és un paviment amb A (àrea) i P (perímetre): paviment A m², sòcol P m.
 * Xifres a mà: paviment 12 + 23 + 29,75 = 64,75 m²; sòcol 14 + 25 + 24 = 63 m.
 */

const T = '\t';
const fila = (...c) => c.join(T);
const PORTA_RETALLS = [
    fila('AMIDAMENTS-CAD', '2', 'planta.dwg'),
    fila('LWPOLYLINE', '1', '14.0000', '12.0000', 'A-PAVIMENT', '', '2F1', 'Cuina | 12,00 m²'),
    fila('LWPOLYLINE', '1', '18.0000', '20.0000', 'A-PAVIMENT', '', '2F2', '{\\fArial|b1;Menjador}'),
    fila('LWPOLYLINE', '1', '7.0000', '3.0000', 'A-PAVIMENT', '', '2F3', 'MENJADOR\\P'),
    fila('HATCH', '1', '24.0000', '29.7500', 'A-TRAMA', '', '2F4', 'S: 29,75 m2 | Estar'),
].join('\r\n');

const entitats = () => parseCadClipboard(PORTA_RETALLS).entities;

const linia = (id, formules) => ({ id, description: 'Superfície', units: 1, length: 0, width: 0, height: 0, formules });
const PAVIMENT = llegeixDocument({
    format: FORMAT_SISTEMA, versio: 1, nom: 'Paviment de gres', descripcio: '',
    parametres: [
        { id: 'a', nom: 'A', valor: 10, unitat: 'm2', descripcio: 'Superfície' },
        { id: 'p', nom: 'P', valor: 12, unitat: 'm', descripcio: 'Perímetre' },
        { id: 'h', nom: 'h', valor: 0.07, unitat: 'm', descripcio: 'Alçada del sòcol' },
    ],
    condicions: [],
    chapters: [{
        id: 'c', code: 'PAV', description: 'PAVIMENTS', subChapters: [], items: [
            { id: 'p1', code: 'GRES', unit: 'm2', description: 'Paviment de gres', price: 30, measurements: [linia('l1', { length: 'A' })] },
            { id: 'p2', code: 'SOCOL', unit: 'm', description: 'Sòcol de gres', price: 8, measurements: [linia('l2', { length: 'P' })] },
        ],
    }],
    prices: {},
});

describe('el porta-retalls del LISP, versió 2', () => {
    it('llegeix els rètols i en treu el nom de la sala', () => {
        const es = entitats();
        expect(es).toHaveLength(4);
        expect(es[0].labels).toEqual(['Cuina', '12,00 m²']);
        expect(es[1].labels).toEqual(['Menjador']);
        expect(es[2].labels).toEqual(['MENJADOR']);
        expect(es.map(e => nomDeRetols(e.labels))).toEqual(['Cuina', 'Menjador', 'MENJADOR', 'Estar']);
    });

    it('la versió 1, sense rètols, es continua llegint', () => {
        const r = parseCadClipboard(`AMIDAMENTS-CAD${T}1${T}x.dwg\r\nLINE${T}0${T}5${T}0${T}MUR${T}${T}A1`);
        expect(r.entities[0]).toMatchObject({ type: 'LINE', length: 5, handle: 'A1', labels: [] });
    });

    it('els textos seleccionats no són entitats a amidar: només fan de rètol', () => {
        const r = parseCadClipboard([
            fila('AMIDAMENTS-CAD', '2', 'x.dwg'),
            fila('TEXT', '0', '0', '0', 'RETOLS', '', 'T1', ''),
            fila('MTEXT', '0', '0', '0', 'RETOLS', '', 'T2', ''),
            fila('LWPOLYLINE', '1', '14', '12', 'A', '', 'P1', 'Cuina'),
        ].join('\r\n'));
        expect(r.entities.map(e => e.type)).toEqual(['LWPOLYLINE']);
    });

    it('treu el format dels MTEXT', () => {
        expect(netejaMtext('{\\fArial|b0|i0;\\H1.5x;Sala d\'actes}\\PPlanta 1')).toBe('Sala d\'actes Planta 1');
        expect(netejaMtext('%%c 20')).toBe('Ø 20');
    });
});

describe('zones', () => {
    it('pel rètol, les polilínies amb el mateix nom són la mateixa sala, sense distingir majúscules', () => {
        const z = agrupaEntitats(entitats(), 'retol');
        expect(z.map(x => x.nom)).toEqual(['Cuina', 'Menjador', 'Estar']);
        expect(z[1].handles).toEqual(['2F2', '2F3']);
        expect(magnituds(z[1].entitats)).toMatchObject({ area: 23, perimetre: 25 });
    });

    it('una zona per entitat, una sola, o per capa', () => {
        expect(agrupaEntitats(entitats(), 'cada')).toHaveLength(4);
        const una = agrupaEntitats(entitats(), 'una');
        expect(una).toHaveLength(1);
        expect(magnituds(una[0].entitats)).toEqual({ area: 64.75, perimetre: 63, llargada: 0, nombre: 4 });
        expect(agrupaEntitats(entitats(), 'capa').map(x => x.nom)).toEqual(['A-PAVIMENT', 'A-TRAMA']);
    });

    it('per defecte, pel rètol si n\'hi ha', () => {
        expect(modePerDefecte(entitats())).toBe('retol');
        expect(modePerDefecte(entitats().map(e => ({ ...e, labels: [] })))).toBe('cada');
    });

    it('la trama porta l\'àrea neta i el perímetre amb l\'illa', () => {
        expect(magnituds([entitats()[3]])).toMatchObject({ area: 29.75, perimetre: 24 });
    });

    it('intueix la font de cada paràmetre pel nom', () => {
        expect(PAVIMENT.parametres.map(fontPerDefecte)).toEqual(['area', 'perimetre', 'sistema']);
    });
});

describe('inserir una zona per sala', () => {
    const assignacio = { A: 'area', P: 'perimetre' };
    // Agrupades pel rètol: el menjador són les dues polilínies.
    const zones = () => agrupaEntitats(entitats(), 'retol');

    it('cada sala és una instància amb els seus paràmetres i les partides es comparteixen', () => {
        const r = muntaInstancies(PAVIMENT, zones(), { assignacio, comuns: { h: 0.08 }, dibuix: 'planta.dwg' });
        expect(r.instancies.map(i => i.nom)).toEqual(['Cuina', 'Menjador', 'Estar']);
        expect(r.parametres.filter(p => p.nomOriginal === 'A').map(p => [p.nom, p.valor])).toEqual([['A', 12], ['A_2', 23], ['A_3', 29.75]]);
        expect(r.parametres.filter(p => p.nomOriginal === 'h').every(p => p.valor === 0.08)).toBe(true);
        expect(r.chapters).toHaveLength(1);
        expect(r.chapters[0].items.map(i => i.code)).toEqual(['GRES', 'SOCOL']);
        const gres = r.chapters[0].items[0];
        expect(gres.measurements.filter(m => m.zona).map(m => m.description)).toEqual(['Cuina', 'Menjador', 'Estar']);
        expect(r.instancies[1].cad).toEqual({ handles: ['2F2', '2F3'], assignacio, dibuix: 'planta.dwg' });
    });

    it('les quantitats són les de cada sala: 64,75 m² de paviment i 63 m de sòcol', () => {
        const r = muntaInstancies(PAVIMENT, zones(), { assignacio });
        const resolt = resolveFormules(r.chapters, r.parametres).chapters[0];
        expect(round2(calcItemTotalQty(resolt.items[0]))).toBe(64.75);
        expect(round2(calcItemTotalQty(resolt.items[1]))).toBe(63);
        expect(round2(calcChapterTotal(resolt, {}))).toBe(round2(64.75 * 30 + 63 * 8));
    });

    it('no xoca amb els paràmetres ni amb els noms d\'instància del projecte', () => {
        const r = muntaInstancies(PAVIMENT, zones().slice(0, 1), {
            assignacio,
            parametresProjecte: [{ id: 'x', nom: 'A', valor: 1 }],
            sistemesProjecte: [{ id: 'y', nom: 'Cuina' }],
        });
        expect(r.parametres.find(p => p.nomOriginal === 'A').nom).toBe('A_2');
        expect(r.instancies[0].nom).toBe('Cuina 2');
    });

    it('fusionar arbres suma les línies de la mateixa partida', () => {
        const a = [{ code: 'C', items: [{ code: 'X', unit: 'm', measurements: [{ id: 1 }] }] }];
        const b = [{ code: 'C', items: [{ code: 'X', unit: 'm', measurements: [{ id: 2 }] }, { code: 'Y', unit: 'm', measurements: [] }] }];
        const f = fusionaArbres(a, b);
        expect(f[0].items.map(i => [i.code, i.measurements.length])).toEqual([['X', 2], ['Y', 0]]);
    });
});

describe('vincle amb el dibuix', () => {
    const assignacio = { A: 'area', P: 'perimetre' };
    const projecte = () => {
        const es = entitats();
        const r = muntaInstancies(PAVIMENT, [
            { nom: 'Cuina', entitats: [es[0]], handles: ['2F1'] },
            { nom: 'Estar', entitats: [es[3]], handles: ['2F4'] },
        ], { assignacio });
        return { chapters: r.chapters, parametres: r.parametres, condicions: r.condicions, sistemes: r.instancies };
    };

    it('reconeix les entitats que ja són d\'una zona', () => {
        expect(instanciesVinculades(projecte().sistemes, entitats()).map(i => i.nom)).toEqual(['Cuina', 'Estar']);
    });

    it('en tornar-les a copiar modificades, actualitza els paràmetres i deixa la resta per a zones noves', () => {
        // La cuina s'ha fet més gran: 4 × 3,5 = 14 m², 15 m de perímetre.
        const modificades = entitats().map(e => (e.handle === '2F1' ? { ...e, area: 14, length: 15 } : e));
        const r = actualitzaDesDeCad(projecte(), modificades);
        expect(r.canvis).toEqual([
            { instancia: 'Cuina', parametre: 'A', abans: 12, despres: 14 },
            { instancia: 'Cuina', parametre: 'P', abans: 14, despres: 15 },
        ]);
        expect(r.budget.parametres.find(p => p.nom === 'A').valor).toBe(14);
        expect(r.noves.map(e => e.handle)).toEqual(['2F2', '2F3']);
        const resolt = resolveFormules(r.budget.chapters, r.budget.parametres).chapters[0];
        expect(round2(calcItemTotalQty(resolt.items[0]))).toBe(14 + 29.75);
    });

    it('sense canvis no toca res, i una zona amb entitats que falten es diu', () => {
        const r = actualitzaDesDeCad(projecte(), entitats());
        expect(r.canvis).toEqual([]);
        const nomesCuina = actualitzaDesDeCad({ ...projecte(), sistemes: projecte().sistemes.map(i => (i.nom === 'Cuina' ? { ...i, cad: { ...i.cad, handles: ['2F1', 'ESBORRADA'] } } : i)) }, entitats());
        expect(nomesCuina.incompletes).toEqual(['Cuina']);
    });
});

describe('la mateixa polilínia per a sistemes diferents', () => {
    const FALS_SOSTRE = { ...PAVIMENT, nom: 'Fals sostre de placa' };
    const zones = () => agrupaEntitats(entitats(), 'retol');
    const projecte = () => {
        const r = muntaInstancies(PAVIMENT, zones(), { assignacio: { A: 'area', P: 'perimetre' }, idGaleria: 'pav' });
        return { chapters: r.chapters, parametres: r.parametres, condicions: r.condicions, sistemes: r.instancies };
    };

    it('les entitats ja fetes amb el paviment estan lliures per al fals sostre, però no per al paviment', () => {
        const b = projecte();
        expect(entitatsLliures(b.sistemes, entitats(), { idGaleria: 'pav', nomSistema: 'Paviment de gres' })).toEqual([]);
        expect(entitatsLliures(b.sistemes, entitats(), { idGaleria: 'fs', nomSistema: 'Fals sostre de placa' })).toHaveLength(4);
    });

    it('sense id de galeria (inserit a mà), es compara pel nom del sistema', () => {
        const sistemes = projecte().sistemes.map(i => ({ ...i, cad: { ...i.cad, galeria: undefined } }));
        expect(entitatsLliures(sistemes, entitats(), { idGaleria: 'pav', nomSistema: 'Paviment de gres' })).toEqual([]);
        expect(entitatsLliures(sistemes, entitats(), { idGaleria: 'fs', nomSistema: 'Fals sostre de placa' })).toHaveLength(4);
    });

    it('el fals sostre de les mateixes sales té les seves zones i paràmetres, i actualitzar el dibuix les posa al dia totes', () => {
        const b = projecte();
        const fs = muntaInstancies(FALS_SOSTRE, zones(), {
            assignacio: { A: 'area', P: 'perimetre' }, idGaleria: 'fs',
            parametresProjecte: b.parametres, sistemesProjecte: b.sistemes,
        });
        expect(fs.instancies.map(i => i.nom)).toEqual(['Cuina 2', 'Menjador 2', 'Estar 2']);
        const tot = { ...b, parametres: [...b.parametres, ...fs.parametres], sistemes: [...b.sistemes, ...fs.instancies] };
        const modificades = entitats().map(e => (e.handle === '2F1' ? { ...e, area: 14, length: 15 } : e));
        const r = actualitzaDesDeCad(tot, modificades);
        expect(r.canvis.map(c => `${c.instancia}·${c.parametre}`)).toEqual(['Cuina·A', 'Cuina·P', 'Cuina 2·A_4', 'Cuina 2·P_4']);
        expect(r.vinculadesAmbSistema.map(v => v.sistema)).toEqual(['Paviment de gres', 'Paviment de gres', 'Paviment de gres', 'Fals sostre de placa', 'Fals sostre de placa', 'Fals sostre de placa']);
    });
});
