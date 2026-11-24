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
