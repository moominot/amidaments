/**
 * Lectura d'un model IFC: elements amb les quantitats que ja porta (`IfcElementQuantity`).
 *
 * Fase 1 de la importació d'IFC. No fa geometria: llegeix el que el programa d'origen ha
 * declarat als `Qto_*BaseQuantities`. Els models que no en porten surten amb `quantitats: []`
 * i un avís; el càlcul des de la geometria és una fase posterior.
 *
 * Les quantitats surten sempre en unitats SI (m, m², m³, kg), convertides segons
 * `IfcUnitAssignment`: un model en mil·límetres o en peus no pot arribar al pressupost amb les
 * xifres sense escalar.
 *
 * Els textos no se'n fia ningú: el que el model declara com a quantitat pot no ser el que
 * l'amidament vol (p. ex. el `GrossArea` d'un `IfcCovering` d'IngeTrazo és la superfície total
 * de la caixa, no la cara revestida). La validació contra la geometria és de la fase 2.
 */

import { parseStep } from './step.js';
import { geometriaElement } from './geometria.js';

/** Classes que organitzen el model però no són elements constructius. */
const CLASSES_ESPACIALS = new Set(['IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY']);

const PREFIXOS = {
    EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 1e1,
    DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9, PICO: 1e-12, FEMTO: 1e-15, ATTO: 1e-18,
};

/** Magnitud (en català) de cada tipus de quantitat IFC. */
const MAGNITUDS = {
    IFCQUANTITYLENGTH: 'longitud',
    IFCQUANTITYAREA: 'area',
    IFCQUANTITYVOLUME: 'volum',
    IFCQUANTITYCOUNT: 'recompte',
    IFCQUANTITYWEIGHT: 'pes',
};

const esRef = (v) => v && typeof v === 'object' && !Array.isArray(v) && typeof v.ref === 'number';
const nomEnum = (v) => (v && typeof v === 'object' && 'enum' in v ? v.enum : null);
const text = (v) => (typeof v === 'string' ? v : null);
const llistaRefs = (v) => (Array.isArray(v) ? v.filter(esRef).map(r => r.ref) : []);
const valorNum = (v) => {
    if (typeof v === 'number') return v;
    if (v && typeof v === 'object' && typeof v.valor === 'number') return v.valor;
    return null;
};

/**
 * Factor per passar una unitat IFC a la unitat de base del seu tipus (m, m², m³ o kg).
 * Admet `IfcSIUnit` (amb prefix) i `IfcConversionBasedUnit` (polzades, peus…).
 */
const factorUnitat = (entitats, ref, fons = new Set()) => {
    const u = entitats.get(ref);
    if (!u || fons.has(ref)) return null;
    fons.add(ref);
    if (u.tipus === 'IFCSIUNIT') {
        const prefix = PREFIXOS[nomEnum(u.args[2])] ?? 1;
        // El gram és la unitat SI de massa de l'IFC; el kg ho són amb prefix KILO.
        const base = nomEnum(u.args[3]) === 'GRAM' ? 1e-3 : 1;
        return prefix * base;
    }
    if (u.tipus === 'IFCCONVERSIONBASEDUNIT') {
        const mesura = esRef(u.args[3]) ? entitats.get(u.args[3].ref) : null;
        if (!mesura || mesura.tipus !== 'IFCMEASUREWITHUNIT') return null;
        const valor = valorNum(mesura.args[0]);
        const base = esRef(mesura.args[1]) ? factorUnitat(entitats, mesura.args[1].ref, fons) : null;
        return valor != null && base != null ? valor * base : null;
    }
    return null;
};

const llegeixUnitats = (entitats, avisos) => {
    const projecte = [...entitats.values()].find(e => e.tipus === 'IFCPROJECT');
    const f = { longitud: 1, area: null, volum: null, massa: 1 };
    const assignacio = projecte && esRef(projecte.args[8]) ? entitats.get(projecte.args[8].ref) : null;
    if (!assignacio) {
        avisos.push('El model no declara unitats (IfcUnitAssignment): s\'han suposat metres.');
        return { ...f, area: 1, volum: 1 };
    }
    for (const ref of llistaRefs(assignacio.args[0])) {
        const u = entitats.get(ref);
        if (!u) continue;
        const tipus = nomEnum(u.tipus === 'IFCSIUNIT' ? u.args[1] : u.args[1]);
        const fac = factorUnitat(entitats, ref);
        if (fac == null) continue;
        if (tipus === 'LENGTHUNIT') f.longitud = fac;
        else if (tipus === 'AREAUNIT') f.area = fac;
        else if (tipus === 'VOLUMEUNIT') f.volum = fac;
        else if (tipus === 'MASSUNIT') f.massa = fac;
    }
    // Si no declara àrea o volum, es dedueixen de la longitud.
    if (f.area == null) f.area = f.longitud ** 2;
    if (f.volum == null) f.volum = f.longitud ** 3;
    return f;
};

/**
 * Llegeix un model IFC.
 *
 * @param {string} contingut  El text del fitxer .ifc (UTF-8 o Latin-1 amb escapaments).
 * @returns {null | {
 *   info: { esquema: string|null, programa: string|null, projecte: {nom:string|null, descripcio:string|null} },
 *   unitats: { longitud:number, area:number, volum:number, massa:number },
 *   plantes: { id:number, guid:string|null, nom:string|null, elevacio:number|null }[],
 *   elements: Element[],
 *   avisos: string[],
 * }}
 *
 * Element: `{ id, guid, classe, nom, tipus, planta, pare, espai, geometria, quantitats }`, on `classe` és
 * en majúscules (`IFCWALL`), `tipus` el nom de l'`IfcTypeObject` si en té i `planta` l'id de la
 * planta (o null), `pare` l'id de l'element del qual és part i `geometria` el que torna
 * `geometriaElement` (volum, superfície, cara més gran). Quantitat: `{ conjunt, nom, magnitud, valor }`, amb `valor` en SI.
 */
export const llegeixIfc = (contingut, { geometria = true } = {}) => {
    const step = parseStep(contingut);
    if (!step) return null;
    const { capcalera, entitats } = step;
    const avisos = [];

    const esquema = Array.isArray(capcalera.FILE_SCHEMA?.[0]) ? text(capcalera.FILE_SCHEMA[0][0]) : null;
    const programa = text(capcalera.FILE_NAME?.[5]);
    const unitats = llegeixUnitats(entitats, avisos);

    // Per tipus, que és com es busca gairebé tot.
    const perTipus = (tipus) => [...entitats.values()].filter(e => e.tipus === tipus);

    const projecteEnt = perTipus('IFCPROJECT')[0];
    const info = {
        esquema,
        programa,
        projecte: { nom: text(projecteEnt?.args[2]), descripcio: text(projecteEnt?.args[3]) },
    };

    const plantes = perTipus('IFCBUILDINGSTOREY').map(e => ({
        id: e.id, guid: text(e.args[0]), nom: text(e.args[2]), elevacio: valorNum(e.args[9]),
    }));
    const idPlantes = new Set(plantes.map(p => p.id));

    // Relacions. Els índexs difereixen entre classes: a IfcRelAggregates el pare va abans dels fills.
    const contingutA = new Map();   // element → estructura espacial que el conté
    const agregatA = new Map();     // fill → pare
    const candidats = new Set();
    const quantitatsDe = new Map(); // element → [IfcElementQuantity]
    const tipusDe = new Map();      // element → nom del tipus

    for (const r of perTipus('IFCRELCONTAINEDINSPATIALSTRUCTURE')) {
        const estructura = esRef(r.args[5]) ? r.args[5].ref : null;
        for (const id of llistaRefs(r.args[4])) { contingutA.set(id, estructura); candidats.add(id); }
    }
    for (const r of perTipus('IFCRELAGGREGATES')) {
        const pare = esRef(r.args[4]) ? r.args[4].ref : null;
        const tipusPare = entitats.get(pare)?.tipus;
        for (const id of llistaRefs(r.args[5])) {
            agregatA.set(id, pare);
            if (tipusPare === 'IFCBUILDINGSTOREY' || tipusPare === 'IFCSPACE' || tipusPare === 'IFCBUILDING') candidats.add(id);
            else if (tipusPare && !CLASSES_ESPACIALS.has(tipusPare)) candidats.add(id);
        }
    }
    for (const r of perTipus('IFCRELDEFINESBYPROPERTIES')) {
        const def = esRef(r.args[5]) ? entitats.get(r.args[5].ref) : null;
        for (const id of llistaRefs(r.args[4])) {
            candidats.add(id);
            if (def?.tipus === 'IFCELEMENTQUANTITY') {
                if (!quantitatsDe.has(id)) quantitatsDe.set(id, []);
                quantitatsDe.get(id).push(def);
            }
        }
    }
    for (const r of perTipus('IFCRELDEFINESBYTYPE')) {
        const tipus = esRef(r.args[5]) ? entitats.get(r.args[5].ref) : null;
        for (const id of llistaRefs(r.args[4])) {
            candidats.add(id);
            if (tipus) tipusDe.set(id, text(tipus.args[2]));
        }
    }

    const plantaDe = (id) => {
        let actual = id;
        const vists = new Set();
        while (actual != null && !vists.has(actual)) {
            vists.add(actual);
            if (idPlantes.has(actual)) return actual;
            const pare = contingutA.get(actual) ?? agregatA.get(actual);
            if (pare != null && idPlantes.has(pare)) return pare;
            actual = pare;
        }
        return null;
    };

    const llegeixQuantitats = (conjunt) => {
        const nomConjunt = text(conjunt.args[2]) || '';
        const out = [];
        for (const ref of llistaRefs(conjunt.args[5])) {
            const q = entitats.get(ref);
            const magnitud = q && MAGNITUDS[q.tipus];
            if (!magnitud) continue; // IfcQuantityTime, IfcPhysicalComplexQuantity…
            const brut = valorNum(q.args[3]);
            if (brut == null) continue;
            // Una quantitat pot dur la seva pròpia unitat; si no, mana la del projecte.
            const propia = esRef(q.args[2]) ? factorUnitat(entitats, q.args[2].ref) : null;
            const factor = magnitud === 'recompte' ? 1
                : propia ?? (magnitud === 'longitud' ? unitats.longitud
                    : magnitud === 'area' ? unitats.area
                        : magnitud === 'volum' ? unitats.volum
                            : unitats.massa);
            out.push({ conjunt: nomConjunt, nom: text(q.args[0]) || '', magnitud, valor: brut * factor });
        }
        return out;
    };

    const pareElement = (id) => {
        const pare = agregatA.get(id);
        const ent = pare != null ? entitats.get(pare) : null;
        return ent && !CLASSES_ESPACIALS.has(ent.tipus) && ent.tipus !== 'IFCSPACE' ? pare : null;
    };

    const elements = [];
    for (const id of [...candidats].sort((a, b) => a - b)) {
        const e = entitats.get(id);
        if (!e || CLASSES_ESPACIALS.has(e.tipus)) continue;
        if (typeof e.args[0] !== 'string') continue; // no és un IfcRoot: no és cap element
        elements.push({
            id,
            guid: text(e.args[0]),
            classe: e.tipus,
            nom: text(e.args[2]),
            tipus: tipusDe.get(id) ?? null,
            planta: plantaDe(id),
            // Pare, si l'element és una part d'un altre (les lloses d'una coberta): els Qto poden
            // ser a les parts i no al conjunt, i no s'han de comptar dues vegades.
            pare: pareElement(id),
            espai: e.tipus === 'IFCSPACE',
            geometria: geometria ? geometriaElement(entitats, id, unitats.longitud) : null,
            quantitats: (quantitatsDe.get(id) || []).flatMap(llegeixQuantitats),
        });
    }

    const senseQto = elements.filter(el => !el.espai && el.quantitats.length === 0);
    if (senseQto.length > 0) {
        avisos.push(`${senseQto.length} elements no porten cap quantitat (IfcElementQuantity): ` +
            `caldria calcular-les des de la geometria.`);
    }
    if (elements.length === 0) avisos.push('El model no conté cap element.');

    return { info, unitats, plantes, elements, avisos };
};

/** Primera quantitat d'un element amb aquest nom (p. ex. `NetSideArea`), o null. */
export const trobaQuantitat = (element, nom) =>
    element.quantitats.find(q => q.nom === nom) || null;
