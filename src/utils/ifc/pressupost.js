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
 * Munta el pressupost a partir del model.
 *
 * @param {object} model  El que torna `llegeixIfc`.
 * @param {object} [opcions]
 * @param {Object<string,{unitat?:string, inclou?:boolean}>} [opcions.classes]  Canvis per classe.
 * @param {'classe'|'unic'} [opcions.capitols='classe']
 * @param {Object<string,'qto'|'geometria'>} [opcions.usa]  Per `guid`: què fer en una quantitat sospitosa.
 * @param {Set<string>|string[]} [opcions.exclou]  `guid`s que no entren.
 * @param {string} [opcions.prefix='IFC']  Prefix dels codis.
 * @returns {{ chapters: object[], prices: object, classes: object[], avisos: object[], excloses: object[], total: number }}
 */
export const muntaPressupost = (model, opcions = {}) => {
    const { classes: canvis = {}, capitols = 'classe', usa = {}, prefix = 'IFC' } = opcions;
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

    const partides = new Map(); // clau → { classe, regla, nom, linies }
    for (const e of model.elements) {
        const r = regla(e);
        if (!r.inclou) continue;
        if (exclouGuids.has(e.guid)) { excloses.push({ guid: e.guid, nom: e.nom, motiu: 'Exclòs a mà' }); continue; }

        const fills = perPare.get(e.id) || [];
        // Un conjunt sense quantitats pròpies compta per les seves parts; si en té, les parts no hi compten.
        if (fills.some(ambQuantitats) && !ambQuantitats(e)) continue;
        if (e.pare != null) {
            const pare = model.elements.find(x => x.id === e.pare);
            if (pare && ambQuantitats(pare)) continue;
        }

        const q = quantitatDeElement(e, r.unitat, usa[e.guid]);
        if (q.valor == null) {
            excloses.push({ guid: e.guid, nom: e.nom, classe: e.classe, motiu: q.avis });
            continue;
        }
        if (q.avis) avisos.push({ guid: e.guid, nom: e.nom, classe: e.classe, text: q.avis, origen: q.origen, sospitos: !!q.sospitos });

        const descripcio = e.tipus || e.nom || nomNeteja(r.classe);
        const clau = `${r.classe}|${r.unitat}|${descripcio}`;
        if (!partides.has(clau)) partides.set(clau, { regla: r, descripcio, linies: [] });
        const planta = model.plantes.find(p => p.id === e.planta);
        partides.get(clau).linies.push(liniaDe(arrodoneix(q.valor), r.unitat, {
            description: [e.nom && e.nom !== descripcio ? e.nom : null, planta?.nom].filter(Boolean).join(' · ') || descripcio,
            ifc: { guid: e.guid, classe: e.classe, quantitat: q.nom, origen: q.origen },
        }));
    }

    // Capítols i codis: estables per a un mateix model (ordre de les classes i dels noms).
    const capitolsMap = new Map();
    const comptadors = new Map();
    const llistaPartides = [...partides.values()].sort((a, b) =>
        a.regla.capitol.localeCompare(b.regla.capitol, 'ca') || a.descripcio.localeCompare(b.descripcio, 'ca'));
    const prices = {};
    for (const p of llistaPartides) {
        const n = (comptadors.get(p.regla.abr) || 0) + 1;
        comptadors.set(p.regla.abr, n);
        const code = `${prefix}.${p.regla.abr}.${String(n).padStart(2, '0')}`;
        const node = {
            id: crypto.randomUUID(),
            code,
            description: p.descripcio,
            fullDescription: `${p.descripcio} (${p.regla.classe})`,
            unit: p.regla.unitat,
            price: 0,
            breakdown: [],
            measurements: p.linies,
            certifications: {},
        };
        prices[normalizeCode(code)] = { code, price: 0, summary: p.descripcio, unit: p.regla.unitat };
        const clauCap = capitols === 'unic' ? 'unic' : p.regla.capitol;
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
        total: llistaPartides.reduce((s, p) => s + p.linies.length, 0),
    };
};
