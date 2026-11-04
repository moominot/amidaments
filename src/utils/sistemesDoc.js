import { normalizeCode, calcChapterTotal, calcItemTotalQty } from './calculations';
import { resolveFormules, reescriuFormules, nomLliure, CAMPS_FORMULA, teFormules, comprovaCondicions } from './parametres';
import { CAMPS_PLANTILLA, referenciesPlantilla } from './plantilles';
import { resolveMeasurementRefs } from './measurementRefs';
import { referencies } from './formules';
import { esquemaValid } from './esquema';

/**
 * Sistemes constructius com a documents.
 *
 * Un **sistema** és un document d'amidaments sencer —capítols, subcapítols, partides, línies i
 * preus— amb **paràmetres**: les línies hi tenen fórmules (`L+2*e`) i els paràmetres, valors
 * per defecte. Pot ser des d'un detall (un envà, un banc d'obra) fins a un edifici sencer.
 *
 * - **Crear-ne un** és desar un projecte com a sistema (`documentDeProjecte`): el que hi ha a
 *   l'arbre i a la barra de paràmetres.
 * - **Inserir-lo** en un projecte (`instancia`) demana els paràmetres que el sistema declara.
 *   Si el projecte ja en té un amb el mateix nom, es pot fer servir aquest (així una «alçada de
 *   planta» comuna mou tots els sistemes que la fan servir). Els altres entren com a paràmetres
 *   nous, agrupats amb el nom de la **instància** i reanomenats si xoquen.
 * - Cada línia inserida porta la marca `sistema` amb l'id de la instància, i el projecte en
 *   desa la llista a `budget.sistemes`. Amb la marca es pot **filtrar** l'amidament per
 *   instància (`filtraPerInstancia`), **tornar-la a desar** com a sistema (`extreuInstancia`)
 *   o **treure-la** (`treuInstancia`).
 *
 * El document no és BC3. La norma admet una expressió algebraica per línia (`~M` tipus 3,
 * annex 2), però l'extracte que tenim a `docs/fiebdc-norma.md` no hi preveu paràmetres amb nom
 * compartits entre línies; caldria llegir l'annex 2 sencer abans de fer-ho servir. L'exportació
 * BC3 continua escrivint les línies amb els números ja calculats.
 */

export const FORMAT_SISTEMA = 'amidaments/sistema';

// ─── Ajudes ───

const recorre = (nodes, fn) => nodes.forEach(n => {
    fn(n);
    recorre([...(n.subChapters || []), ...(n.items || [])], fn);
});

/** Codis que fan valer l'arbre: partides, descomposats, residus i capítols. */
const codisUsats = (chapters) => {
    const codis = new Set();
    recorre(chapters, n => {
        if (n.code) codis.add(normalizeCode(n.code));
        (n.breakdown || []).forEach(b => b.code && codis.add(normalizeCode(b.code)));
        (n.waste || []).forEach(w => w.code && codis.add(normalizeCode(w.code)));
    });
    return codis;
};

const preusDe = (chapters, priceDatabase = {}) => {
    const out = {};
    codisUsats(chapters).forEach(c => { if (priceDatabase[c]) out[c] = priceDatabase[c]; });
    return out;
};

/**
 * Línia sense res del projecte d'on surt: ni els valors calculats ni la marca d'instància. Si
 * duia el nom de la zona com a text (`nomZona`), torna el text que tenia al sistema.
 */
const netejaLinia = (lin) => {
    // eslint-disable-next-line no-unused-vars
    const { calc, errorsFormula, sistema, nomZona, descripcioSistema, ...m } = lin;
    return nomZona ? { ...m, description: descripcioSistema ?? '' } : m;
};

/** Arbre sense certificacions ni marques. `podaLinia` decideix quines línies es queden. */
const netejaArbre = (nodes, podaLinia = () => true) => nodes.map(n => {
    // eslint-disable-next-line no-unused-vars
    const { certifications, ...resta } = n;
    return {
        ...resta,
        ...(n.measurements ? { measurements: n.measurements.filter(podaLinia).map(netejaLinia) } : {}),
        subChapters: netejaArbre(n.subChapters || [], podaLinia),
        items: netejaArbre(n.items || [], podaLinia),
    };
});

/** Paràmetres que fan servir les fórmules d'unes línies, d'uns paràmetres i d'unes condicions. */
const nomsReferits = (chapters, parametres, condicions = []) => {
    const noms = new Set();
    recorre(chapters, n => (n.measurements || []).forEach(m => {
        if (teFormules(m)) CAMPS_FORMULA.forEach(c => m.formules[c] && referencies(m.formules[c]).forEach(x => noms.add(x)));
    }));
    // Els paràmetres que només surten al títol o a la descripció (`{B*100}`) també compten.
    recorre(chapters, n => CAMPS_PLANTILLA.forEach(c => referenciesPlantilla(n[c]).forEach(x => noms.add(x))));
    recorre(chapters, n => (n.breakdown || []).forEach(b => b.formulaRendiment && referencies(b.formulaRendiment).forEach(x => noms.add(x))));
    parametres.forEach(p => p.formula && referencies(p.formula).forEach(x => noms.add(x)));
    condicions.forEach(c => c.expressio && referencies(c.expressio).forEach(x => noms.add(x)));
    return noms;
};

/** Condició sense res del projecte d'on surt. */
const netejaCondicio = (c) => {
    // eslint-disable-next-line no-unused-vars
    const { sistema, grup, ...resta } = c;
    return resta;
};

// ─── Crear ───

/**
 * Document de sistema a partir d'un projecte: tot l'arbre i tots els paràmetres.
 * `chapters` ha de ser `budget.chapters` (amb les fórmules i els vincles), no el resolt.
 */
export const documentDeProjecte = ({ chapters = [], parametres = [], condicions = [], name, esquema } = {}, priceDatabase = {}, { nom, descripcio } = {}) => {
    // Les línies de zona d'una instància (`zona`) no són del sistema: en tornar-lo a inserir se'n
    // posen de noves amb el nom de la nova instància.
    const arbre = netejaArbre(chapters, m => !m.zona);
    const imatge = esquemaValid(esquema);
    return {
        format: FORMAT_SISTEMA,
        versio: 1,
        nom: (nom || name || 'Sistema').trim(),
        descripcio: (descripcio || '').trim(),
        parametres: parametres.map(p => {
            // eslint-disable-next-line no-unused-vars
            const { sistema, nomOriginal, ...resta } = p;
            return resta;
        }),
        condicions: condicions.map(netejaCondicio),
        chapters: arbre,
        prices: preusDe(arbre, priceDatabase),
        ...(imatge ? { esquema: imatge } : {}),
    };
};

/**
 * El sistema com a projecte, per exportar-lo en un `.amid` que també es pot obrir per editar-lo.
 * La descripció hi viatja a `descripcioSistema`.
 */
export const projecteDeDocument = (doc) => ({
    budget: {
        id: crypto.randomUUID(),
        name: doc.nom,
        descripcioSistema: doc.descripcio || '',
        chapters: doc.chapters,
        parametres: doc.parametres,
        condicions: doc.condicions || [],
        certifications: [],
        ...(esquemaValid(doc.esquema) ? { esquema: esquemaValid(doc.esquema) } : {}),
    },
    priceDatabase: doc.prices || {},
});

/**
 * Llegeix un document de sistema, o un fitxer de projecte (`.amid`) que se'n fa un.
 * Torna `null` si no és cap de les dues coses.
 */
export const llegeixDocument = (dades) => {
    if (!dades || typeof dades !== 'object') return null;
    if (dades.format === FORMAT_SISTEMA) {
        if (!Array.isArray(dades.chapters)) return null;
        // eslint-disable-next-line no-unused-vars
        const { esquema, ...resta } = dades;
        const imatge = esquemaValid(esquema);
        return {
            ...resta,
            ...(imatge ? { esquema: imatge } : {}),
            parametres: Array.isArray(dades.parametres) ? dades.parametres : [],
            condicions: Array.isArray(dades.condicions) ? dades.condicions : [],
            prices: dades.prices && typeof dades.prices === 'object' ? dades.prices : {},
        };
    }
    if (dades.budget && Array.isArray(dades.budget.chapters)) {
        return documentDeProjecte(dades.budget, dades.priceDatabase || {}, { descripcio: dades.budget.descripcioSistema });
    }
    return null;
};

// ─── Inserir ───

/**
 * Els paràmetres que s'han de demanar en inserir el sistema.
 *
 * Els que tenen fórmula al sistema (`Pm = (P1+P2)/2`) no es demanen: en surten. Per a cada un
 * dels altres es diu si el projecte ja en té un amb el mateix nom (`existent`).
 */
export const parametresADemanar = (doc, parametresProjecte = []) => {
    const perNom = new Map(parametresProjecte.map(p => [p.nom, p]));
    return doc.parametres.map(p => ({
        ...p,
        derivat: !!p.formula,
        existent: perNom.get(p.nom) || null,
    }));
};

/** El nom de la instància, sense repetir el d'una altra del projecte. */
export const nomInstanciaLliure = (base, instancies = []) => {
    const ocupats = new Set(instancies.map(i => i.nom));
    if (!ocupats.has(base)) return base;
    let n = 2;
    while (ocupats.has(`${base} ${n}`)) n++;
    return `${base} ${n}`;
};

const grupDe = (nomInstancia, grup) => (grup ? `${nomInstancia} · ${grup}` : nomInstancia);

/**
 * Prepara la inserció d'un sistema.
 *
 * `respostes`: `Map` nom → `{ enllaca: true }` (fer servir el paràmetre del projecte amb aquest
 * nom), `{ valor }` o `{ formula }` (fórmula sobre paràmetres **del projecte**, p. ex. `H-0,3`).
 * Sense resposta, el paràmetre entra amb el valor del sistema.
 *
 * Torna `{ chapters, parametres, condicions, prices, instancia, omeses }`: l'arbre amb ids nous
 * i marcat, els paràmetres i les condicions que s'han d'afegir al projecte, els preus, l'entrada
 * per a `budget.sistemes` i les partides que s'han deixat fora.
 *
 * Amb `liniaZona`, el nom de la instància (la zona) es veu a les línies de cada partida: si la
 * instància hi posa una sola línia, que és el cas habitual, el nom passa a ser el text de la línia
 * (`nomZona`, amb l'original a `descripcioSistema` per tornar-lo en extreure-la); si n'hi posa
 * diverses, va en una línia de títol al davant, a 0 i marcada amb `zona`. Així, a les partides
 * on s'ajunten línies de diverses instàncies (o de l'obra), es veu de quina zona és cada una.
 *
 * Amb `ometZero` no s'insereixen les partides que, amb aquests valors, surten a zero (ni els
 * capítols que es queden buits per això). És el que es vol en un sistema amb variants, on un
 * paràmetre posa a zero les partides de les variants que no es trien: si no, es quedarien al
 * pressupost amb quantitat 0. El preu és que, si després es canvia el paràmetre, la partida
 * que no s'ha inserit no apareix: cal tornar a inserir el sistema.
 */
export const instancia = (doc, {
    respostes = new Map(),
    nomInstancia = doc.nom,
    parametresProjecte = [],
    id = crypto.randomUUID(),
    ometZero = false,
    liniaZona = false,
} = {}) => {
    const ocupats = new Set(parametresProjecte.map(p => p.nom));
    const canvis = new Map();
    let nous = [];

    doc.parametres.forEach(p => {
        const r = respostes.get(p.nom);
        if (r?.enllaca && ocupats.has(p.nom) && !p.formula) return;   // es fa servir el del projecte
        const nom = nomLliure(p.nom, ocupats);
        ocupats.add(nom);
        if (nom !== p.nom) canvis.set(p.nom, nom);
        nous.push({
            ...p,
            id: crypto.randomUUID(),
            nom,
            nomOriginal: p.nom,
            grup: grupDe(nomInstancia, p.grup),
            sistema: id,
        });
    });

    // Ids nous a tot l'arbre i a les línies; els vincles a una línia concreta segueixen la
    // seva línia.
    const idsLinies = new Map();
    recorre(doc.chapters, n => (n.measurements || []).forEach(m => idsLinies.set(m.id, crypto.randomUUID())));
    const copia = (nodes) => nodes.map(n => {
        // eslint-disable-next-line no-unused-vars
        const { certifications, ...resta } = n;
        const linies = (n.measurements || []).filter(m => !m.zona).map(m => ({
            ...netejaLinia(m),
            id: idsLinies.get(m.id) || crypto.randomUUID(),
            ...(m.refLineId && idsLinies.has(m.refLineId) ? { refLineId: idsLinies.get(m.refLineId) } : {}),
            sistema: id,
        }));
        let mesures = linies;
        if (liniaZona && n.unit && linies.length === 1) {
            mesures = [{ ...linies[0], description: nomInstancia, nomZona: true, descripcioSistema: linies[0].description ?? '' }];
        } else if (liniaZona && n.unit && linies.length > 1) {
            mesures = [{ id: crypto.randomUUID(), description: nomInstancia, units: 0, length: 0, width: 0, height: 0, sistema: id, zona: true }, ...linies];
        }
        return {
            ...resta,
            id: crypto.randomUUID(),
            ...(n.measurements ? { measurements: mesures } : {}),
            subChapters: copia(n.subChapters || []),
            items: copia(n.items || []),
        };
    });

    // Primer es reanomena el que ve del sistema; les respostes de l'usuari van després perquè
    // parlen dels paràmetres del projecte i no s'han de tocar.
    const condicions = (doc.condicions || []).map(c => ({
        ...c, id: crypto.randomUUID(), grup: nomInstancia, sistema: id,
    }));
    const reescrit = reescriuFormules({ chapters: copia(doc.chapters), parametres: nous, condicions }, canvis);
    nous = reescrit.parametres.map(p => {
        const r = respostes.get(p.nomOriginal);
        if (!r) return p;
        if ('valor' in r) return { ...p, valor: r.valor, formula: '' };
        if ('formula' in r) return { ...p, formula: r.formula };
        return p;
    });

    let chapters = reescrit.chapters;
    const omeses = [];
    if (ometZero) {
        const resolt = resolveMeasurementRefs(resolveFormules(chapters, [...parametresProjecte, ...nous]).chapters).chapters;
        const quantitat = new Map();
        recorre(resolt, n => { if (n.unit) quantitat.set(n.id, calcItemTotalQty(n)); });
        const poda = (nodes) => nodes.map(n => {
            if (n.unit) {
                if (quantitat.get(n.id) !== 0) return n;
                omeses.push({ code: n.code, description: n.description || '' });
                return null;
            }
            const subChapters = poda(n.subChapters || []);
            const items = poda(n.items || []);
            // Un capítol que ja era buit al sistema es respecta; el que s'ha buidat ara, fora.
            const teniaContingut = (n.subChapters || []).length + (n.items || []).length > 0;
            if (teniaContingut && !subChapters.length && !items.length) return null;
            return { ...n, subChapters, items };
        }).filter(Boolean);
        chapters = poda(chapters);
    }

    return {
        chapters,
        parametres: nous,
        condicions: reescrit.condicions,
        prices: ometZero ? preusDe(chapters, doc.prices || {}) : (doc.prices || {}),
        instancia: { id, nom: nomInstancia, sistema: doc.nom, ...(esquemaValid(doc.esquema) ? { esquema: esquemaValid(doc.esquema) } : {}) },
        omeses,
    };
};

/**
 * Total del sistema amb unes respostes, abans d'inserir-lo. Els preus del projecte manen sobre
 * els del sistema, com en inserir (`conservaPreus`).
 */
export const previsualitza = (doc, opcions = {}, priceDatabase = {}) => {
    const inst = instancia(doc, opcions);
    const params = [...(opcions.parametresProjecte || []), ...inst.parametres];
    const ambFormules = resolveFormules(inst.chapters, params);
    const resolt = resolveMeasurementRefs(ambFormules.chapters).chapters;
    const preus = { ...inst.prices, ...priceDatabase };
    // Les condicions del sistema, amb els límits per nom del sistema (el que es veu al quadre).
    const comprovacio = comprovaCondicions(inst.parametres, inst.condicions, ambFormules.parametres);
    const limitsPerNom = new Map();
    inst.parametres.forEach(p => {
        if (comprovacio.perParametre.has(p.id)) limitsPerNom.set(p.nomOriginal, comprovacio.perParametre.get(p.id));
    });
    return {
        total: resolt.reduce((a, c) => a + calcChapterTotal(c, preus), 0),
        liniesAmbError: ambFormules.liniesAmbError,
        errorsParametres: ambFormules.parametres.errors,
        limitsPerNom,
        condicions: comprovacio.generals,
        incomplertes: comprovacio.incomplertes,
        omeses: inst.omeses,
        chapters: resolt,
        preus,
    };
};

// ─── Instàncies dins del projecte ───

/**
 * Només el que ve d'una instància: les seves línies, les partides que en tenen i els capítols
 * que les contenen.
 */
export const filtraPerInstancia = (chapters, id) => {
    const poda = (nodes) => nodes.map(n => {
        if (n.unit) {
            const linies = (n.measurements || []).filter(m => m.sistema === id);
            return linies.length ? { ...n, measurements: linies } : null;
        }
        const subChapters = poda(n.subChapters || []);
        const items = poda(n.items || []);
        return subChapters.length || items.length ? { ...n, subChapters, items } : null;
    }).filter(Boolean);
    return poda(chapters);
};

/**
 * Torna a fer un sistema amb una instància del projecte: les seves línies (amb les fórmules),
 * els seus paràmetres amb el nom que tenien al sistema i, a més, els paràmetres del projecte
 * que les fórmules fan servir (amb el valor que tenen ara), perquè el sistema sigui complet.
 */
export const extreuInstancia = (budget, priceDatabase, id) => {
    const inst = (budget.sistemes || []).find(i => i.id === id);
    const chapters = filtraPerInstancia(budget.chapters || [], id);
    const propis = (budget.parametres || []).filter(p => p.sistema === id);
    const nomsPropis = new Set(propis.map(p => p.nom));
    const propiesCond = (budget.condicions || []).filter(c => c.sistema === id);
    const referits = nomsReferits(chapters, propis, propiesCond);
    const externs = (budget.parametres || []).filter(p => p.sistema !== id && referits.has(p.nom) && !nomsPropis.has(p.nom));

    // Es recuperen els noms del sistema (L en comptes de L_2) si no xoquen.
    const canvis = new Map();
    const finals = new Set(externs.map(p => p.nom));
    propis.forEach(p => {
        const original = p.nomOriginal && !finals.has(p.nomOriginal) ? p.nomOriginal : p.nom;
        finals.add(original);
        if (original !== p.nom) canvis.set(p.nom, original);
    });
    const prefix = inst ? `${inst.nom} · ` : null;
    const parametres = [
        ...externs.map(p => ({ ...p, grup: p.grup || '' })),
        ...propis.map(p => ({
            ...p,
            nom: canvis.get(p.nom) || p.nom,
            grup: !inst ? p.grup : p.grup === inst.nom ? '' : (p.grup || '').startsWith(prefix) ? p.grup.slice(prefix.length) : p.grup,
        })),
    ];
    const reescrit = reescriuFormules({ chapters, parametres, condicions: propiesCond }, canvis);
    return documentDeProjecte(
        { chapters: reescrit.chapters, parametres: reescrit.parametres, condicions: reescrit.condicions, esquema: inst?.esquema },
        priceDatabase,
        { nom: inst?.sistema || inst?.nom || 'Sistema', descripcio: inst ? `Extret de la instància «${inst.nom}»` : '' },
    );
};

/**
 * Treu una instància del projecte: les seves línies, els seus paràmetres i les partides que
 * només tenien línies seves. Una partida que ja hi era i on s'havien afegit línies es queda amb
 * les que tenia.
 */
export const treuInstancia = (budget, id) => {
    const poda = (nodes) => nodes.map(n => {
        if (n.unit) {
            const totes = n.measurements || [];
            const queden = totes.filter(m => m.sistema !== id);
            if (totes.length > 0 && queden.length === 0) return null;
            return queden.length === totes.length ? n : { ...n, measurements: queden };
        }
        return { ...n, subChapters: poda(n.subChapters || []), items: poda(n.items || []) };
    }).filter(Boolean);
    return {
        ...budget,
        chapters: poda(budget.chapters || []),
        parametres: (budget.parametres || []).filter(p => p.sistema !== id),
        condicions: (budget.condicions || []).filter(c => c.sistema !== id),
        sistemes: (budget.sistemes || []).filter(i => i.id !== id),
    };
};

/**
 * Canvia el nom d'una instància (la zona) a tot arreu: a `budget.sistemes`, al grup dels seus
 * paràmetres i condicions («Façana nord · Mur» → «Façana sud · Mur») i a les línies que porten el
 * nom: les de títol (`zona`) i les que el tenen com a text (`nomZona`), però aquestes només si
 * encara diuen el nom vell (si algú hi ha escrit una altra cosa, es respecta). Si el nom ja és
 * d'una altra instància, s'hi afegeix un número.
 */
export const reanomenaInstancia = (budget, id, nouNom) => {
    const inst = (budget.sistemes || []).find(i => i.id === id);
    const net = String(nouNom || '').trim();
    if (!inst || !net || net === inst.nom) return budget;
    const nom = nomInstanciaLliure(net, (budget.sistemes || []).filter(i => i.id !== id));
    const vell = inst.nom;
    const prefix = `${vell} · `;
    const grup = (g) => (g === vell ? nom : (g || '').startsWith(prefix) ? `${nom} · ${g.slice(prefix.length)}` : g);
    const linia = (m) => {
        if (m.sistema !== id) return m;
        if (m.zona || (m.nomZona && m.description === vell)) return { ...m, description: nom };
        return m;
    };
    const arbre = (nodes) => nodes.map(n => ({
        ...n,
        ...(n.measurements ? { measurements: n.measurements.map(linia) } : {}),
        subChapters: arbre(n.subChapters || []),
        items: arbre(n.items || []),
    }));
    return {
        ...budget,
        chapters: arbre(budget.chapters || []),
        parametres: (budget.parametres || []).map(p => (p.sistema === id ? { ...p, grup: grup(p.grup) } : p)),
        condicions: (budget.condicions || []).map(c => (c.sistema === id ? { ...c, grup: grup(c.grup) } : c)),
        sistemes: budget.sistemes.map(i => (i.id === id ? { ...i, nom } : i)),
    };
};
