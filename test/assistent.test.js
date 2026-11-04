import { describe, it, expect } from 'vitest';
import { llegeixNavegacio, llegeixFitxa, llegeixPartidaBC3, arrelCype } from '../src/utils/assistent/cype';
import { executaEina, validaInput, posaPartidaCype, ErrorEina, DEFINICIONS } from '../src/utils/assistent/eines';
import { calcItemTotalQty, getItemUnitPrice, normalizeCode, round2 } from '../src/utils/calculations';
import { opcionsPeticio, einesWeb, costUs } from '../src/utils/assistent/models';
import { parseCadClipboard } from '../src/utils/cadPaste';
import { resumCad } from '../src/utils/cadSistemes';
import { llegeixDocument, FORMAT_SISTEMA } from '../src/utils/sistemesDoc';
import { llegeixBC3, FITXERS } from './ajuda';

/**
 * Eines de l'assistent. La lectura del Generador de Preus es prova amb HTML sintètic que
 * reprodueix l'estructura de les pàgines (no se'n desa cap còpia al repositori); la importació,
 * amb els BC3 reals de CYPE de `test/fixtures`.
 */

const BASE = 'https://generadordeprecios.info/obra_nueva';

const enllac = (href, icona, titol) =>
    `<a href="${href}" class="nav-link">\n<div class="d-flex">\n<span class="nav-link-icon">\n${icona}</span>\n${titol}</div></a>`;

describe('lectura del Generador de Preus', () => {
    it('separa capítols i partides per la icona i ignora el que no és fill directe', () => {
        const url = `${BASE}/Cimentaciones/Superficiales.html`;
        const html = `<html><head><title>Superficiales. Cimentaciones. España</title></head><body>
            ${enllac(`${BASE}/Cimentaciones.html`, 'C', 'Cimentaciones')}
            ${enllac(`${BASE}/Cimentaciones/Superficiales/Zapatas_corridas.html`, 'CSV', 'Zapatas corridas')}
            ${enllac(`${BASE}/Cimentaciones/Superficiales/Zapatas_corridas/CSV010_Zapata.html`, 'm³', 'Néta: no hi ha de sortir')}
            ${enllac(`${BASE}/Cimentaciones/Superficiales/CSL010_Losa_de.html`, 'm³', 'Losa de cimentaci&oacute;n')}
            ${enllac(`${BASE}/Cimentaciones/Superficiales/Capa_de_hormigon.html`, 'm²', 'Capa de hormig&#243;n')}
            ${enllac(`${BASE}/Cimentaciones/Superficiales/Zapatas_corridas.html`, 'CSV', 'Repetit')}
        </body></html>`;
        const r = llegeixNavegacio(html, url);
        expect(r.titol).toBe('Superficiales. Cimentaciones. España');
        expect(r.capitols).toEqual([{ codi: 'CSV', titol: 'Zapatas corridas', url: `${BASE}/Cimentaciones/Superficiales/Zapatas_corridas.html` }]);
        expect(r.partides).toEqual([
            { codi: 'CSL010', unitat: 'm³', titol: 'Losa de cimentación', url: `${BASE}/Cimentaciones/Superficiales/CSL010_Losa_de.html` },
            { codi: null, unitat: 'm²', titol: 'Capa de hormigón', url: `${BASE}/Cimentaciones/Superficiales/Capa_de_hormigon.html` },
        ]);
    });

    it('a l\'arrel, els fills són els de la carpeta', () => {
        const html = `<html>${enllac(`${BASE}/Cimentaciones.html`, 'C', 'Cimentaciones')}${enllac(`${BASE}/0_Actuaciones.html`, '0', 'Actuaciones previas')}</html>`;
        const r = llegeixNavegacio(html, `${BASE}/`);
        expect(r.capitols.map(c => c.codi)).toEqual(['C', '0']);
    });

    it('llegeix la fitxa: títol, unitat, BC3 i opcions amb la triada', () => {
        const html = `<html><head><title>
Precio en España de m³ de Zapata corrida de cimentación de hormigón armado. Generador de precios de la construcción. CYPE Ingenieros, S.A.</title></head>
            <a data-href="${BASE}/_bc3_2/CSV010.bc3" href="javascript:void(0)">BC3</a>
            <fieldset><legend class="x"> Tipo de vertido</legend>
              <div><input checked id="m_1" type="radio"><label class="l"><div> Desde camión</div></label></div>
              <div><input onclick="x()" id="m_2" type="radio"><label class="l"><a href="#"><div> Con bomba</div></a></label></div>
            </fieldset>
            <fieldset><legend>Documentació</legend><div>Res a triar</div></fieldset>
        </html>`;
        expect(llegeixFitxa(html)).toEqual({
            titol: 'Zapata corrida de cimentación de hormigón armado',
            unitat: 'm³',
            bc3: `${BASE}/_bc3_2/CSV010.bc3`,
            opcions: [{ nom: 'Tipo de vertido', valors: ['Desde camión', 'Con bomba'], triat: 'Desde camión' }],
        });
    });

    it('treu la partida d\'un BC3 de CYPE amb el seu arbre i sense els components fills', () => {
        const r = llegeixPartidaBC3(llegeixBC3(FITXERS.pilar));
        expect(r.chapters.map(c => normalizeCode(c.code))).toEqual(['E']);
        expect(normalizeCode(r.partida.code)).toBe('EHS010');
        expect(r.partida.items).toEqual([]);
        expect(r.partida.breakdown).toHaveLength(15);
        expect(getItemUnitPrice(r.partida, r.prices)).toBe(824.73);
    });
});

describe('validació dels inputs', () => {
    it('comprova obligatoris, tipus, enums i camps desconeguts', () => {
        expect(validaInput('crea_capitol', { codi: 'A', descripcio: 'X' })).toBeNull();
        expect(validaInput('crea_capitol', { codi: 'A' })).toMatch(/falta descripcio/);
        expect(validaInput('crea_capitol', { codi: 1, descripcio: 'X' })).toMatch(/s'esperava string/);
        expect(validaInput('crea_capitol', { codi: 'A', descripcio: 'X', color: 'blau' })).toMatch(/camp desconegut color/);
        expect(validaInput('consulta_preus', { tipus: 'ferro' })).toMatch(/ha de ser/);
        expect(validaInput('posa_linies', { partida: 'P', linies: [{ descripcio: 'a', ll: 'L*2', am: 3 }] })).toBeNull();
        expect(validaInput('posa_linies', { partida: 'P', linies: [{ descripcio: 'a', ll: true }] })).toMatch(/linies\[0\]\.ll/);
        expect(validaInput('crea_partida', { codi: 'P', unitat: 'm2', descripcio: 'x', capitol: 'A', preu: NaN })).toMatch(/preu/);
        expect(validaInput('no_existeix', {})).toMatch(/desconeguda/);
    });

    it('totes les definicions tenen nom, descripció i esquema d\'objecte', () => {
        DEFINICIONS.forEach(d => {
            expect(d.name).toMatch(/^[a-z_]+$/);
            expect(d.description.length).toBeGreaterThan(20);
            expect(d.input_schema.type).toBe('object');
        });
    });
});

describe('eines sobre el projecte', () => {
    const buit = () => ({
        budget: { id: 'b', name: 'Prova', chapters: [], certifications: [] },
        priceDatabase: { mo001: { code: 'mo001', summary: 'Oficial 1a', unit: 'h', price: 20 } },
    });
    const fes = async (estat, ...passos) => {
        let e = estat;
        const resultats = [];
        for (const [nom, input] of passos) {
            const r = await executaEina(nom, input, e);
            e = r.estat;
            resultats.push(r.resultat);
        }
        return { estat: e, resultats };
    };
    const partida = (estat, codi) => {
        let trobada = null;
        const busca = (ns) => ns.forEach(n => { if (normalizeCode(n.code) === codi) trobada = n; busca([...(n.subChapters || []), ...(n.items || [])]); });
        busca(estat.budget.chapters);
        return trobada;
    };

    it('crea capítols, paràmetres, partides i línies amb fórmula', async () => {
        const { estat, resultats } = await fes(buit(),
            ['crea_capitol', { codi: 'B', descripcio: 'BANC' }],
            ['crea_capitol', { codi: 'B.1', descripcio: 'OBRA', pare: 'B' }],
            ['posa_parametre', { nom: 'L', valor: 3, unitat: 'm', min: 0.5 }],
            ['posa_parametre', { nom: 'A', formula: '2*0,2', unitat: 'm' }],
            ['crea_partida', { codi: 'B01', unitat: 'm2', descripcio: 'Rajola', capitol: 'B.1', preu: 10, font: 'https://exemple.cat, 2026-11' }],
            ['posa_linies', { partida: 'B01', linies: [{ descripcio: 'Cara superior', ll: 'L', am: 'A' }, { descripcio: 'Extrems', ud: 2, ll: 'A', am: 0.2 }] }],
        );
        expect(resultats[3]).toMatchObject({ fet: true, nom: 'A', valor: 0.4 });
        expect(resultats[5]).toMatchObject({ fet: true, quantitat: 1.36 });   // 3 × 0,4 + 2 × 0,4 × 0,2
        expect(estat.budget.chapters[0].subChapters[0].items[0].code).toBe('B01');
        expect(estat.priceDatabase.B01).toMatchObject({ price: 10, unit: 'm2', font: 'https://exemple.cat, 2026-11' });
        const p = partida(estat, 'B01');
        expect(p.measurements[0].formules).toEqual({ length: 'L', width: 'A' });
        expect(p.measurements[0].units).toBe(1);
    });

    it('crea una partida amb descomposat reaprofitant la base de preus', async () => {
        const { estat, resultats } = await fes(buit(),
            ['crea_capitol', { codi: 'C', descripcio: 'C' }],
            ['crea_partida', {
                codi: 'C01', unitat: 'm2', descripcio: 'Arrebossat', capitol: 'C',
                descomposat: [
                    { codi: 'mo001', rendiment: 0.5, preu: 25 },
                    { codi: 'mtMORTER', rendiment: 2, descripcio: 'Morter', unitat: 'kg', preu: 3, font: 'https://botiga.cat (2026-10)' },
                    { codi: '%0200', rendiment: 2, descripcio: 'Mitjans auxiliars', unitat: '%', preu: 0 },
                ],
            }],
        );
        // 0,5 × 20 (el preu del projecte, no el que proposava) + 2 × 3 = 16, més un 2 %
        expect(resultats[1]).toMatchObject({ fet: true, preu: 16.32 });
        expect(resultats[1].avisos[0]).toMatch(/mo001 ja era a la base de preus a 20/);
        expect(estat.priceDatabase.mtMORTER).toMatchObject({ price: 3, unit: 'kg', font: 'https://botiga.cat (2026-10)' });
        expect(getItemUnitPrice(partida(estat, 'C01'), estat.priceDatabase)).toBe(16.32);
    });

    it('torna errors entenedors', async () => {
        const e = (await fes(buit(), ['crea_capitol', { codi: 'C', descripcio: 'C' }])).estat;
        await expect(executaEina('crea_partida', { codi: 'X', unitat: 'm', descripcio: 'x', capitol: 'NO', preu: 1 }, e)).rejects.toThrow(/No hi ha cap capítol amb el codi NO/);
        await expect(executaEina('crea_capitol', { codi: 'C', descripcio: 'C' }, e)).rejects.toThrow(/Ja hi ha/);
        await expect(executaEina('crea_partida', { codi: 'X', unitat: 'm', descripcio: 'x', capitol: 'C', descomposat: [{ codi: 'mtNOU', rendiment: 1 }] }, e)).rejects.toThrow(ErrorEina);
        await expect(executaEina('crea_partida', { codi: 'X', unitat: 'm', descripcio: 'x', capitol: 'C' }, e)).rejects.toThrow(/preu o un descomposat/);
        await expect(executaEina('posa_parametre', { nom: '1x', valor: 1 }, e)).rejects.toThrow(/no vàlid/);
        await expect(executaEina('posa_linies', { partida: 'NO', linies: [] }, e)).rejects.toThrow(/No hi ha cap partida/);
    });

    it('diu quines línies tenen errors de fórmula', async () => {
        const { resultats } = await fes(buit(),
            ['crea_capitol', { codi: 'C', descripcio: 'C' }],
            ['crea_partida', { codi: 'C01', unitat: 'm', descripcio: 'x', capitol: 'C', preu: 1 }],
            ['posa_linies', { partida: 'C01', linies: [{ descripcio: 'Mal', ll: 'Z*2' }] }],
        );
        expect(resultats[2].errors_de_formula).toEqual(['Mal: Paràmetre desconegut: Z']);
        expect(resultats[2].quantitat).toBe(0);
    });

    it('condicions, lectura del projecte, consulta de preus i esborrar', async () => {
        const { estat, resultats } = await fes(buit(),
            ['posa_parametre', { nom: 'P1', valor: 1.5 }],
            ['posa_parametre', { nom: 'P2', valor: 1.2 }],
            ['posa_condicio', { expressio: 'P2>=P1', missatge: 'La màxima no pot ser menor' }],
            ['crea_capitol', { codi: 'C', descripcio: 'OBRA' }],
            ['crea_partida', { codi: 'C01', unitat: 'm', descripcio: 'Vorada', capitol: 'C', preu: 12 }],
            ['posa_linies', { partida: 'C01', linies: [{ descripcio: 'a', ll: 5 }] }],
            ['llegeix_projecte', {}],
            ['consulta_preus', { cerca: 'ofici' }],
            ['consulta_preus', { tipus: 'partida' }],
            ['llegeix_partida', { codi: 'C01' }],
        );
        expect(resultats[2]).toMatchObject({ ok: false });
        expect(resultats[6]).toMatchObject({ pem: 60, condicions: [{ expressio: 'P2>=P1', ok: false }] });
        expect(resultats[6].arbre[0]).toMatchObject({ codi: 'C', import: 60, fills: [{ codi: 'C01', quantitat: 5, preu: 12, import: 60 }] });
        expect(resultats[7].resultats.map(r => r.codi)).toEqual(['mo001']);
        expect(resultats[8].resultats.map(r => r.codi)).toEqual(['C01']);
        expect(resultats[9].linies).toEqual([{ descripcio: 'a', ud: 1, ll: 5, am: 0, al: 0 }]);
        const e2 = (await executaEina('esborra', { codi: 'C01' }, estat)).estat;
        expect(e2.budget.chapters[0].items).toEqual([]);
        const e3 = (await executaEina('esborra', { parametre: 'P1' }, e2)).estat;
        expect(e3.budget.parametres.map(p => p.nom)).toEqual(['P2']);
    });
});

describe('importar una partida de CYPE', () => {
    const pilar = () => llegeixPartidaBC3(llegeixBC3(FITXERS.pilar));
    const buit = () => ({ budget: { id: 'b', chapters: [] }, priceDatabase: {} });

    it('amb el seu arbre de capítols, fusionat per codi amb el del projecte', () => {
        const projecte = {
            budget: { id: 'b', chapters: [{ id: 'e', code: 'E#', description: 'Estructuras', subChapters: [], items: [] }] },
            priceDatabase: {},
        };
        const r = posaPartidaCype(projecte, pilar());
        expect(r.estat.budget.chapters).toHaveLength(1);
        expect(r.estat.budget.chapters[0].description).toBe('Estructuras');    // el capítol del projecte es queda
        expect(normalizeCode(r.estat.budget.chapters[0].subChapters[0].code)).toBe('EH');
        expect(r.resultat).toMatchObject({ fet: true, codi: 'EHS010', preu: 824.73 });
    });

    it('no la duplica, però la pot posar amb un altre codi dins d\'un capítol', () => {
        const e = posaPartidaCype(buit(), pilar()).estat;
        expect(() => posaPartidaCype(e, pilar())).toThrow(/ja és al projecte/);
        const e2 = posaPartidaCype({ ...e, budget: { ...e.budget, chapters: [...e.budget.chapters, { id: 'x', code: 'X', subChapters: [], items: [] }] } },
            pilar(), { capitol: 'X', codi: 'EHS010b' }).estat;
        const x = e2.budget.chapters.find(c => c.code === 'X');
        expect(x.items.map(i => i.code)).toEqual(['EHS010b']);
        expect(e2.priceDatabase.EHS010b).toBeTruthy();
    });

    it('els preus del projecte manen sobre els de CYPE', () => {
        const p = pilar();
        const componentCodi = normalizeCode(p.partida.breakdown[0].code);
        const projecte = { budget: { id: 'b', chapters: [] }, priceDatabase: { [componentCodi]: { code: componentCodi, price: 0, unit: 'x', summary: 'del projecte' } } };
        const r = posaPartidaCype(projecte, p);
        expect(r.estat.priceDatabase[componentCodi].summary).toBe('del projecte');
    });

    it('per l\'eina, amb la xarxa injectada', async () => {
        const xarxa = { baixaPartidaCype: async () => pilar() };
        const r = await executaEina('cype_importa', { url_bc3: 'https://x/_bc3/EHS010.bc3' }, buit(), { xarxa });
        expect(r.resum).toMatch(/Importada EHS010/);
        expect(calcItemTotalQty(r.estat.budget.chapters[0].subChapters[0].subChapters[0].items[0])).toBe(0);
    });
});

describe('model i esforç', () => {
    it('Opus i Sonnet porten el reintent en un altre model; Haiku no', () => {
        const o = opcionsPeticio('claude-opus-5-5', 'high');
        expect(o).toMatchObject({ model: 'claude-opus-5-5', thinking: { type: 'adaptive' }, output_config: { effort: 'high' }, fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'] });
        expect(opcionsPeticio('claude-sonnet-5-5', 'low')).toMatchObject({ model: 'claude-sonnet-5-5', fallbacks: 'default', output_config: { effort: 'low' } });
        const h = opcionsPeticio('claude-haiku-5-5', 'max');
        expect(h.model).toBe('claude-haiku-5-5');
        expect(h.fallbacks).toBeUndefined();
        expect(h.betas).toBeUndefined();
    });

    it('un model o un esforç desconeguts tornen als de per defecte', () => {
        expect(opcionsPeticio('model-antic', 'molt').model).toBe('claude-opus-5-5');
        expect(opcionsPeticio('model-antic', 'molt').output_config.effort).toBe('high');
    });

    it('Haiku fa servir les eines web bàsiques', () => {
        expect(einesWeb('claude-opus-5-5').map(e => e.type)).toEqual(['web_search_20260209', 'web_fetch_20260209']);
        expect(einesWeb('claude-haiku-5-5').map(e => e.type)).toEqual(['web_search_20250305', 'web_fetch_20250910']);
    });

    it('el cost va amb els preus del model, i Haiku canvia de tarifa passats 100.000 tòquens', () => {
        const us = { input_tokens: 1e6, output_tokens: 1e6 };
        expect(costUs(us, 'claude-opus-5-5')).toBeCloseTo(24);
        expect(costUs(us, 'claude-sonnet-5-5')).toBeCloseTo(12);
        expect(costUs(us, 'claude-haiku-5-5')).toBeCloseTo(3); // > 100.000: 0,50 + 2,50
        expect(costUs({ input_tokens: 50000, output_tokens: 1e6 }, 'claude-haiku-5-5')).toBeCloseTo(0.005 + 0.5);
        expect(costUs({ cache_read_input_tokens: 1e6 }, 'claude-opus-5-5')).toBeCloseTo(0.2);
    });
});

describe('idioma del Generador de Preus', () => {
    it('per defecte en català; en castellà si es tria', () => {
        expect(arrelCype()).toBe('https://generadordepreus.info/obra_nova/');
        expect(arrelCype('ca')).toBe('https://generadordepreus.info/obra_nova/');
        expect(arrelCype('es')).toBe('https://generadordeprecios.info/obra_nueva/');
        expect(arrelCype('xx')).toBe('https://generadordepreus.info/obra_nova/');
    });

    it('cype_navega passa a la xarxa l\'idioma triat', async () => {
        const crides = [];
        const xarxa = { navegaCype: async (url, idioma) => { crides.push([url, idioma]); return { url, titol: 'Arrel', capitols: [], partides: [] }; } };
        await executaEina('cype_navega', {}, { budget: { chapters: [] }, priceDatabase: {} }, { xarxa, idioma: 'es' });
        expect(crides).toEqual([[undefined, 'es']]);
    });
});

describe('eina tradueix', () => {
    const estat = () => ({
        budget: {
            chapters: [
                { id: 'c1', code: '01', description: 'Fábricas', subChapters: [], items: [
                    { id: 'p1', code: 'P1', unit: 'm2', description: 'Muro de bloque', fullDescription: 'Muro de bloque de hormigón', price: 10, measurements: [{ id: 'l1', description: 'Fachada', units: 2, length: 3 }] },
                    { id: 'p2', code: 'P2', unit: 'm2', description: 'Enfoscado', price: 5, measurements: [] },
                ] },
            ],
            parametres: [], condicions: [],
        },
        priceDatabase: { P1: { code: 'P1', price: 10, summary: 'Muro de bloque' } },
    });
    const crides = [];
    const tradueix = async (textos, idioma) => {
        crides.push({ textos, idioma });
        return { mapa: new Map(textos.map(t => [t, `[${idioma}] ${t}`])), pendents: 0, errors: [] };
    };

    it('tradueix només les partides demanades, amb el descomposat i la base de preus', async () => {
        crides.length = 0;
        const r = await executaEina('tradueix', { idioma: 'ca', codis: ['P1'] }, estat(), { tradueix });
        const [p1, p2] = r.estat.budget.chapters[0].items;
        expect(p1.description).toBe('[ca] Muro de bloque');
        expect(p1.fullDescription).toBe('[ca] Muro de bloque de hormigón');
        expect(p1.measurements[0].description).toBe('[ca] Fachada');
        expect(p1.price).toBe(10);
        expect(p2.description).toBe('Enfoscado');
        expect(r.estat.budget.chapters[0].description).toBe('Fábricas');
        expect(r.estat.priceDatabase.P1.summary).toBe('[ca] Muro de bloque');
        expect(r.resultat).toMatchObject({ fet: true, traduits: 3, pendents: 0 });
        expect(crides).toHaveLength(1);
    });

    it('sense codis, tot el projecte; sense línies si es demana', async () => {
        const r = await executaEina('tradueix', { idioma: 'en', linies: false }, estat(), { tradueix });
        expect(r.estat.budget.chapters[0].description).toBe('[en] Fábricas');
        expect(r.estat.budget.chapters[0].items[1].description).toBe('[en] Enfoscado');
        expect(r.estat.budget.chapters[0].items[0].measurements[0].description).toBe('Fachada');
    });

    it('avisa dels codis que no hi són i falla si no n\'hi ha cap', async () => {
        const r = await executaEina('tradueix', { idioma: 'ca', codis: ['P2', 'NO'] }, estat(), { tradueix });
        expect(r.resultat.codis_no_trobats).toEqual(['NO']);
        await expect(executaEina('tradueix', { idioma: 'ca', codis: ['NO'] }, estat(), { tradueix })).rejects.toThrow(/cap partida/);
    });

    it('valida l\'idioma', () => {
        expect(validaInput('tradueix', { idioma: 'ca' })).toBeNull();
        expect(validaInput('tradueix', { idioma: 'de' })).toMatch(/ca, es, en, fr/);
        expect(validaInput('tradueix', {})).toMatch(/falta idioma/);
    });
});

describe('eina posa_esquema', () => {
    const estat = () => ({ budget: { chapters: [], parametres: [], condicions: [] }, priceDatabase: {} });
    const SVG = '<svg viewBox="0 0 100 60"><rect x="10" y="10" width="80" height="40" fill="none" stroke="#000"/><text x="50" y="8">B</text></svg>';

    it('desa un SVG com a esquema, amb l\'xmlns que li falta', async () => {
        const r = await executaEina('posa_esquema', { svg: SVG }, estat(), {});
        expect(r.estat.budget.esquema.dades).toMatch(/^data:image\/svg\+xml;base64,/);
        const text = new TextDecoder().decode(Uint8Array.from(atob(r.estat.budget.esquema.dades.split(',')[1]), c => c.charCodeAt(0)));
        expect(text).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox/);
        expect(r.resultat).toMatchObject({ fet: true });
    });

    it('accepta accents i signes (UTF-8)', async () => {
        const r = await executaEina('posa_esquema', { svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Alçada ≥ 2 m²</text></svg>' }, estat(), {});
        const text = new TextDecoder().decode(Uint8Array.from(atob(r.estat.budget.esquema.dades.split(',')[1]), c => c.charCodeAt(0)));
        expect(text).toContain('Alçada ≥ 2 m²');
    });

    it('rebutja el que no és un SVG o porta scripts', async () => {
        await expect(executaEina('posa_esquema', { svg: '<div>no</div>' }, estat(), {})).rejects.toThrow(/SVG sencer/);
        await expect(executaEina('posa_esquema', { svg: '<svg onload="x()"></svg>' }, estat(), {})).rejects.toThrow(/scripts/);
        await expect(executaEina('posa_esquema', { svg: '<svg><script>x()</script></svg>' }, estat(), {})).rejects.toThrow(/scripts/);
        await expect(executaEina('posa_esquema', { svg: SVG, treu: true }, estat(), {})).rejects.toThrow(/o bé/);
    });

    it('fa servir una imatge adjunta i el treu', async () => {
        const esquema = { dades: 'data:image/png;base64,iVBORw0KGgo=', nom: 'croquis.png' };
        const r = await executaEina('posa_esquema', { adjunt: 'croquis.png' }, estat(), { esquemaDAdjunt: async (nom) => ({ ...esquema, nom }) });
        expect(r.estat.budget.esquema).toEqual(esquema);
        const t = await executaEina('posa_esquema', { treu: true }, r.estat, {});
        expect(t.estat.budget.esquema).toBeUndefined();
        expect((await executaEina('llegeix_projecte', {}, r.estat, {})).resultat.te_esquema).toBe(true);
    });
});

describe('eines del CAD als sistemes', () => {
    // Les mateixes tres sales que a cadSistemes.test.js: 64,75 m² i 63 m en total.
    const T = '\t';
    const fila = (...c) => c.join(T);
    const lisp = (cuina = ['14.0000', '12.0000']) => [
        fila('AMIDAMENTS-CAD', '2', 'planta.dwg'),
        fila('LWPOLYLINE', '1', ...cuina, 'A-PAVIMENT', '', '2F1', 'Cuina | 12,00 m²'),
        fila('LWPOLYLINE', '1', '18.0000', '20.0000', 'A-PAVIMENT', '', '2F2', 'Menjador'),
        fila('LWPOLYLINE', '1', '7.0000', '3.0000', 'A-PAVIMENT', '', '2F3', 'MENJADOR'),
        fila('HATCH', '1', '24.0000', '29.7500', 'A-TRAMA', '', '2F4', 'Estar'),
    ].join('\r\n');
    const linia = (id, formules) => ({ id, description: 'Superfície', units: 1, length: 0, width: 0, height: 0, formules });
    const PAVIMENT = llegeixDocument({
        format: FORMAT_SISTEMA, versio: 1, nom: 'Paviment de gres', descripcio: '',
        parametres: [
            { id: 'a', nom: 'A', valor: 10, unitat: 'm2', descripcio: 'Superfície', min: 0.5 },
            { id: 'p', nom: 'P', valor: 12, unitat: 'm', descripcio: 'Perímetre' },
            { id: 'h', nom: 'h', valor: 0.07, unitat: 'm', descripcio: 'Alçada del sòcol' },
        ],
        condicions: [],
        chapters: [{ id: 'c', code: 'PAV', description: 'PAVIMENTS', subChapters: [], items: [
            { id: 'p1', code: 'GRES', unit: 'm2', description: 'Paviment de gres', price: 30, measurements: [linia('l1', { length: 'A' })] },
            { id: 'p2', code: 'SOCOL', unit: 'm', description: 'Sòcol de gres', price: 8, measurements: [linia('l2', { length: 'P' })] },
        ] }],
        prices: {},
    });
    const ctx = (text = lisp()) => ({
        cad: () => parseCadClipboard(text),
        galeria: { llista: () => [{ id: 'g1', nom: 'Paviment de gres', descripcio: '' }], llegeix: () => PAVIMENT },
    });
    const buit = () => ({ budget: { chapters: [], parametres: [], condicions: [], sistemes: [] }, priceDatabase: {} });

    it('el model rep una taula amb el nom de cada sala', () => {
        const t = resumCad(parseCadClipboard(lisp()), 'cad1');
        expect(t).toMatch(/^\[Entitats del CAD «cad1»: 4 de planta\.dwg/);
        expect(t.split('\n')[2]).toBe(['0', 'LWPOLYLINE', 'tancada', '12', '14', 'A-PAVIMENT', 'Cuina', 'Cuina | 12,00 m²'].join('\t'));
    });

    it('galeria_sistemes dona els paràmetres', async () => {
        const r = await executaEina('galeria_sistemes', {}, buit(), ctx());
        expect(r.resultat.sistemes[0]).toMatchObject({ id: 'g1', nom: 'Paviment de gres' });
        expect(r.resultat.sistemes[0].parametres.map(p => p.nom)).toEqual(['A', 'P', 'h']);
    });

    it('insereix una zona per sala, amb els valors comuns', async () => {
        const r = await executaEina('insereix_zones_cad', { sistema: 'paviment de gres', agrupacio: 'retol', comuns: { h: 0.08 } }, buit(), ctx());
        expect(r.resultat.zones.map(z => [z.nom, z.parametres])).toEqual([
            ['Cuina', { A: 12, P: 14, h: 0.08 }],
            ['Menjador', { A_2: 23, P_2: 25, h_2: 0.08 }],
            ['Estar', { A_3: 29.75, P_3: 24, h_3: 0.08 }],
        ]);
        expect(r.resultat.pem).toBe(round2(64.75 * 30 + 63 * 8));
        expect(r.estat.budget.sistemes.map(i => i.nom)).toEqual(['Cuina', 'Menjador', 'Estar']);
    });

    it('zones explícites per índex, i les partides que ja hi són hi reben les línies', async () => {
        const primer = await executaEina('insereix_zones_cad', { sistema: 'g1', zones: [{ nom: 'Planta baixa', entitats: [0, 3] }] }, buit(), ctx());
        expect(primer.resultat.zones[0].parametres.A).toBe(41.75);
        const segon = await executaEina('insereix_zones_cad', { sistema: 'g1', zones: [{ nom: 'Menjador', entitats: [1, 2] }] }, primer.estat, ctx());
        const pav = segon.estat.budget.chapters;
        expect(pav).toHaveLength(1);
        expect(pav[0].items[0].measurements.filter(m => m.zona).map(m => m.description)).toEqual(['Planta baixa', 'Menjador']);
        expect(segon.resultat.pem).toBe(round2(64.75 * 30 + 63 * 8));
    });

    it('les mateixes entitats poden fer zones d\'un altre sistema', async () => {
        const fet = await executaEina('insereix_zones_cad', { sistema: 'g1', agrupacio: 'retol' }, buit(), ctx());
        const dos = {
            ...ctx(),
            galeria: {
                llista: () => [{ id: 'g1', nom: 'Paviment de gres' }, { id: 'g2', nom: 'Fals sostre' }],
                llegeix: (id) => (id === 'g2' ? { ...PAVIMENT, nom: 'Fals sostre' } : PAVIMENT),
            },
        };
        const r = await executaEina('insereix_zones_cad', { sistema: 'Fals sostre', agrupacio: 'retol' }, fet.estat, dos);
        expect(r.resultat.zones.map(z => z.nom)).toEqual(['Cuina 2', 'Menjador 2', 'Estar 2']);
        await expect(executaEina('insereix_zones_cad', { sistema: 'g1', agrupacio: 'retol' }, r.estat, dos)).rejects.toThrow(/Cap entitat|cap entitat nova/i);
    });

    it('no repeteix entitats que ja són d\'una zona, i actualitza_zones_cad les posa al dia', async () => {
        const fet = await executaEina('insereix_zones_cad', { sistema: 'g1', agrupacio: 'retol' }, buit(), ctx());
        await expect(executaEina('insereix_zones_cad', { sistema: 'g1', zones: [{ nom: 'Cuina bis', entitats: [0] }] }, fet.estat, ctx()))
            .rejects.toThrow(/actualitza_zones_cad/);
        const r = await executaEina('actualitza_zones_cad', {}, fet.estat, ctx(lisp(['15.0000', '14.0000'])));
        expect(r.resultat.canvis.map(c => [c.instancia, c.parametre, c.despres])).toEqual([['Cuina', 'A', 14], ['Cuina', 'P', 15]]);
        expect(r.resultat.entitats_noves).toBe(0);
    });

    it('diu què falla: un paràmetre que no existeix, una condició o un sistema que no és a la galeria', async () => {
        await expect(executaEina('insereix_zones_cad', { sistema: 'g1', assignacio: { X: 'area' } }, buit(), ctx())).rejects.toThrow(/no té els paràmetres X/);
        await expect(executaEina('insereix_zones_cad', { sistema: 'g1', agrupacio: 'retol', assignacio: { A: 'llargada' } }, buit(), ctx())).rejects.toThrow(/condicions/);
        await expect(executaEina('insereix_zones_cad', { sistema: 'Coberta' }, buit(), ctx())).rejects.toThrow(/Hi ha: Paviment de gres/);
        await expect(executaEina('insereix_zones_cad', { sistema: 'g1' }, buit(), { ...ctx(), cad: () => null })).rejects.toThrow(/AMIDA/);
    });

    it('valida l\'assignació', () => {
        expect(validaInput('insereix_zones_cad', { sistema: 'g1', assignacio: { A: 'area' }, comuns: { h: 0.1 } })).toBeNull();
        expect(validaInput('insereix_zones_cad', { sistema: 'g1', assignacio: { A: 'volum' } })).toMatch(/assignacio\.A/);
        expect(validaInput('insereix_zones_cad', { sistema: 'g1', comuns: { h: 'alt' } })).toMatch(/comuns\.h/);
    });
});
