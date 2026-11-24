/**
 * Del model IFC a capítols i partides amb les seves línies d'amidament.
 *
 * Una partida per cada **tipus d'element** (`IfcTypeObject` o, si no en té, el nom) i una línia
 * d'amidament per element, amb el `GlobalId` guardat a `linia.ifc` perquè la reimportació el
 * pugui trobar. Els capítols són un per classe IFC (o un d'únic). No hi ha preus: les partides
 * entren a 0 i es posen o es vinculen després.
 *
 * Què es fa amb les quantitats:
 *   · Es pren la primera de la llista que correspon a la unitat (p. ex. `NetSideArea` per a m²).
 *   · Es contrasta amb la geometria. Si una àrea declarada és la **superfície total** d'un sòlid
 *     (el cas del `IfcCovering` d'IngeTrazo: 8,4 m² per a una cara de 4 m²), es fa servir la cara
 *     més gran i s'avisa. Si un volum declarat no quadra amb el calculat, es manté el declarat i
 *     s'avisa.
 *   · Sense quantitat declarada, un volum es pren de la geometria si es pot calcular.
 *   · Un conjunt amb parts (la coberta i les seves lloses) compta per les parts, si el conjunt no
 *     porta quantitats pròpies; si en porta, les parts no hi compten.
 */

import { normalizeCode } from '../calculations.js';
import { cadUnitKind } from '../cadPaste.js';

/** unitat → magnitud IFC i noms de quantitat per ordre de preferència */
const PER_UNITAT = {
    m2: { magnitud: 'area', noms: ['NetSideArea', 'NetArea', 'NetFloorArea', 'NetSurfaceArea', 'Area', 'GrossSideArea', 'GrossArea', 'GrossFloorArea', 'GrossSurfaceArea'] },
    m3: { magnitud: 'volum', noms: ['NetVolume', 'GrossVolume'] },
    m: { magnitud: 'longitud', noms: ['Length'] },
    kg: { magnitud: 'pes', noms: ['NetWeight', 'GrossWeight', 'Weight'] },
    ud: { magnitud: 'recompte', noms: [] },
};

export const UNITATS = Object.keys(PER_UNITAT);

/**
 * Classes IFC conegudes: unitat per defecte, capítol i abreviatura per als codis.
 * Les que no hi són (proxys, mobiliari…) surten desactivades i en unitats.
 */
export const CLASSES = {
    IFCWALL: { unitat: 'm2', capitol: 'Murs', abr: 'MUR' },
    IFCCURTAINWALL: { unitat: 'm2', capitol: 'Murs cortina', abr: 'MCO' },
    IFCSLAB: { unitat: 'm2', capitol: 'Lloses', abr: 'LLO' },
    IFCPLATE: { unitat: 'm2', capitol: 'Plaques', abr: 'PLA' },
    IFCROOF: { unitat: 'm2', capitol: 'Cobertes', abr: 'COB' },
    IFCCOVERING: { unitat: 'm2', capitol: 'Revestiments', abr: 'REV' },
    IFCCOLUMN: { unitat: 'm', capitol: 'Pilars', abr: 'PIL' },
    IFCBEAM: { unitat: 'm', capitol: 'Bigues', abr: 'BIG' },
    IFCMEMBER: { unitat: 'm', capitol: 'Elements estructurals', abr: 'ELE' },
    IFCPILE: { unitat: 'm', capitol: 'Pilots', abr: 'PLT' },
    IFCRAILING: { unitat: 'm', capitol: 'Baranes', abr: 'BAR' },
    IFCFOOTING: { unitat: 'm3', capitol: 'Fonaments', abr: 'FON' },
    IFCSTAIR: { unitat: 'ud', capitol: 'Escales', abr: 'ESC' },
    IFCSTAIRFLIGHT: { unitat: 'ud', capitol: 'Trams d\'escala', abr: 'TRE' },
    IFCRAMP: { unitat: 'ud', capitol: 'Rampes', abr: 'RAM' },
    IFCRAMPFLIGHT: { unitat: 'ud', capitol: 'Trams de rampa', abr: 'TRR' },
    IFCDOOR: { unitat: 'ud', capitol: 'Portes', abr: 'POR' },
    IFCWINDOW: { unitat: 'ud', capitol: 'Finestres', abr: 'FIN' },
    IFCREINFORCINGBAR: { unitat: 'kg', capitol: 'Armadures', abr: 'ARM' },
};

/** Classes que no són cap element d'obra: mai no entren. */
const EXCLOSES = new Set(['IFCSPACE', 'IFCSPATIALZONE', 'IFCOPENINGELEMENT', 'IFCANNOTATION', 'IFCGRID', 'IFCVIRTUALELEMENT']);

const ALIES = { IFCWALLSTANDARDCASE: 'IFCWALL', IFCSLABSTANDARDCASE: 'IFCSLAB', IFCSLABELEMENTEDCASE: 'IFCSLAB', IFCBEAMSTANDARDCASE: 'IFCBEAM', IFCCOLUMNSTANDARDCASE: 'IFCCOLUMN', IFCMEMBERSTANDARDCASE: 'IFCMEMBER', IFCDOORSTANDARDCASE: 'IFCDOOR', IFCWINDOWSTANDARDCASE: 'IFCWINDOW', IFCPLATESTANDARDCASE: 'IFCPLATE' };
export const classeBase = (classe) => ALIES[classe] || classe;

const nomNeteja = (classe) => {
    const s = classe.replace(/^IFC/, '').toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Configuració efectiva d'una classe: les regles per defecte amb el que l'usuari hi hagi canviat. */
export const reglaDeClasse = (classe, canvis = {}) => {
    const base = classeBase(classe);
    const def = CLASSES[base];
    const c = canvis[base] || {};
    return {
        classe: base,
        unitat: c.unitat || def?.unitat || 'ud',
        capitol: def?.capitol || `Altres (${nomNeteja(base)})`,
        abr: def?.abr || base.replace(/^IFC/, '').slice(0, 3),
        inclou: c.inclou ?? (!EXCLOSES.has(base) && !!def),
        exclosa: EXCLOSES.has(base),
        coneguda: !!def,
    };
};

const TOL_AREA_TOTAL = 0.005;
const TOL_VOLUM = 0.02;

/**
 * La quantitat d'un element per a una unitat, contrastada amb la geometria.
 *
 * @param {'qto'|'geometria'|undefined} forca  Què fer quan el Qto és sospitós (per defecte, la geometria).
 * @returns {{ valor:number, nom:string, origen:'qto'|'geometria', avis?:string } | { valor:null, avis:string }}
 */
export const quantitatDeElement = (element, unitat, forca) => {
    if (unitat === 'ud') return { valor: 1, nom: 'recompte', origen: 'qto' };
    const { magnitud, noms } = PER_UNITAT[unitat];
    const q = element.quantitats.filter(x => x.magnitud === magnitud && x.valor > 0);
    const trobada = noms.map(n => q.find(x => x.nom === n)).find(Boolean);
    const g = element.geometria;

    if (!trobada) {
        if (unitat === 'm3' && g?.volum > 0) {
            return { valor: g.volum, nom: 'volum de la geometria', origen: 'geometria',
                avis: 'No porta cap volum declarat: s\'ha calculat de la geometria.' };
        }
        return { valor: null, avis: 'No porta cap quantitat en aquesta unitat.' };
    }

    // Una àrea que és tota la superfície d'un sòlid: s'hi ha comptat les dues cares grans.
    if (unitat === 'm2' && g?.tancada && g.superficie > 0 && g.caraMajor > 0
        && Math.abs(trobada.valor - g.superficie) / g.superficie < TOL_AREA_TOTAL) {
        const avis = `«${trobada.nom}» (${trobada.valor.toFixed(2)} m²) és la superfície total de l'element, `
            + `no la d'una cara (${g.caraMajor.toFixed(2)} m²).`;
        if (forca !== 'qto') return { valor: g.caraMajor, nom: 'cara més gran', origen: 'geometria', avis, sospitos: true, declarat: trobada.valor };
        return { valor: trobada.valor, nom: trobada.nom, origen: 'qto', avis, sospitos: true, declarat: g.caraMajor };
    }
    if (unitat === 'm3' && g?.volum > 0 && Math.abs(trobada.valor - g.volum) / g.volum > TOL_VOLUM) {
        const avis = `El volum declarat (${trobada.valor.toFixed(3)} m³) no coincideix amb el de la geometria (${g.volum.toFixed(3)} m³).`;
        if (forca === 'geometria') return { valor: g.volum, nom: 'volum de la geometria', origen: 'geometria', avis, sospitos: true, declarat: trobada.valor };
        return { valor: trobada.valor, nom: trobada.nom, origen: 'qto', avis, sospitos: true, declarat: g.volum };
    }
    return { valor: trobada.valor, nom: trobada.nom, origen: 'qto' };
};

const liniaDe = (valor, unitat, camps) => ({
    id: crypto.randomUUID(),
    units: unitat === 'ud' ? valor : 1,
    length: unitat === 'ud' ? 0 : valor,
    width: 0,
    height: 0,
    ...camps,
});

const arrodoneix = (n) => Math.round(n * 1e6) / 1e6;

/**
 * La línia d'amidament d'un element en una unitat. `q.valor` és null si no en té quantitat.
 * La línia desa a `ifc` el `GlobalId`, d'on ha sortit la xifra (`origen`) i la xifra mateixa
 * (`valor`): amb aquesta darrera, en reimportar es veu si algú l'ha tocat a mà.
 */
export const liniaPerElement = (model, e, unitat, descripcioPartida, forca) => {
    const q = quantitatDeElement(e, unitat, forca);
    if (q.valor == null) return { q, e, linia: null };
    const planta = model.plantes.find(p => p.id === e.planta);
    const valor = arrodoneix(q.valor);
    return {
        q, e,
        linia: liniaDe(valor, unitat, {
            description: [e.nom, planta?.nom].filter(Boolean).join(' · ') || descripcioPartida,
            ifc: { guid: e.guid, classe: e.classe, quantitat: q.nom, origen: q.origen, valor },
        }),
    };
};

/** Entrada del banc per codi, sense distingir majúscules si no hi ha coincidència exacta. */
const entradaDelBanc = (banc, codi) => {
    if (!codi || !banc || /##$/.test(codi.trim())) return null;   // «root##» és el concepte arrel, no un preu
    const n = normalizeCode(codi);
    if (banc[n]) return banc[n];
    const minus = n.toLowerCase();
    const clau = Object.keys(banc).find(k => k.toLowerCase() === minus);
    return clau ? banc[clau] : null;
};

/**
 * Munta el pressupost a partir del model.
 *
 * @param {object} model  El que torna `llegeixIfc`.
 * @param {object} [opcions]
 * @param {Object<string,{unitat?:string, inclou?:boolean}>} [opcions.classes]  Canvis per classe.
 * @param {'classe'|'unic'} [opcions.capitols='classe']
 * @param {Object<string,'qto'|'geometria'>} [opcions.usa]  Per `guid`: què fer en una quantitat sospitosa.
 * @param {Set<string>|string[]} [opcions.exclou]  `guid`s que no entren.
 * @param {string} [opcions.prefix='IFC']  Prefix dels codis.
 * @param {Object<string,object>} [opcions.banc]  `priceDatabase`: les partides la classificació de les quals
 *   (o el codi triat a `codis`) hi és, es vinculen al concepte del banc: en prenen el codi, el resum, la unitat i el preu.
 * @param {Object<string,string>} [opcions.codis]  Codi del banc triat a mà per a cada partida (per `clau`).
 * @returns {{ chapters, prices, classes, avisos, excloses, total, detall, grups }}  `grups`: tots els grups (classe i tipus) amb els seus elements, exclosos inclosos; `memoria`: el que es desa a `budget.ifc`.  `detall`: per partida, `{ clau, nodeId, codiBanc, classificacio, vinculada, avis }`.
 */
export const muntaPressupost = (model, opcions = {}) => {
    const { classes: canvis = {}, capitols = 'classe', usa = {}, prefix = 'IFC', banc = null, codis = {} } = opcions;
    const exclouGuids = new Set(opcions.exclou || []);
    const avisos = [];
    const excloses = [];

    const perPare = new Map();
    model.elements.forEach(e => { if (e.pare != null) perPare.set(e.pare, [...(perPare.get(e.pare) || []), e]); });
    const ambQuantitats = (e) => e.quantitats.length > 0;

    // Resum per classe (el que el quadre ensenya per triar-les).
    const resumClasses = new Map();
    const regla = (e) => reglaDeClasse(e.classe, canvis);
    model.elements.forEach(e => {
        const r = regla(e);
        const f = resumClasses.get(r.classe) || { ...r, n: 0 };
        f.n++;
        resumClasses.set(r.classe, f);
    });

    // 1) Els elements que entren, agrupats per classe i tipus. `tots` recorda també els exclosos a mà
    //    (i els que no tenen quantitat) perquè el quadre els pugui tornar a marcar.
    const grups = new Map(); // clau → { regla, descripcio, elements }
    const tots = new Map();  // clau → { regla, descripcio, elements: [{ guid, nom, planta, exclos }] }
    for (const e of model.elements) {
        const r = regla(e);
        if (!r.inclou) continue;

        const fills = perPare.get(e.id) || [];
        // Un conjunt sense quantitats pròpies compta per les seves parts; si en té, les parts no hi compten.
        if (fills.some(ambQuantitats) && !ambQuantitats(e)) continue;
        if (e.pare != null) {
            const pare = model.elements.find(x => x.id === e.pare);
            if (pare && ambQuantitats(pare)) continue;
        }

        const descripcio = e.tipus || e.nom || nomNeteja(r.classe);
        const clau = `${r.classe}|${r.unitat}|${descripcio}`;
        if (!tots.has(clau)) tots.set(clau, { clau, regla: r, descripcio, elements: [] });
        const exclos = exclouGuids.has(e.guid);
        tots.get(clau).elements.push({ guid: e.guid, nom: e.nom, planta: model.plantes.find(p => p.id === e.planta)?.nom || null, exclos });
        if (exclos) { excloses.push({ guid: e.guid, nom: e.nom, classe: e.classe, tipus: e.tipus, motiu: 'Exclòs a mà', manual: true }); continue; }

        if (!grups.has(clau)) grups.set(clau, { regla: r, descripcio, elements: [] });
        grups.get(clau).elements.push(e);
    }

    // 2) Per a cada grup: a quin concepte del banc va (si va a algun), en quina unitat s'amida i les línies.
    const calculaLinies = (g, unitat) => {
        const linies = [];
        const propis = [];
        for (const e of g.elements) {
            const r = liniaPerElement(model, e, unitat, g.descripcio, usa[e.guid]);
            if (r.q.valor == null) propis.push({ guid: e.guid, nom: e.nom, classe: e.classe, motiu: r.q.avis });
            else linies.push(r);
        }
        return { linies, propis };
    };

    const finals = new Map(); // codi final → { code, descripcio, unit, price, vinculada, regla, linies, claus }
    const detall = [];
    const sensePartida = [];
    for (const [clau, g] of [...grups.entries()].sort((a, b) =>
        a[1].regla.capitol.localeCompare(b[1].regla.capitol, 'ca') || a[1].descripcio.localeCompare(b[1].descripcio, 'ca'))) {
        // Concepte del banc: el triat a mà o el de la classificació (la de l'element, la del tipus o la del conjunt).
        const classificacio = g.elements.flatMap(e => e.classificacions || []).find(c => c.codi) || null;
        const triat = codis[clau];
        const codiBanc = triat != null ? triat : classificacio?.codi;
        const entrada = banc ? entradaDelBanc(banc, codiBanc) : null;

        let unitat = g.regla.unitat;
        let avisPartida = null;
        if (entrada) {
            const unitatBanc = cadUnitKind(entrada.unit);
            if (unitatBanc && unitatBanc !== unitat) {
                // Si el banc amida en una altra unitat, es prova de fer-ho així; si algun element no hi té quantitat, no.
                const prova = calculaLinies(g, unitatBanc);
                if (prova.propis.length === 0) unitat = unitatBanc;
                else avisPartida = `La unitat del banc (${entrada.unit}) no es pot obtenir per a tots els elements: s'amida en ${unitat}.`;
            } else if (!unitatBanc) {
                avisPartida = `La unitat del banc (${entrada.unit || 'cap'}) no és amidable des del model: s'amida en ${unitat}.`;
            }
        }
        const { linies, propis } = calculaLinies(g, unitat);
        excloses.push(...propis);
        if (linies.length === 0) continue;
        linies.forEach(({ q, e }) => {
            if (q.avis) avisos.push({ guid: e.guid, nom: e.nom, classe: e.classe, text: q.avis, origen: q.origen, sospitos: !!q.sospitos });
        });
        if (avisPartida) avisos.push({ guid: null, nom: g.descripcio, classe: g.regla.classe, text: avisPartida, origen: 'banc', sospitos: false });

        sensePartida.push({ clau, g, entrada, unitat, linies: linies.map(l => l.linia), classificacio, codiBanc, avisPartida });
    }

    // Codis: els del banc, i els propis (IFC.MUR.01…) estables per a un mateix model.
    const comptadors = new Map();
    for (const p of sensePartida) {
        let code;
        let vinculada = false;
        if (p.entrada) {
            code = p.entrada.code || normalizeCode(p.codiBanc);
            vinculada = true;
            // Dues partides al mateix concepte només es fusionen si s'amiden en la mateixa unitat.
            if (finals.get(normalizeCode(code))?.unit !== undefined && finals.get(normalizeCode(code)).unit !== p.unitat) {
                avisos.push({ guid: null, nom: p.g.descripcio, classe: p.g.regla.classe, origen: 'banc', sospitos: false,
                    text: `No es pot posar a «${code}»: l'altra partida que hi va s'amida en ${finals.get(normalizeCode(code)).unit} i aquesta en ${p.unitat}.` });
                vinculada = false;
            }
        }
        if (!vinculada) {
            const n = (comptadors.get(p.g.regla.abr) || 0) + 1;
            comptadors.set(p.g.regla.abr, n);
            code = `${prefix}.${p.g.regla.abr}.${String(n).padStart(2, '0')}`;
        }
        const k = normalizeCode(code);
        // Dos grups que van al mateix concepte del banc fan una sola partida.
        if (!finals.has(k)) {
            finals.set(k, {
                code, vinculada, regla: p.g.regla, unit: p.unitat, linies: [], claus: [],
                descripcio: vinculada ? (p.entrada.summary || p.g.descripcio) : p.g.descripcio,
                price: vinculada ? (p.entrada.price || 0) : 0,
            });
        }
        const f = finals.get(k);
        f.linies.push(...p.linies);
        f.claus.push({ clau: p.clau, classificacio: p.classificacio, codiBanc: p.codiBanc, avis: p.avisPartida });
    }

    const prices = {};
    const capitolsMap = new Map();
    for (const f of finals.values()) {
        const node = {
            id: crypto.randomUUID(),
            code: f.code,
            description: f.descripcio,
            fullDescription: `${f.descripcio} (${f.regla.classe})`,
            unit: f.unit,
            price: f.price,
            breakdown: [],
            measurements: f.linies,
            certifications: {},
        };
        // Les del banc ja hi són: no es tornen a posar (i el preu del projecte mana).
        if (!f.vinculada) prices[normalizeCode(f.code)] = { code: f.code, price: 0, summary: f.descripcio, unit: f.unit };
        f.claus.forEach(c => detall.push({ ...c, nodeId: node.id, vinculada: f.vinculada }));
        const clauCap = capitols === 'unic' ? 'unic' : f.regla.capitol;
        if (!capitolsMap.has(clauCap)) capitolsMap.set(clauCap, []);
        capitolsMap.get(clauCap).push(node);
    }

    const chapters = [...capitolsMap.entries()].map(([nom, items], i) => ({
        id: crypto.randomUUID(),
        code: `${prefix}${String(i + 1).padStart(2, '0')}`,
        description: nom === 'unic' ? (model.info.projecte.nom || 'Model IFC') : nom,
        fullDescription: '',
        subChapters: [],
        items,
        certifications: {},
    }));

    return {
        chapters,
        prices,
        classes: [...resumClasses.values()].sort((a, b) => b.n - a.n),
        avisos,
        excloses,
        detall,
        grups: [...tots.values()],
        // El que cal recordar al projecte perquè, en reimportar, es puguin tornar a marcar els elements
        // exclosos a mà i es mantinguin les tries de classes (`budget.ifc`).
        memoria: {
            exclosos: Object.fromEntries(excloses.filter(x => x.manual).map(x => [x.guid, { nom: x.nom || null, classe: x.classe, tipus: x.tipus || null }])),
            classes: canvis,
        },
        total: [...finals.values()].reduce((s, f) => s + f.linies.length, 0),
    };
};
