import { normalizeCode } from './calculations';
import { instancia, nomInstanciaLliure } from './sistemesDoc';
import { nomDeRetols } from './cadPaste';

/**
 * Del CAD als sistemes (veure `docs/cad.md`): les entitats copiades amb l'ordre AMIDA del LISP es
 * reparteixen en **zones** (una sala, un tram de façana) i de cada zona se'n fa una instància d'un
 * sistema, amb els paràmetres trets de les magnituds de les seves entitats (A = àrea, P =
 * perímetre...). Totes les instàncies s'insereixen alhora i les partides que comparteixen
 * s'ajunten: a cada partida hi queden les línies de cada zona, amb la línia de zona davant.
 *
 * Cada instància recorda les entitats d'on surt (`instancia.cad.handles`) i com se'n treuen els
 * paràmetres (`instancia.cad.assignacio`). Si després es modifica el dibuix i es tornen a copiar
 * les mateixes entitats, `actualitzaDesDeCad` en posa els valors nous als paràmetres.
 */

/** D'on pot sortir el valor d'un paràmetre. */
export const FONTS = [
    { id: 'sistema', nom: 'Valor del sistema' },
    { id: 'area', nom: 'Àrea (m²)' },
    { id: 'perimetre', nom: 'Perímetre (m)' },
    { id: 'llargada', nom: 'Llargada de les obertes (m)' },
    { id: 'nombre', nom: 'Nombre d\'entitats' },
];

/** Maneres d'agrupar les entitats en zones. */
export const MODES = [
    { id: 'retol', nom: 'Pel rètol de dins', descripcio: 'Les entitats amb el mateix nom de sala són la mateixa zona' },
    { id: 'cada', nom: 'Una zona per entitat', descripcio: 'Cada polilínia o trama és una sala diferent' },
    { id: 'una', nom: 'Una sola zona', descripcio: 'Totes són de la mateixa sala: se sumen' },
    { id: 'capa', nom: 'Per capa', descripcio: 'Les entitats de la mateixa capa són una zona' },
];

const arrod = (v) => Math.round((v || 0) * 1000) / 1000;

/**
 * Magnituds d'un grup d'entitats: l'àrea i el perímetre de les tancades (les trames ja porten
 * l'àrea neta, sense les illes, i el perímetre de tots els contorns), la llargada de les obertes i
 * quantes n'hi ha.
 */
export const magnituds = (entitats = []) => ({
    area: arrod(entitats.reduce((s, e) => s + (e.closed ? e.area || 0 : 0), 0)),
    perimetre: arrod(entitats.reduce((s, e) => s + (e.closed ? e.length || 0 : 0), 0)),
    llargada: arrod(entitats.reduce((s, e) => s + (!e.closed ? e.length || 0 : 0), 0)),
    nombre: entitats.length,
});

const nomsUnics = (zones) => {
    const vistos = new Map();
    return zones.map(z => {
        const n = (vistos.get(z.nom) || 0) + 1;
        vistos.set(z.nom, n);
        return n === 1 ? z : { ...z, nom: `${z.nom} ${n}` };
    });
};

const zona = (nom, entitats) => ({ nom, entitats, handles: entitats.map(e => e.handle).filter(Boolean) });
const nomPerDefecte = (e, i) => nomDeRetols(e.labels) || `${e.layer || e.type || 'Zona'} ${i + 1}`;

/** Reparteix les entitats en zones segons el mode (veure `MODES`). */
export const agrupaEntitats = (entitats = [], mode = 'cada') => {
    if (!entitats.length) return [];
    if (mode === 'una') {
        return [zona(nomDeRetols(entitats.flatMap(e => e.labels || [])) || 'Zona', entitats)];
    }
    if (mode === 'cada') return nomsUnics(entitats.map((e, i) => zona(nomPerDefecte(e, i), [e])));
    // Pel rètol, sense distingir majúscules ni espais: «Menjador» i «MENJADOR» són la mateixa
    // sala, i la zona es diu com el primer.
    const grups = new Map();
    const sols = [];
    entitats.forEach((e, i) => {
        const nom = mode === 'capa' ? (e.layer || e.type) : nomDeRetols(e.labels);
        // Agrupant per rètol, una entitat sense rètol és una zona per ella sola.
        if (!nom) { sols.push(zona(nomPerDefecte(e, i), [e])); return; }
        const clau = nom.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ca');
        if (!grups.has(clau)) grups.set(clau, { nom, entitats: [] });
        grups.get(clau).entitats.push(e);
    });
    return nomsUnics([...[...grups.values()].map(g => zona(g.nom, g.entitats)), ...sols]);
};

/** El mode que té sentit per defecte: pel rètol si n'hi ha; si no, una zona per entitat. */
export const modePerDefecte = (entitats = []) => {
    if (entitats.some(e => nomDeRetols(e.labels))) return 'retol';
    return entitats.length > 1 ? 'cada' : 'una';
};

/** Per a un paràmetre del sistema, la font que s'hi intueix pel nom. */
export const fontPerDefecte = (p) => {
    const n = String(p.nom || '').toLowerCase();
    if (/^(a|s|area|àrea|sup|superficie|superfície)$/.test(n)) return 'area';
    if (/^(p|per|perim|perimetre|perímetre)$/.test(n)) return 'perimetre';
    if (/^(l|ll|llarg|llargada|long)$/.test(n)) return 'llargada';
    if (/^(n|num|nombre)$/.test(n)) return 'nombre';
    return 'sistema';
};

/** Els valors dels paràmetres que surten del CAD per a una zona: `{ nom: valor }`. */
export const valorsDeZona = (z, assignacio = {}) => {
    const m = magnituds(z.entitats);
    const out = {};
    Object.entries(assignacio).forEach(([nom, font]) => { if (font && font !== 'sistema') out[nom] = m[font]; });
    return out;
};

/**
 * Les respostes per inserir una zona (les que espera `instancia`): els valors comuns i els que
 * surten del CAD, amb els que s'hagin editat a mà per sobre.
 */
export const respostesDeZona = (z, assignacio = {}, comuns = {}) => {
    const respostes = new Map(Object.entries(comuns).map(([nom, valor]) => [nom, { valor }]));
    const valors = { ...valorsDeZona(z, assignacio), ...(z.valors || {}) };
    Object.entries(valors).forEach(([nom, valor]) => {
        if (assignacio[nom] && assignacio[nom] !== 'sistema') respostes.set(nom, { valor });
    });
    return respostes;
};

/**
 * Ajunta les partides i els capítols de diverses instàncies d'un mateix sistema: una partida que
 * surt a més d'una suma les línies de totes (cadascuna amb la seva línia de zona).
 */
export const fusionaArbres = (a = [], b = []) => {
    const out = [...a];
    b.forEach(n => {
        const i = out.findIndex(x => normalizeCode(x.code) === normalizeCode(n.code) && !!x.unit === !!n.unit);
        if (i < 0) { out.push(n); return; }
        const x = out[i];
        out[i] = x.unit
            ? { ...x, measurements: [...(x.measurements || []), ...(n.measurements || [])] }
            : { ...x, subChapters: fusionaArbres(x.subChapters || [], n.subChapters || []), items: fusionaArbres(x.items || [], n.items || []) };
    });
    return out;
};

/**
 * Una instància del sistema per zona, a punt d'inserir totes juntes. `zones[].valors` són els
 * valors (editats o no) dels paràmetres que surten del CAD; `comuns`, els que es donen igual per a
 * totes (`{ nom: valor }`). Cada instància té paràmetres propis (`A`, `A_2`, `A_3`...).
 *
 * Torna `{ chapters, parametres, condicions, prices, instancies }`.
 */
export const muntaInstancies = (doc, zones, {
    assignacio = {}, comuns = {}, parametresProjecte = [], sistemesProjecte = [], idGaleria = null, dibuix = '',
} = {}) => {
    let parametres = [...parametresProjecte];
    const instancies = [...sistemesProjecte];
    const fetes = zones.map(z => {
        const inst = instancia(doc, {
            respostes: respostesDeZona(z, assignacio, comuns),
            nomInstancia: nomInstanciaLliure(z.nom.trim() || doc.nom, instancies),
            parametresProjecte: parametres,
            liniaZona: true,
        });
        inst.instancia = { ...inst.instancia, cad: { handles: z.handles, assignacio, dibuix, ...(idGaleria ? { galeria: idGaleria } : {}) } };
        parametres = [...parametres, ...inst.parametres];
        instancies.push(inst.instancia);
        return inst;
    });
    return {
        chapters: fetes.reduce((acc, i) => fusionaArbres(acc, i.chapters), []),
        parametres: fetes.flatMap(i => i.parametres),
        condicions: fetes.flatMap(i => i.condicions || []),
        prices: Object.assign({}, ...fetes.map(i => i.prices || {})),
        instancies: fetes.map(i => i.instancia),
    };
};

// ─── Vincle amb el dibuix ───

/**
 * Si una instància és d'aquest sistema de la galeria: per l'id de la galeria i, si la instància
 * no en té (inserida a mà, no des del CAD), pel nom del sistema.
 */
const esDelSistema = (inst, { idGaleria, nomSistema } = {}) => (
    inst.cad?.galeria && idGaleria ? inst.cad.galeria === idGaleria : inst.sistema === nomSistema
);

/**
 * Les entitats que encara no són de cap zona **d'aquest sistema**. Una mateixa polilínia pot
 * fer de sala per a sistemes diferents (paviment, fals sostre, pintura): només no s'ha de
 * repetir dins del mateix sistema.
 */
export const entitatsLliures = (sistemes = [], entitats = [], sistema = {}) => {
    const usats = new Set(sistemes.filter(i => esDelSistema(i, sistema)).flatMap(i => i.cad?.handles || []));
    return entitats.filter(e => !e.handle || !usats.has(e.handle));
};

/** Les instàncies del projecte que surten d'alguna d'aquestes entitats (de qualsevol sistema). */
export const instanciesVinculades = (sistemes = [], entitats = []) => {
    const handles = new Set(entitats.map(e => e.handle).filter(Boolean));
    return sistemes.filter(i => (i.cad?.handles || []).some(h => handles.has(h)));
};

/**
 * Posa als paràmetres de les instàncies vinculades els valors que surten de les entitats
 * copiades ara. Només es toquen els paràmetres que l'assignació diu que surten del CAD; un
 * paràmetre que algú havia passat a fórmula torna a ser un valor.
 *
 * Torna `{ budget, canvis, noves }`: `canvis` són `{ instancia, parametre, abans, despres }`, i
 * `noves`, les entitats que no són de cap instància (per fer-ne zones noves). Si d'una instància
 * falten entitats (s'han esborrat o no s'han copiat), es compta amb les que hi ha i es diu a
 * `incompletes`.
 */
export const actualitzaDesDeCad = (budget, entitats = []) => {
    const perHandle = new Map(entitats.filter(e => e.handle).map(e => [e.handle, e]));
    const vinculades = instanciesVinculades(budget.sistemes || [], entitats);
    const usats = new Set();
    const canvis = [];
    const incompletes = [];
    let parametres = [...(budget.parametres || [])];
    vinculades.forEach(inst => {
        const presents = inst.cad.handles.map(h => perHandle.get(h)).filter(Boolean);
        presents.forEach(e => usats.add(e.handle));
        if (presents.length < inst.cad.handles.length) incompletes.push(inst.nom);
        const m = magnituds(presents);
        parametres = parametres.map(p => {
            if (p.sistema !== inst.id) return p;
            const font = inst.cad.assignacio?.[p.nomOriginal || p.nom];
            if (!font || font === 'sistema') return p;
            const nou = m[font];
            if (!p.formula && p.valor === nou) return p;
            canvis.push({ instancia: inst.nom, parametre: p.nom, abans: p.formula ? `= ${p.formula}` : p.valor, despres: nou });
            return { ...p, valor: nou, formula: '' };
        });
    });
    return {
        budget: { ...budget, parametres },
        canvis,
        incompletes,
        vinculades: vinculades.map(i => i.nom),
        vinculadesAmbSistema: vinculades.map(i => ({ nom: i.nom, sistema: i.sistema || '' })),
        noves: entitats.filter(e => !e.handle || !usats.has(e.handle)),
    };
};

// ─── Per a l'assistent ───

const n2 = (v) => (Math.round((v || 0) * 100) / 100).toString().replace('.', ',');

/**
 * Les entitats d'un enganxat del CAD com a text per al model: una fila per entitat amb el que
 * cal per decidir les zones (índex, tipus, àrea, perímetre o llargada, capa, nom de sala i
 * rètols). Es talla a `max` files.
 */
export const resumCad = (dades, id, max = 300) => {
    const es = dades.entities || [];
    const files = es.slice(0, max).map((e, i) => [
        i, e.type, e.closed ? 'tancada' : 'oberta',
        e.closed ? n2(e.area) : '', n2(e.length), e.layer || '', nomDeRetols(e.labels) || '', (e.labels || []).join(' | '),
    ].join('\t'));
    return [
        `[Entitats del CAD «${id}»: ${es.length}${dades.drawing ? ` de ${dades.drawing}` : ''}. Àrea en m²; «perímetre o llargada» en m (el perímetre si és tancada).]`,
        ['#', 'tipus', 'tancada', 'àrea', 'perímetre o llargada', 'capa', 'sala', 'rètols'].join('\t'),
        ...files,
        ...(es.length > max ? [`(… ${es.length - max} entitats més)`] : []),
    ].join('\n');
};

/**
 * Zones a partir de la indicació de l'assistent: una agrupació (`MODES`) o una llista
 * explícita `[{ nom, entitats: [índexs] }]`. Llança amb el motiu si un índex no hi és.
 */
export const zonesDeIndicacio = (entitats, { agrupacio, zones } = {}) => {
    if (zones?.length) {
        return zones.map(z => {
            const es = (z.entitats || []).map(i => {
                if (!entitats[i]) throw new Error(`No hi ha cap entitat ${i}: n'hi ha de 0 a ${entitats.length - 1}`);
                return entitats[i];
            });
            if (!es.length) throw new Error(`La zona «${z.nom}» no té cap entitat`);
            return { nom: String(z.nom || 'Zona'), entitats: es, handles: es.map(e => e.handle).filter(Boolean), valors: z.valors || {} };
        });
    }
    return agrupaEntitats(entitats, agrupacio || modePerDefecte(entitats));
};
