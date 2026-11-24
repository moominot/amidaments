import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseStep, decodificaText } from '../src/utils/ifc/step.js';
import { llegeixIfc, trobaQuantitat } from '../src/utils/ifc/lector.js';

/**
 * Fixture real: `ingetrazo-prova.ifc` (IngeTrazo 0.6.3.2, IFC4), 15 elements i un espai.
 * Les xifres d'aquí avall es van contrastar amb la geometria del fitxer (àrea i volum de cada
 * `IfcFacetedBrep` calculats a part): els volums coincideixen amb els Qto, amb dues excepcions
 * que es documenten més avall (revestiment i rampa).
 */
const model = llegeixIfc(readFileSync('test/fixtures/ingetrazo-prova.ifc', 'utf8'));
const per = (nom) => model.elements.find(e => e.nom === nom);
const q = (nom, qto) => trobaQuantitat(per(nom), qto).valor;

describe('STEP: sintaxi', () => {
    it('decodifica els escapaments', () => {
        expect(decodificaText('Construcci\\X2\\00F3\\X0\\')).toBe('Construcció');
        expect(decodificaText('a\\X\\E7b')).toBe('açb');
        expect(decodificaText('\\S\\i')).toBe('é'); // 0x69 + 128 = 0xE9
        expect(decodificaText('\\\\x')).toBe('\\x');
    });

    it('llegeix valors, entitats en diverses línies i textos amb ; ) i cometes', () => {
        const r = parseStep(`ISO-10303-21;
HEADER;FILE_SCHEMA(('IFC4'));ENDSEC;
DATA;
/* comentari ; amb punt i coma */
#1=IFCWALL('g',#5,'a;b) ''c''',$,
  (#2,#3),.T.,1.5E-3,IFCLABEL('x'),*);
ENDSEC;
END-ISO-10303-21;`);
        expect(r.capcalera.FILE_SCHEMA).toEqual([['IFC4']]);
        const e = r.entitats.get(1);
        expect(e.tipus).toBe('IFCWALL');
        expect(e.args[2]).toBe("a;b) 'c'");
        expect(e.args[3]).toBeNull();
        expect(e.args[4]).toEqual([{ ref: 2 }, { ref: 3 }]);
        expect(e.args[5]).toEqual({ enum: 'T' });
        expect(e.args[6]).toBe(0.0015);
        expect(e.args[7]).toEqual({ tipus: 'IFCLABEL', valor: 'x' });
        expect(e.args[8]).toEqual({ derivat: true });
    });

    it('rebutja el que no és STEP', () => {
        expect(parseStep('hola')).toBeNull();
        expect(llegeixIfc('{"a":1}')).toBeNull();
    });
});

describe('IFC: model de prova', () => {
    it('capçalera, projecte i planta', () => {
        expect(model.info.esquema).toBe('IFC4');
        expect(model.info.programa).toBe('IngeTrazo 0.6.3.2');
        expect(model.info.projecte).toEqual({ nom: 'Prova 1', descripcio: 'Prova de exportació' });
        expect(model.plantes).toHaveLength(1);
        expect(model.plantes[0].nom).toBe('Storey');
        expect(model.avisos).toEqual([]);
    });

    it('16 elements, tots a la planta (l\'espai per agregació)', () => {
        expect(model.elements).toHaveLength(16);
        expect(model.elements.every(e => e.planta === model.plantes[0].id)).toBe(true);
        expect(model.elements.filter(e => e.espai).map(e => e.nom)).toEqual(['Espai']);
        const classes = model.elements.map(e => e.classe);
        expect(classes).toContain('IFCWALL');
        expect(classes).toContain('IFCREINFORCINGBAR');
        expect(new Set(model.elements.map(e => e.guid)).size).toBe(16);
    });

    it('els Qto coincideixen amb la geometria (àrees i volums contrastats)', () => {
        expect(q('Mur', 'NetSideArea')).toBeCloseTo(5, 6);
        expect(q('Mur', 'GrossVolume')).toBeCloseTo(1.0, 6);       // 2 × 2,5 × 0,2
        expect(q('Llosa', 'NetArea')).toBeCloseTo(4, 6);
        expect(q('Llosa', 'GrossVolume')).toBeCloseTo(0.8, 6);
        expect(q('Columna', 'GrossVolume')).toBeCloseTo(0.172208, 6);
        expect(q('Biga', 'Length')).toBeCloseTo(2, 6);
        expect(q('Biga', 'GrossVolume')).toBeCloseTo(0.12, 6);
        expect(q('Sabata', 'GrossVolume')).toBeCloseTo(1.125, 6);  // 1,5 × 1,5 × 0,5
        expect(q('Escala', 'GrossVolume')).toBeCloseTo(2.4, 6);
        expect(q('Porta', 'Area')).toBeCloseTo(1.89, 6);           // 0,9 × 2,1
        expect(q('Finestra', 'Area')).toBeCloseTo(1.2, 6);         // 1,2 × 1,0
        expect(q('Barana', 'Length')).toBeCloseTo(2, 6);
        expect(q('Espai', 'GrossVolume')).toBeCloseTo(10, 6);      // 2 × 2 × 2,5
        expect(q('Espai', 'NetFloorArea')).toBeCloseTo(4, 6);
    });

    it('armadura: el pes en kg és el volum de l\'acer per 7850 kg/m³', () => {
        const pes = trobaQuantitat(per('Armadura'), 'Weight');
        expect(pes.magnitud).toBe('pes');
        expect(pes.valor).toBeCloseTo(3.9969, 4);
        expect(pes.valor).toBeCloseTo(0.000509 * 7850, 2);
    });

    it('el conjunt i la magnitud es guarden amb cada quantitat', () => {
        const qt = trobaQuantitat(per('Mur'), 'NetSideArea');
        expect(qt).toMatchObject({ conjunt: 'Qto_WallBaseQuantities', magnitud: 'area' });
        expect(per('Mur').quantitats.map(x => x.nom)).toEqual(
            ['Height', 'Length', 'Width', 'GrossSideArea', 'NetSideArea', 'GrossVolume']);
    });

    it('revestiment: el GrossArea del Qto (8,4) és la superfície total de la caixa, no la cara de 4 m²', () => {
        // El lector no ho corregeix —això és de la fase 2—, però ha de portar el número tal com és.
        expect(q('Revestiment', 'GrossArea')).toBeCloseTo(8.4, 6);
        expect(q('Revestiment', 'NetArea')).toBeCloseTo(8.4, 6);
    });

    it('rampa: ve sense volum i amb l\'àrea declarada del Qto', () => {
        expect(trobaQuantitat(per('Rampa'), 'GrossVolume')).toBeNull();
        expect(q('Rampa', 'GrossArea')).toBeCloseTo(6.231099, 6);
    });
});

describe('IFC: unitats', () => {
    const peça = (unitats) => `ISO-10303-21;
HEADER;FILE_SCHEMA(('IFC4'));ENDSEC;
DATA;
#1=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#2=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);
#3=IFCSIUNIT(*,.MASSUNIT.,.KILO.,.GRAM.);
#4=IFCUNITASSIGNMENT((${unitats}));
#5=IFCPROJECT('p',$,'P',$,$,$,$,(),#4);
#6=IFCBUILDINGSTOREY('s',$,'S',$,$,$,$,$,.ELEMENT.,3000.);
#7=IFCWALL('w',$,'Mur',$,$,$,$,$,$);
#8=IFCQUANTITYLENGTH('Length',$,$,2000.,$);
#9=IFCQUANTITYAREA('NetSideArea',$,$,5.,$);
#10=IFCQUANTITYWEIGHT('Weight',$,$,12.,$);
#11=IFCQUANTITYCOUNT('Count',$,$,3.,$);
#12=IFCELEMENTQUANTITY('q',$,'Qto',$,$,(#8,#9,#10,#11));
#13=IFCRELDEFINESBYPROPERTIES('r1',$,$,$,(#7),#12);
#14=IFCRELCONTAINEDINSPATIALSTRUCTURE('r2',$,$,$,(#7),#6);
ENDSEC;
END-ISO-10303-21;`;

    it('un model en mil·límetres es porta a metres, i les àrees declarades queden com estan', () => {
        const m = llegeixIfc(peça('#1,#2,#3'));
        const mur = m.elements[0];
        expect(m.unitats.longitud).toBe(0.001);
        expect(trobaQuantitat(mur, 'Length').valor).toBeCloseTo(2, 9);
        expect(trobaQuantitat(mur, 'NetSideArea').valor).toBe(5);   // AREAUNIT = m²
        expect(trobaQuantitat(mur, 'Weight').valor).toBe(12);       // KILO GRAM = kg
        expect(trobaQuantitat(mur, 'Count').valor).toBe(3);
        expect(m.plantes[0].elevacio).toBe(3000);
    });

    it('si no declara àrea, la dedueix de la longitud (mm → mm² = 1e-6 m²)', () => {
        const m = llegeixIfc(peça('#1,#3'));
        expect(trobaQuantitat(m.elements[0], 'NetSideArea').valor).toBeCloseTo(5e-6, 12);
    });

    it('sense IfcUnitAssignment, avisa i suposa metres', () => {
        const m = llegeixIfc(peça('#1').replace('#5=IFCPROJECT(\'p\',$,\'P\',$,$,$,$,(),#4);', ''));
        expect(m.avisos.join(' ')).toMatch(/unitats/);
    });

    it('unitats basades en conversió (polzades)', () => {
        const t = peça('#20,#2,#3')
            .replace('DATA;', `DATA;
#21=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#22=IFCMEASUREWITHUNIT(IFCLENGTHMEASURE(0.0254),#21);
#20=IFCCONVERSIONBASEDUNIT($,.LENGTHUNIT.,'INCH',#22);`);
        const m = llegeixIfc(t);
        expect(trobaQuantitat(m.elements[0], 'Length').valor).toBeCloseTo(2000 * 0.0254, 9);
    });
});

describe('IFC: models sense quantitats', () => {
    it('avisa que caldria la geometria', () => {
        const m = llegeixIfc(`ISO-10303-21;
HEADER;FILE_SCHEMA(('IFC2X3'));ENDSEC;
DATA;
#1=IFCUNITASSIGNMENT(());
#2=IFCPROJECT('p',$,'P',$,$,$,$,(),#1);
#3=IFCBUILDINGSTOREY('s',$,'S',$,$,$,$,$,.ELEMENT.,0.);
#4=IFCWALL('w',$,'Mur',$,$,$,$,$,$);
#5=IFCRELCONTAINEDINSPATIALSTRUCTURE('r',$,$,$,(#4),#3);
ENDSEC;
END-ISO-10303-21;`);
        expect(m.elements).toHaveLength(1);
        expect(m.elements[0].quantitats).toEqual([]);
        expect(m.avisos.join(' ')).toMatch(/geometria/);
    });
});

// ───────────────────────── Fase 2: geometria i pressupost ─────────────────────────
import { muntaPressupost, quantitatDeElement, reglaDeClasse } from '../src/utils/ifc/pressupost.js';

describe('IFC: geometria', () => {
    // Àrea i volum de cada closca calculats a part a partir dels vèrtexs del fitxer.
    it('volum, superfície total i cara més gran de cada sòlid', () => {
        const g = (nom) => per(nom).geometria;
        expect(g('Mur')).toMatchObject({ tancada: true, parcial: false });
        expect(g('Mur').volum).toBeCloseTo(1.0, 6);
        expect(g('Mur').superficie).toBeCloseTo(11.8, 6);
        expect(g('Mur').caraMajor).toBeCloseTo(5.0, 6);        // 2 × 2,5
        expect(g('Llosa').volum).toBeCloseTo(0.8, 6);
        expect(g('Llosa').superficie).toBeCloseTo(9.6, 6);
        expect(g('Revestiment').superficie).toBeCloseTo(8.4, 6);
        expect(g('Revestiment').caraMajor).toBeCloseTo(4.0, 6); // 2 × 2
        expect(g('Revestiment').volum).toBeCloseTo(0.2, 6);
        expect(g('Pilot').volum).toBeCloseTo(0.36, 6);          // el polígon de 12 cares, no el cercle
        expect(g('Espai').volum).toBeCloseTo(10, 6);
    });

    it('la rampa és una superfície oberta: sense volum', () => {
        const r = per('Rampa').geometria;
        expect(r.tancada).toBe(false);
        expect(r.volum).toBeNull();
        expect(r.superficie).toBeCloseTo(9.031099, 6);
    });

    it('els Qto de volum coincideixen amb els de la geometria a tot el model', () => {
        for (const e of model.elements) {
            const qv = e.quantitats.find(x => x.magnitud === 'volum');
            if (!qv || !e.geometria?.volum) continue;
            expect(qv.valor, e.nom).toBeCloseTo(e.geometria.volum, 4);
        }
    });
});

describe('IFC: quantitat d\'un element', () => {
    it('mur en m²: NetSideArea, sense avís', () => {
        const q = quantitatDeElement(per('Mur'), 'm2');
        expect(q).toMatchObject({ valor: 5, nom: 'NetSideArea', origen: 'qto' });
        expect(q.avis).toBeUndefined();
    });

    it('revestiment: l\'àrea declarada (8,4) és la superfície total; es fa servir la cara (4)', () => {
        const q = quantitatDeElement(per('Revestiment'), 'm2');
        expect(q.valor).toBeCloseTo(4, 6);
        expect(q).toMatchObject({ origen: 'geometria', sospitos: true });
        expect(q.declarat).toBeCloseTo(8.4, 6);
        expect(q.avis).toMatch(/superfície total/);
        // I es pot forçar el valor declarat.
        expect(quantitatDeElement(per('Revestiment'), 'm2', 'qto').valor).toBeCloseTo(8.4, 6);
    });

    it('sense Qto de volum, es pren de la geometria', () => {
        const q = quantitatDeElement(per('Porta'), 'm3');
        expect(q.valor).toBeCloseTo(0.0945, 6);
        expect(q.origen).toBe('geometria');
    });

    it('rampa en m²: no es pot contrastar i es manté el declarat; en m³, res', () => {
        expect(quantitatDeElement(per('Rampa'), 'm2').valor).toBeCloseTo(6.231099, 6);
        expect(quantitatDeElement(per('Rampa'), 'm3').valor).toBeNull();
    });
});

describe('IFC: pressupost', () => {
    const r = muntaPressupost(model);
    const partida = (nom) => r.chapters.flatMap(c => c.items).find(p => p.description === nom);
    const total = (p) => p.measurements.reduce((s, m) => s + m.units * (m.length || 1) * (m.width || 1) * (m.height || 1), 0);

    it('un capítol per classe i una partida per element; l\'espai no hi entra', () => {
        expect(r.chapters).toHaveLength(15);
        expect(r.chapters.flatMap(c => c.items)).toHaveLength(15);
        expect(partida('Espai')).toBeUndefined();
        expect(r.classes.find(c => c.classe === 'IFCSPACE')).toMatchObject({ inclou: false, exclosa: true });
    });

    it('unitats i amidaments de cada classe', () => {
        expect(partida('Mur')).toMatchObject({ unit: 'm2' });
        expect(total(partida('Mur'))).toBeCloseTo(5, 6);
        expect(partida('Biga')).toMatchObject({ unit: 'm' });
        expect(total(partida('Biga'))).toBeCloseTo(2, 6);
        expect(partida('Sabata')).toMatchObject({ unit: 'm3' });
        expect(total(partida('Sabata'))).toBeCloseTo(1.125, 6);
        expect(partida('Porta')).toMatchObject({ unit: 'ud' });
        expect(total(partida('Porta'))).toBe(1);
        expect(partida('Armadura')).toMatchObject({ unit: 'kg' });
        expect(total(partida('Armadura'))).toBeCloseTo(3.9969, 4);
        expect(total(partida('Revestiment'))).toBeCloseTo(4, 6);
    });

    it('l\'únic avís sospitós és el del revestiment; la rampa surt a 1 ud', () => {
        expect(r.avisos.filter(a => a.sospitos).map(a => a.nom)).toEqual(['Revestiment']);
        expect(total(partida('Rampa'))).toBe(1);
        expect(r.excloses).toEqual([]);
    });

    it('cada línia porta el GlobalId i els codis són únics i estables', () => {
        const linies = r.chapters.flatMap(c => c.items).flatMap(p => p.measurements);
        expect(linies.map(l => l.ifc.guid).sort()).toEqual(model.elements.filter(e => !e.espai).map(e => e.guid).sort());
        const codis = r.chapters.flatMap(c => c.items).map(p => p.code);
        expect(new Set(codis).size).toBe(15);
        expect(muntaPressupost(model).chapters.flatMap(c => c.items).map(p => p.code)).toEqual(codis);
        expect(Object.keys(r.prices).sort()).toEqual([...codis].sort());
    });

    it('canviar la unitat d\'una classe i exclou a mà', () => {
        const r2 = muntaPressupost(model, { classes: { IFCWALL: { unitat: 'm3' }, IFCDOOR: { inclou: false } }, exclou: [per('Biga').guid] });
        const ps = r2.chapters.flatMap(c => c.items);
        expect(ps.find(p => p.description === 'Mur')).toMatchObject({ unit: 'm3' });
        expect(total(ps.find(p => p.description === 'Mur'))).toBeCloseTo(1.0, 6);
        expect(ps.find(p => p.description === 'Porta')).toBeUndefined();
        expect(ps.find(p => p.description === 'Biga')).toBeUndefined();
        expect(r2.excloses.map(x => x.guid)).toContain(per('Biga').guid);
    });

    it('capítol únic', () => {
        const r3 = muntaPressupost(model, { capitols: 'unic' });
        expect(r3.chapters).toHaveLength(1);
        expect(r3.chapters[0].description).toBe('Prova 1');
        expect(r3.chapters[0].items).toHaveLength(15);
    });

    it('les classes conegudes i les que no', () => {
        expect(reglaDeClasse('IFCWALLSTANDARDCASE')).toMatchObject({ classe: 'IFCWALL', unitat: 'm2', inclou: true });
        expect(reglaDeClasse('IFCBUILDINGELEMENTPROXY')).toMatchObject({ unitat: 'ud', inclou: false, coneguda: false });
    });
});

describe('IFC: model de buildingSMART (Building-Architecture, IFC4)', () => {
    // Fitxer de la suite de certificació de buildingSMART (CC BY 4.0). Té una coberta composta
    // per dues lloses, elements contenuts al solar (sense planta) i classes que no són d'obra.
    const bsi = llegeixIfc(readFileSync('test/fixtures/bsi-building-architecture.ifc', 'utf8'));
    const r = muntaPressupost(bsi);
    const partides = r.chapters.flatMap(c => c.items);
    const suma = (p) => p.measurements.reduce((s, m) => s + m.length, 0);

    it('llegeix el model: 16 elements, una planta, els Qto en el seu lloc', () => {
        expect(bsi.info.esquema).toBe('IFC4');
        expect(bsi.plantes.map(p => p.nom)).toEqual(['00 groundfloor']);
        expect(bsi.elements).toHaveLength(16);
        expect(bsi.elements.filter(e => e.planta == null).length).toBeGreaterThan(0);   // la coberta és al solar
    });

    it('les lloses de la coberta tenen la coberta com a pare', () => {
        const coberta = bsi.elements.find(e => e.nom === 'house - roof');
        const lloses = bsi.elements.filter(e => e.nom.startsWith('house - roof - slab'));
        expect(lloses).toHaveLength(2);
        expect(lloses.every(l => l.pare === coberta.id)).toBe(true);
    });

    it('murs i lloses compten una sola vegada (la coberta, sense Qto, compta per les parts)', () => {
        expect(partides).toHaveLength(7);
        const murs = partides.filter(p => p.code.startsWith('IFC.MUR'));
        expect(murs).toHaveLength(4);
        expect(murs.reduce((s, p) => s + suma(p), 0)).toBeCloseTo(21.154 + 8.928 + 6.346 + 6.863, 2);
        const lloses = partides.filter(p => p.code.startsWith('IFC.LLO'));
        expect(lloses.map(suma).sort((a, b) => a - b).map(x => +x.toFixed(3))).toEqual([22.401, 25.75, 31.212]);
        expect(r.avisos).toEqual([]);
    });

    it('espais, zones, mobiliari i proxys no entren per defecte', () => {
        const fora = r.classes.filter(c => !c.inclou).map(c => c.classe).sort();
        expect(fora).toEqual(['IFCBUILDINGELEMENTPROXY', 'IFCCHIMNEY', 'IFCFURNITURE', 'IFCSPACE', 'IFCSPATIALZONE']);
    });
});

// ───────────────────────── Fase 3: classificacions i banc de preus ─────────────────────────
describe('IFC: classificacions', () => {
    // Dos murs d'un mateix tipus classificat (la classificació és al tipus, com fa Revit) i un tercer
    // amb la seva pròpia; el codi existeix al banc amb una altra unitat.
    const ifc = `ISO-10303-21;
HEADER;FILE_SCHEMA(('IFC4'));ENDSEC;
DATA;
#1=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#2=IFCUNITASSIGNMENT((#1));
#3=IFCPROJECT('p',$,'P',$,$,$,$,(),#2);
#4=IFCBUILDINGSTOREY('s',$,'Planta 0',$,$,$,$,$,.ELEMENT.,0.);
#5=IFCWALLTYPE('t1',$,'Paret 14 cm',$,$,$,$,$,$,.STANDARD.);
#6=IFCWALL('w1',$,'M1',$,$,$,$,$,$);
#7=IFCWALL('w2',$,'M2',$,$,$,$,$,$);
#8=IFCWALL('w3',$,'M3',$,$,$,$,$,$);
#9=IFCRELDEFINESBYTYPE('r1',$,$,$,(#6,#7),#5);
#10=IFCCLASSIFICATION('Uniclass','2015',$,'Uniclass 2015');
#11=IFCCLASSIFICATIONREFERENCE($,'EF_25_10',$,#10,$,$);
#12=IFCRELASSOCIATESCLASSIFICATION('r2',$,$,$,(#5),#11);
#13=IFCCLASSIFICATIONREFERENCE($,'ef_25_30',$,#10,$,$);
#14=IFCRELASSOCIATESCLASSIFICATION('r3',$,$,$,(#8),#13);
#20=IFCQUANTITYAREA('NetSideArea',$,$,10.,$);
#21=IFCQUANTITYVOLUME('NetVolume',$,$,2.,$);
#22=IFCELEMENTQUANTITY('q1',$,'Qto',$,$,(#20,#21));
#23=IFCQUANTITYAREA('NetSideArea',$,$,4.,$);
#24=IFCELEMENTQUANTITY('q2',$,'Qto',$,$,(#23));
#25=IFCRELDEFINESBYPROPERTIES('r4',$,$,$,(#6),#22);
#26=IFCRELDEFINESBYPROPERTIES('r5',$,$,$,(#7),#22);
#27=IFCRELDEFINESBYPROPERTIES('r6',$,$,$,(#8),#24);
#28=IFCRELCONTAINEDINSPATIALSTRUCTURE('r7',$,$,$,(#6,#7,#8),#4);
ENDSEC;
END-ISO-10303-21;`;
    const m = llegeixIfc(ifc);
    const banc = {
        EF_25_10: { code: 'EF_25_10', price: 41.5, summary: 'Paret de maó de 14 cm', unit: 'm2' },
        'EF_25_30': { code: 'EF_25_30', price: 120, summary: 'Paret de formigó', unit: 'm3' },
    };

    it('llegeix la classificació de l\'element, del seu tipus, i el nom del sistema', () => {
        const [m1, m2, m3] = m.elements;
        expect(m1.tipus).toBe('Paret 14 cm');
        expect(m1.classificacions).toEqual([{ sistema: 'Uniclass 2015', codi: 'EF_25_10', nom: null }]);
        expect(m2.classificacions[0].codi).toBe('EF_25_10');
        expect(m3.classificacions[0].codi).toBe('ef_25_30');
    });

    it('la classificació de l\'edifici no es pengen als elements del model de buildingSMART', () => {
        const bsi = llegeixIfc(readFileSync('test/fixtures/bsi-building-architecture.ifc', 'utf8'));
        expect(bsi.elements.every(e => e.classificacions.length === 0)).toBe(true);
    });

    it('sense banc, no es vincula res: partides pròpies', () => {
        const r = muntaPressupost(m);
        expect(r.chapters.flatMap(c => c.items).map(p => p.code)).toEqual(['IFC.MUR.01', 'IFC.MUR.02']);
    });

    it('amb banc, la partida pren el codi, el resum i el preu; i no es duplica el preu', () => {
        const r = muntaPressupost(m, { banc });
        const ps = r.chapters.flatMap(c => c.items);
        const p1 = ps.find(p => p.code === 'EF_25_10');
        expect(p1).toMatchObject({ description: 'Paret de maó de 14 cm', unit: 'm2', price: 41.5 });
        expect(p1.measurements.map(l => l.length)).toEqual([10, 10]);   // dos murs del mateix tipus
        expect(r.prices).toEqual({});                                   // totes dues són del banc
        expect(r.detall.filter(d => d.vinculada)).toHaveLength(2);
    });

    it('si el banc amida en una altra unitat, s\'hi passa quan tots els elements la tenen', () => {
        const clau = muntaPressupost(m).detall.find(d => d.codiBanc === 'EF_25_10').clau;
        const r = muntaPressupost(m, { banc, codis: { [clau]: 'ef_25_30' }, exclou: ['w3'] });    // coincidència sense majúscules
        const p = r.chapters.flatMap(c => c.items).find(x => x.unit === 'm3');
        expect(p.code).toBe('EF_25_30');
        expect(p.measurements.map(l => l.length)).toEqual([2, 2]);                // NetVolume dels dos murs
    });

    it('si algun element no té la unitat del banc, es queda en la seva i s\'avisa', () => {
        const r = muntaPressupost(m, { banc });
        const p = r.chapters.flatMap(c => c.items).find(x => x.code === 'EF_25_30');   // M3 només té àrea
        expect(p.unit).toBe('m2');
        expect(p.measurements.map(l => l.length)).toEqual([4]);
        expect(r.avisos.some(a => /no es pot obtenir/.test(a.text))).toBe(true);
    });

    it('dues partides d\'unitats diferents no es fusionen al mateix concepte', () => {
        const clau = muntaPressupost(m).detall.find(d => d.codiBanc === 'EF_25_10').clau;
        const r = muntaPressupost(m, { banc, codis: { [clau]: 'ef_25_30' } });   // M1+M2 en m³, M3 només en m²
        const ps = r.chapters.flatMap(c => c.items);
        expect(ps.filter(p => p.code === 'EF_25_30')).toHaveLength(1);
        expect(ps.some(p => p.code.startsWith('IFC.MUR'))).toBe(true);
        expect(r.avisos.some(a => /No es pot posar/.test(a.text))).toBe(true);
    });
});

describe('IFC: codi del banc triat a mà', () => {
    const banc = { MUR01: { code: 'MUR01', price: 50, summary: 'Paret de maó', unit: 'm3' } };
    const clauMur = muntaPressupost(model).detall.find(d => d.clau.includes('|Mur')).clau;

    it('una partida del fixture es vincula a un concepte en m³ i recalcula l\'amidament', () => {
        const r = muntaPressupost(model, { banc, codis: { [clauMur]: 'MUR01' } });
        const p = r.chapters.flatMap(c => c.items).find(x => x.code === 'MUR01');
        expect(p).toMatchObject({ unit: 'm3', price: 50, description: 'Paret de maó' });
        expect(p.measurements[0].length).toBeCloseTo(1.0, 6);           // volum del mur
        expect(p.measurements[0].ifc.guid).toBe(per('Mur').guid);
        expect(r.prices['MUR01']).toBeUndefined();
    });

    it('un codi que no és al banc no vincula res', () => {
        const r = muntaPressupost(model, { banc, codis: { [clauMur]: 'NOEXISTEIX' } });
        expect(r.chapters.flatMap(c => c.items).some(p => p.code === 'NOEXISTEIX')).toBe(false);
        expect(r.detall.find(d => d.clau === clauMur).vinculada).toBe(false);
    });

    it('dues partides al mateix concepte en fan una de sola', () => {
        const clauLlosa = muntaPressupost(model).detall.find(d => d.clau.includes('|Llosa')).clau;
        const bancM2 = { X: { code: 'X', price: 10, summary: 'Paret o llosa', unit: 'm2' } };
        const r = muntaPressupost(model, { banc: bancM2, codis: { [clauMur]: 'X', [clauLlosa]: 'X' } });
        const x = r.chapters.flatMap(c => c.items).filter(p => p.code === 'X');
        expect(x).toHaveLength(1);
        expect(x[0].measurements).toHaveLength(2);
    });
});

// ───────────────────────── Fase 4: reimportar per GlobalId ─────────────────────────
import { liniesIfc, teLiniesIfc, planificaActualitzacio, aplicaActualitzacio, resumActualitzacio } from '../src/utils/ifc/actualitza.js';

describe('IFC: reimportar sobre un projecte', () => {
    const importa = () => muntaPressupost(model).chapters;
    const clona = () => structuredClone(model);
    const elem = (m, nom) => m.elements.find(e => e.nom === nom);
    const setQ = (m, nom, qto, valor) => { elem(m, nom).quantitats.find(q => q.nom === qto).valor = valor; };
    const liniaDe = (chapters, nom) => [...liniesIfc(chapters).values()].find(x => x.node.description === nom);

    it('el projecte importat porta els GlobalId i s\'hi reconeix', () => {
        const ch = importa();
        expect(teLiniesIfc(ch)).toBe(true);
        expect(liniesIfc(ch).size).toBe(15);
        expect(teLiniesIfc([{ id: 'x', code: 'A', description: 'A', items: [] }])).toBe(false);
    });

    it('el mateix model: tot igual, res no canvia', () => {
        const ch = importa();
        const pla = planificaActualitzacio(ch, model);
        expect(pla).toMatchObject({ iguals: 15, canvis: [], conflictes: [], afegides: [], eliminades: [], avisos: [] });
        expect(pla.noves.chapters).toEqual([]);
        expect(aplicaActualitzacio(ch, pla, { treu: true, sobreescriu: true })).toEqual(ch);
    });

    it('un Qto que canvia (mur de 5 a 6 m²) s\'actualitza i es conserven el preu i la descripció', () => {
        const ch = importa();
        liniaDe(ch, 'Mur').node.price = 77;          // el preu que l'usuari hi hagi posat
        const m2 = clona(); setQ(m2, 'Mur', 'NetSideArea', 6);
        const pla = planificaActualitzacio(ch, m2);
        expect(pla.canvis).toHaveLength(1);
        expect(pla.canvis[0]).toMatchObject({ partida: liniaDe(ch, 'Mur').node.code, abans: 5, despres: 6 });
        const nou = aplicaActualitzacio(ch, pla);
        const mur = liniaDe(nou, 'Mur');
        expect(mur.linia.length).toBe(6);
        expect(mur.linia.ifc.valor).toBe(6);
        expect(mur.node.price).toBe(77);
        expect(mur.linia.id).toBe(liniaDe(ch, 'Mur').linia.id);
        expect(liniaDe(ch, 'Mur').linia.length).toBe(5);          // l'original, intacte
        // I una segona reimportació del mateix ja no troba canvis.
        expect(planificaActualitzacio(nou, m2).canvis).toEqual([]);
    });

    it('una línia editada a mà és un conflicte: no es toca si no es demana', () => {
        const ch = importa();
        liniaDe(ch, 'Llosa').linia.length = 3.5;      // l'usuari l'ha corregit
        const m2 = clona(); setQ(m2, 'Llosa', 'NetArea', 4.4);
        const pla = planificaActualitzacio(ch, m2);
        expect(pla.canvis).toEqual([]);
        expect(pla.conflictes).toHaveLength(1);
        expect(pla.conflictes[0].motiu).toMatch(/editat/);
        expect(liniaDe(aplicaActualitzacio(ch, pla), 'Llosa').linia.length).toBe(3.5);
        expect(liniaDe(aplicaActualitzacio(ch, pla, { sobreescriu: true }), 'Llosa').linia.length).toBe(4.4);
    });

    it('una línia editada a mà que el model no ha tocat ni és conflicte', () => {
        const ch = importa();
        liniaDe(ch, 'Llosa').linia.length = 3.5;
        const pla = planificaActualitzacio(ch, model);
        expect(pla.conflictes).toEqual([]);
        expect(pla.iguals).toBe(15);
    });

    it('una línia amb fórmula és un conflicte', () => {
        const ch = importa();
        liniaDe(ch, 'Biga').linia.formules = { length: 'L*2' };
        const m2 = clona(); setQ(m2, 'Biga', 'Length', 2.5);
        const pla = planificaActualitzacio(ch, m2);
        expect(pla.conflictes[0].motiu).toMatch(/fórmula/);
    });

    it('un element que desapareix: s\'avisa, i només s\'esborra si es demana', () => {
        const ch = importa();
        const m2 = clona(); m2.elements = m2.elements.filter(e => e.nom !== 'Biga');
        const pla = planificaActualitzacio(ch, m2);
        expect(pla.eliminades.map(e => e.descripcio)).toEqual(['Biga · Storey']);
        expect(liniesIfc(aplicaActualitzacio(ch, pla)).size).toBe(15);
        const sense = aplicaActualitzacio(ch, pla, { treu: true });
        expect(liniesIfc(sense).size).toBe(14);
        expect(resumActualitzacio(pla, { treu: true }).eliminades).toBe(1);
    });

    it('un element nou d\'un tipus que ja hi és va a la mateixa partida; d\'un tipus nou, com a partida nova', () => {
        const m2 = clona();
        // Segon mur del mateix tipus (nom «Mur») i un pilar d'un tipus que no hi era.
        const mur2 = structuredClone(elem(m2, 'Mur')); mur2.id = 9001; mur2.guid = 'GUID-MUR-2'; mur2.nom = 'Mur 2';
        mur2.quantitats.find(q => q.nom === 'NetSideArea').valor = 3;
        const pilar2 = structuredClone(elem(m2, 'Columna')); pilar2.id = 9002; pilar2.guid = 'GUID-PIL-2'; pilar2.nom = 'Pilar nou'; pilar2.tipus = 'Pilar rodó';
        m2.elements.push(mur2, pilar2);
        // El mur nou és del mateix tipus que «Mur»: com que no tenen tipus, es distingeixen pel nom; per això li donem el mateix tipus.
        elem(m2, 'Mur').tipus = 'Mur A'; mur2.tipus = 'Mur A';
        const ch2 = muntaPressupost((() => { const m = clona(); elem(m, 'Mur').tipus = 'Mur A'; return m; })()).chapters;

        const pla = planificaActualitzacio(ch2, m2);
        expect(pla.afegides).toHaveLength(1);
        expect(pla.afegides[0]).toMatchObject({ guid: 'GUID-MUR-2', partida: liniaDe(ch2, 'Mur A').node.code });
        expect(pla.afegides[0].linia.length).toBe(3);
        expect(pla.noves.chapters.flatMap(c => c.items).map(p => p.description)).toEqual(['Pilar rodó']);
        const nou = aplicaActualitzacio(ch2, pla);
        expect(liniaDe(nou, 'Mur A').node.measurements).toHaveLength(2);
    });

    it('les partides noves no trepitgen els codis ni els capítols del projecte', () => {
        const ch = importa();
        const m2 = clona();
        const pilar2 = structuredClone(elem(m2, 'Columna')); pilar2.id = 9002; pilar2.guid = 'GUID-PIL-2'; pilar2.nom = 'Pilar nou'; pilar2.tipus = 'Pilar rodó';
        const biga2 = structuredClone(elem(m2, 'Biga')); biga2.id = 9003; biga2.guid = 'GUID-BIG-2'; biga2.nom = 'Biga nova'; biga2.tipus = 'Biga mixta';
        m2.elements.push(pilar2, biga2);
        const pla = planificaActualitzacio(ch, m2);
        const codisProjecte = new Set([...liniesIfc(ch).values()].map(x => x.node.code));
        const nous = pla.noves.chapters.flatMap(c => c.items);
        expect(nous).toHaveLength(2);
        nous.forEach(p => expect(codisProjecte.has(p.code)).toBe(false));
        expect(nous.map(p => p.code)).toEqual(['IFC.BIG.02', 'IFC.PIL.02']);
        expect(Object.keys(pla.noves.prices).sort()).toEqual(['IFC.BIG.02', 'IFC.PIL.02']);
        // Els capítols «Bigues» i «Pilars» ja hi eren: se'n reaprofita el codi.
        const capitolBigues = ch.find(c => c.description === 'Bigues');
        expect(pla.noves.chapters.find(c => c.description === 'Bigues').code).toBe(capitolBigues.code);
    });

    it('s\'actualitza en la unitat de la partida del projecte (vinculada al banc en m³)', () => {
        const banc = { MUR01: { code: 'MUR01', price: 50, summary: 'Paret', unit: 'm3' } };
        const clau = muntaPressupost(model).detall.find(d => d.clau.includes('|Mur')).clau;
        const ch = muntaPressupost(model, { banc, codis: { [clau]: 'MUR01' } }).chapters;
        expect(liniaDe(ch, 'Paret').linia.length).toBeCloseTo(1.0, 6);
        const m2 = clona(); setQ(m2, 'Mur', 'GrossVolume', 1.5);
        const pla = planificaActualitzacio(ch, m2);
        const canvi = pla.canvis.find(c => c.partida === 'MUR01');
        expect(canvi).toMatchObject({ abans: 1, despres: 1.5, unitat: 'm3' });
    });
});

describe('IFC: lectura del fitxer', () => {
    it('UTF-8 i, si no hi cap, Windows-1252', async () => {
        const { decodificaIfc, llegeixFitxerIfc, LIMIT_IFC_MB } = await import('../src/utils/ifc/fitxer.js');
        expect(decodificaIfc(new TextEncoder().encode('Construcció'))).toBe('Construcció');
        expect(decodificaIfc(Uint8Array.from([67, 111, 110, 115, 116, 114, 117, 99, 99, 105, 243]).buffer)).toBe('Construcció');
        await expect(llegeixFitxerIfc({ name: 'gran.ifc', size: (LIMIT_IFC_MB + 1) * 1024 * 1024 })).rejects.toThrow(/límit/);
    });
});
