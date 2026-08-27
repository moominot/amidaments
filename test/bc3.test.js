import { describe, it, expect } from 'vitest';
import { processBC3Data } from '../src/utils/bc3Parser';
import { generateBC3, nomFitxerCertificacio, dataFiebdc } from '../src/utils/bc3Writer';
import { calcChapterTotal, calcItemTotalQty, normalizeCode, round2 } from '../src/utils/calculations';
import { llegeixBC3, FITXERS, partides, partida } from './ajuda';

/**
 * El cicle complet contra el fitxer de referència.
 *
 * Comprovar només les quantitats no basta: els defectes §25 i §26 hi passaven pel mig —el PEM
 * se n'anava a 394.955,33 € i els capítols es reordenaven— i les quantitats quedaven intactes.
 * Per això aquí es fixen el PEM, el nombre de capítols, el seu ORDRE i les quantitats, i tot
 * plegat encadenant el cicle tres vegades.
 */

const PEM_REFERENCIA = 135202.54;

const pem = (chapters, prices) => round2(chapters.reduce((a, c) => a + calcChapterTotal(c, prices), 0));
const codisCapitol = (chapters) => chapters.map(c => normalizeCode(c.code)).join(',');
const quantitats = (chapters) => new Map(partides(chapters).map(n => [normalizeCode(n.code), round2(calcItemTotalQty(n))]));

const exporta = (resultat, opcions = {}) => generateBC3({
    budget: { name: 'Prova', chapters: resultat.chapters, certifications: [] },
    chapters: resultat.chapters,
    priceDatabase: resultat.prices,
    ...opcions,
});

describe('importació del fitxer de referència', () => {
    const r = processBC3Data(llegeixBC3(FITXERS.referencia));

    it('dona el PEM, els capítols i les partides de sempre', () => {
        expect(pem(r.chapters, r.prices)).toBe(PEM_REFERENCIA);
        expect(r.chapters).toHaveLength(24);
        expect(partides(r.chapters)).toHaveLength(248);
    });

    it('no hi llegeix cap fase de certificació', () => {
        expect(r.phases).toHaveLength(0);
    });
});

describe('cicle exportar → reimportar', () => {
    const original = processBC3Data(llegeixBC3(FITXERS.referencia));

    it('conserva PEM, capítols, ordre i quantitats tres vegades seguides', () => {
        const ordreOriginal = codisCapitol(original.chapters);
        const quantitatsOriginals = quantitats(original.chapters);

        let r = original;
        for (let volta = 1; volta <= 3; volta++) {
            r = processBC3Data(exporta(r));
            expect(pem(r.chapters, r.prices), `PEM a la volta ${volta}`).toBe(PEM_REFERENCIA);
            expect(r.chapters, `capítols a la volta ${volta}`).toHaveLength(24);
            expect(codisCapitol(r.chapters), `ordre a la volta ${volta}`).toBe(ordreOriginal);

            const ara = quantitats(r.chapters);
            quantitatsOriginals.forEach((valor, codi) => {
                expect(ara.get(codi), `quantitat de ${codi} a la volta ${volta}`).toBeCloseTo(valor, 2);
            });
        }
    });

    it('escriu el descomposat abans que els fills, o els preus es disparen', () => {
        // §25: una partida importada té els components a `breakdown` (amb rendiment) i a
        // `items` (sense). Escrivint els fills primer, tots els rendiments sortien a 1 i en
        // reimportar el preu unitari passava a ser la suma dels components.
        const bc3 = exporta(original);
        const d = bc3.split('\n').find(l => l.startsWith('~D|RE07.02'));
        expect(d, 'hi ha d\'haver un ~D de la partida').toBeTruthy();
        expect(d).not.toMatch(/\\1\\1\\/); // rendiments tots a 1 seria el símptoma
    });

    it('no perd el registre arrel ~D|##|, que és la llista de capítols', () => {
        // §26: `normalizeCode('##')` és la cadena buida i el parser el descartava.
        const bc3 = exporta(original);
        expect(bc3).toContain('~D|##|');
        const rt = processBC3Data(bc3);
        expect(rt.chapters).toHaveLength(24);
    });

    it('no escriu conceptes sense codi ni capítols buits', () => {
        let r = original;
        for (let i = 0; i < 3; i++) r = processBC3Data(exporta(r));
        expect(exporta(r)).not.toContain('\n~C||');
        expect(r.chapters.every(c => normalizeCode(c.code))).toBe(true);
    });
});

describe('forma dels registres', () => {
    const r = processBC3Data(llegeixBC3(FITXERS.referencia));
    const bc3 = exporta(r);

    it('el ~V declara pressupost amb els camps a lloc', () => {
        const v = bc3.split('\n')[0];
        expect(v.startsWith('~V|')).toBe(true);
        const camps = v.slice(3).split('|');
        expect(camps[1]).toMatch(/^FIEBDC-3\/2020\\\d{8}$/); // VERSIO\DDMMYYYY
        expect(camps[4]).toBe('ANSI');                       // JOC_CARÀCTERS
        expect(camps[6]).toBe('2');                          // TIPUS_INFORMACIO
        expect(processBC3Data(bc3).info.type).toBe(2);
    });

    it('el ~M porta el total al camp que toca i el TIPUS de línia buit', () => {
        // §23: abans les línies queien al camp de la POSICIO i el primer subcamp del bloc
        // portava la fase, que a la norma és el TIPUS («1» subtotal parcial, «2» acumulat).
        const m = bc3.split('\n').find(l => l.startsWith('~M|'));
        const camps = m.slice(3).split('|');
        expect(camps[1]).toBe('');                    // POSICIO buida
        expect(camps[2]).toMatch(/^[\d,]+$/);          // MEDICION_TOTAL numèric
        expect(camps[3].startsWith('\\')).toBe(true);  // el bloc comença amb el TIPUS buit
    });

    it('ja no escriu ~F ni ~Q', () => {
        // `~F` és documents adjunts i `~Q` són plecs de condicions: cap dels dos és una fase
        // ni una quantitat.
        expect(bc3).not.toContain('\n~F|');
        expect(bc3).not.toContain('\n~Q|');
    });
});

describe('certificacions com a fitxer propi', () => {
    const r = processBC3Data(llegeixBC3(FITXERS.referencia));
    const cert = { id: 'c1', name: 'Certificació juliol', date: '2026-07-31', approved: false, method: 'origin' };

    // Certifiquem la meitat de cada partida del primer capítol amb contingut.
    const capitol = r.chapters.find(c => partides([c]).length >= 4);
    const seves = partides([capitol]);
    seves.forEach((p, i) => {
        const total = calcItemTotalQty(p);
        p.certifications = i === 0
            ? { c1: { quantity: 0, measurements: [
                { id: 'a', description: 'planta baixa', units: 1, length: round2(total / 4), width: 1, height: 1 },
                { id: 'b', description: 'planta pis', units: 1, length: round2(total / 4), width: 1, height: 1 }] } }
            : { c1: { quantity: round2(total / 2), measurements: [] } };
    });

    const bc3 = generateBC3({
        budget: { name: 'Prova', chapters: r.chapters, certifications: [cert] },
        chapters: r.chapters, priceDatabase: r.prices,
        certification: { cert, numero: 1 },
    });
    const llegit = processBC3Data(bc3);

    it('es declara amb TIPUS_INFORMACIO 3, número i data', () => {
        expect(llegit.info.type).toBe(3);
        expect(llegit.info.certNumber).toBe(1);
        expect(llegit.info.certDate).toBe('2026-07-31');
        expect(dataFiebdc('2026-07-31')).toBe('31072026');
    });

    it('segueix la convenció de nom de la norma', () => {
        expect(nomFitxerCertificacio('Reforma', 1)).toBe('Reforma#certification 0001');
        expect(nomFitxerCertificacio('Reforma', 12)).toBe('Reforma#certification 0012');
    });

    it('té la mateixa estructura que el pressupost, no només les partides certificades', () => {
        const pressupost = processBC3Data(exporta(r));
        expect(llegit.chapters).toHaveLength(pressupost.chapters.length);
        expect(partides(llegit.chapters)).toHaveLength(partides(pressupost.chapters).length);
    });

    it('els amidaments són els certificats i les partides no certificades hi surten a zero', () => {
        const q = quantitats(llegit.chapters);
        seves.forEach(p => {
            const esperat = round2(p.certifications.c1.measurements.length
                ? p.certifications.c1.measurements.reduce((a, m) => a + m.units * m.length * m.width * m.height, 0)
                : p.certifications.c1.quantity);
            expect(q.get(normalizeCode(p.code)), `certificat de ${p.code}`).toBeCloseTo(esperat, 1);
        });
        const cap = partides(r.chapters).find(p => !p.certifications?.c1);
        expect(q.get(normalizeCode(cap.code))).toBe(0);
    });

    it('hi ha un ~M per concepte, certificat o no', () => {
        const codis = new Set(partides(r.chapters).map(p => normalizeCode(p.code)));
        expect(bc3.split('\n').filter(l => l.startsWith('~M|'))).toHaveLength(codis.size);
    });
});

describe('compatibilitat amb els fitxers antics', () => {
    it('un ~F amb forma de fase es continua llegint', () => {
        const antic = [
            '~V|X|FIEBDC-3/2016|PreuArq|ANSI',
            '~F|1|20260731|Certificació juliol',
            '~C|CAP||Capítol|0|0|0|0\\0\\0',
            '~C|PART|m2|Partida|10|0|0|0\\0\\0',
            '~D|CAP|PART\\1\\1',
            '~M|PART||10|\\linia\\10\\1\\1\\1\\|',
        ].join('\n');
        const r = processBC3Data(antic);
        expect(r.phases).toHaveLength(1);
        expect(r.phases[0].name).toBe('Certificació juliol');
    });

    it('un ~F de document adjunt de veritat no es pren per una fase', () => {
        const adjunt = '~C|PART|m2|Partida|10|0|0|0\\0\\0\n~F|PART|2\\planol.pdf;\\Plànol\\|';
        expect(processBC3Data(adjunt).phases).toHaveLength(0);
    });
});

describe('conceptes orfes', () => {
    it('una llista plana de partides sense estructura entra sencera', () => {
        const pla = [
            '~C|P1|m2|Partida solta|10|0|0|0\\0\\0',
            '~C|P2|ml|Una altra|5|0|0|0\\0\\0',
            '~C|mo001|h|Peó ordinari|18|0|0|0\\0\\0',
            '~M|P1||3|\\linia\\3\\1\\1\\1\\|',
            '~M|P2||4|\\linia\\4\\1\\1\\1\\|',
        ].join('\n');
        const r = processBC3Data(pla);
        expect(r.chapters.map(c => c.code).sort()).toEqual(['P1', 'P2']);
        // El peó no té amidament ni descomposat: és banc de preus, no una partida d'obra.
        expect(r.prices.mo001).toBeTruthy();
    });

    it('els conceptes de residu de CYPE no entren com a partides del projecte', () => {
        // §29: importar una partida n'afegia divuit, amb els disset codis de gestió de residus.
        const r = processBC3Data(llegeixBC3(FITXERS.demolicio));
        expect(r.chapters).toHaveLength(1);
        expect(partida(r.chapters, 'DCE010')).toBeTruthy();
        expect(Object.keys(r.prices).length).toBeGreaterThan(15); // però sí que hi són, al banc
    });
});
