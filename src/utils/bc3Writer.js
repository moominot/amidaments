import { normalizeCode, round2, calcItemCertifiedQty } from './calculations';

/**
 * Escriptor FIEBDC-3 (BC3).
 *
 * ─── Pressupost i certificació són fitxers germans ───
 *
 * La norma (FIEBDC-3/2020, apartat d'especificació) diu que una certificació **no** és un
 * afegit dins del fitxer del pressupost: és un fitxer BC3 sencer, amb la mateixa estructura
 * (`~C`, `~D`, `~M`, `~T`), que només es distingeix pel registre `~V`:
 *
 *     ~V | PROPIETAT | VERSIO\DDMMYYYY | PROGRAMA | CAPÇALERA | JOC_CARÀCTERS | COMENTARI
 *        | TIPUS_INFORMACIO | NUM_CERTIFICACIO | DATA_CERTIFICACIO | URL_BASE |
 *
 * amb `TIPUS_INFORMACIO` = 2 per al pressupost i = 3 per a la certificació («actual cost»).
 * El nom del fitxer és el del pressupost més `#certification NNNN`, i és això el que permet
 * que un programa importi el pressupost i les certificacions que vulgui d'una tacada.
 *
 * Fins ara aquesta aplicació ho feia d'una altra manera —un sol fitxer, amb les fases
 * declarades a `~F` i el número de fase al primer subcamp de cada línia de `~M`— i xocava amb
 * dos usos reals de la norma: `~F` és el registre de **documents adjunts**, i el primer subcamp
 * de la línia d'amidament és el **TIPUS** de línia («1» subtotal parcial, «2» subtotal acumulat,
 * «3» expressió). Presto llegia les nostres línies de certificació com a files de subtotal.
 *
 * Ara `generateBC3` escriu un fitxer per document: sense `certification` fa el pressupost, i
 * amb `certification` fa la certificació, amb les mateixes partides i preus però amb els
 * amidaments certificats a origen al lloc dels amidaments del projecte.
 */

const NOM_PROGRAMA = 'PreuArq BIM';
const VERSIO_FORMAT = 'FIEBDC-3/2020';

/** Data en el format DDMMYYYY del registre `~V`, a partir d'un ISO `YYYY-MM-DD`. */
export const dataFiebdc = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.substring(0, 10).split('-');
    if (!y || !m || !d) return '';
    return `${d}${m}${y}`;
};

/**
 * Nom de fitxer d'una certificació segons la convenció de la norma: el del pressupost més
 * `#certification NNNN`. El número va a quatre xifres.
 */
export const nomFitxerCertificacio = (nomPressupost, numero) =>
    `${nomPressupost || 'projecte'}#certification ${String(numero).padStart(4, '0')}`;

const fNum = (n) => (n || 0).toString().replace('.', ',');

const parcialDe = (m) => (m.units || 0) * (m.length || 1) * (m.width || 1) * (m.height || 1);

/**
 * @param {object}   opcions
 * @param {object}   opcions.budget          projecte (per al nom i les fases)
 * @param {Array}    opcions.chapters        arbre ja resolt (`resolvedChapters`)
 * @param {object}   opcions.priceDatabase   base de preus
 * @param {?object}  opcions.certification   `{ cert, numero }` per fer el fitxer d'una
 *                                           certificació; res per fer el del pressupost
 * @returns {string} contingut del fitxer BC3
 */
export const generateBC3 = ({ budget, chapters, priceDatabase = {}, certification = null }) => {
    const concepts = new Map();          // normCode -> { unit, description, price, isDecomposed }
    const measurementsByCode = new Map();// normCode -> { total, lines }
    const relationships = new Map();     // normCode -> [{ child, factor, yield }]
    const residus = new Map();           // normCode del pare -> [component de residu]
    const propietatsResidu = new Map();  // normCode del component -> { ler, m, v }

    const certId = certification?.cert?.id || null;

    const getExportCode = (normCode) => {
        const concept = concepts.get(normCode);
        return (concept && concept.isDecomposed) ? `${normCode}#` : normCode;
    };

    /**
     * Amidament que va al fitxer per a una partida. En el pressupost són les seves línies;
     * en una certificació, les línies certificades —que sempre són l'acumulat a origen— o,
     * si s'ha entrat la quantitat a mà, una sola línia amb aquella quantitat.
     */
    const amidamentDe = (node) => {
        if (!certId) {
            const lines = node.measurements || [];
            return { lines, total: round2(lines.reduce((acc, m) => acc + parcialDe(m), 0)) };
        }
        const certData = node.certifications?.[certId];
        const total = round2(calcItemCertifiedQty(node, certId));
        if (certData?.measurements?.length > 0) return { lines: certData.measurements, total };
        if (total !== 0) {
            return { lines: [{ description: 'Certificat a origen', units: total, length: 1, width: 1, height: 1 }], total };
        }
        // Partida no certificada: hi va un zero explícit. La norma demana que un camp numèric
        // s'invalidi amb el zero escrit, no deixant-lo buit, i així la certificació diu
        // clarament que d'aquesta partida no se n'ha certificat res.
        return { lines: [], total: 0 };
    };

    const processNode = (node) => {
        const norm = normalizeCode(node.code);
        const hasChildren = (node.subChapters?.length > 0 || node.items?.length > 0);
        const hasBreakdown = (node.breakdown?.length > 0);

        if (!concepts.has(norm)) {
            concepts.set(norm, {
                unit: node.unit || '',
                description: node.description || '',
                fullDescription: node.fullDescription || '',
                price: node.price || 0,
                isDecomposed: false,
            });
        }

        const concept = concepts.get(norm);
        if (hasChildren || hasBreakdown) concept.isDecomposed = true;

        // El descomposat mana sobre els fills.
        //
        // Quan s'importa una partida amb descomposat, el parser en penja els components a
        // `breakdown` (amb el seu rendiment) i **també** a `items`, perquè tots dos surten del
        // mateix registre ~D. Escrivint els fills abans que el descomposat, el rendiment es
        // perdia: sortien tots a 1 i, en reimportar, el preu unitari passava a ser la suma dels
        // components sense multiplicar-los pel rendiment. Una partida de 15,01 €/m² en tornava
        // 201,72. Els fills que no siguin al descomposat s'hi afegeixen igualment després.
        if (hasBreakdown || hasChildren) {
            if (!relationships.has(norm)) relationships.set(norm, []);
            const rels = relationships.get(norm);
            const afegeix = (codi, rendiment) => {
                if (codi && !rels.some(r => r.child === codi)) rels.push({ child: codi, factor: 1, yield: rendiment });
            };
            (node.breakdown || []).forEach(b => {
                const bNorm = normalizeCode(b.code);
                afegeix(bNorm, b.yield || 1);
                if (!concepts.has(bNorm)) {
                    concepts.set(bNorm, { unit: b.unit || '', description: b.description || '', price: b.price || 0, isDecomposed: false });
                }
            });
            [...(node.subChapters || []), ...(node.items || [])].forEach(child => afegeix(normalizeCode(child.code), 1));
        }

        // Residus: el `~R` del pare i un `~X` per component. Sense això, exportar i
        // reimportar es menjava l'estimació de residus sencera.
        if (node.waste?.length > 0 && !residus.has(norm)) {
            residus.set(norm, node.waste);
            node.waste.forEach(w => {
                const codi = normalizeCode(w.code);
                if (!codi || propietatsResidu.has(codi)) return;
                propietatsResidu.set(codi, { ler: w.ler || '', m: w.massPerUnit ?? 1, v: w.volumePerUnit ?? 0 });
                if (!concepts.has(codi)) {
                    concepts.set(codi, { unit: w.unit || 'kg', description: w.description || '', price: 0, isDecomposed: false });
                }
            });
        }

        // Només les partides porten amidament; els capítols el tenen pels seus fills.
        if (node.unit) {
            const amidament = amidamentDe(node);
            const previ = measurementsByCode.get(norm);
            if (previ) {
                // Mateix codi en dos llocs de l'arbre: el registre ~M és per concepte, de
                // manera que s'hi acumulen les línies dels dos.
                previ.lines = [...previ.lines, ...amidament.lines];
                previ.total = round2(previ.total + amidament.total);
            } else {
                measurementsByCode.set(norm, { lines: [...amidament.lines], total: amidament.total });
            }
        }

        (node.subChapters || []).forEach(processNode);
        (node.items || []).forEach(processNode);
    };

    (chapters || []).forEach(processNode);

    Object.entries(priceDatabase).forEach(([code, data]) => {
        const norm = normalizeCode(code);
        if (norm && !concepts.has(norm)) {
            concepts.set(norm, { unit: data.unit || '', description: data.summary || '', price: data.price || 0, isDecomposed: false });
        }
    });

    const lines = [];

    // ── ~V: propietat i versió ──────────────────────────────────────────────────────
    // Ordre dels camps: PROPIETAT | VERSIO\DATA | PROGRAMA | CAPÇALERA | JOC_CARÀCTERS |
    // COMENTARI | TIPUS_INFORMACIO | NUM_CERTIFICACIO | DATA_CERTIFICACIO | URL_BASE
    const avui = dataFiebdc(new Date().toISOString().split('T')[0]);
    const nomProjecte = (budget?.name || 'PROJECTE').replace(/[|\\~]/g, ' ');
    if (certification) {
        const { cert, numero } = certification;
        // Al COMENTARI hi va el nom de la fase i prou: el número i la data tenen camp propi, i
        // qui llegeixi el fitxer en treu el nom de la certificació d'aquí.
        const comentari = (cert.name || `Certificació ${numero}`).replace(/[|\\~]/g, ' ');
        lines.push(`~V|${nomProjecte}|${VERSIO_FORMAT}\\${avui}|${NOM_PROGRAMA}||ANSI|${comentari}|3|${numero}|${dataFiebdc(cert.date)}|`);
    } else {
        lines.push(`~V|${nomProjecte}|${VERSIO_FORMAT}\\${avui}|${NOM_PROGRAMA}||ANSI|Pressupost|2|||`);
    }
    lines.push('~K|\\0\\0\\0\\2\\2\\2\\2\\');

    // Concepte arrel
    if ((chapters || []).length > 0) {
        lines.push(`~C|##|u|${nomProjecte}|0|0|0|0\\0\\0`);
        const rootChildren = chapters.map(ch => `${getExportCode(normalizeCode(ch.code))}\\1\\1`).join('\\');
        lines.push(`~D|##|${rootChildren}`);
    }

    // Conceptes (~C, ~T)
    concepts.forEach((data, norm) => {
        const exportCode = getExportCode(norm);
        const isPercent = data.unit === '%';
        const price = isPercent ? (data.price / 100) : data.price;
        lines.push(`~C|${exportCode}|${data.unit}|${data.description}|${fNum(price)}|0|0|0\\0\\0`);
        if (data.fullDescription) lines.push(`~T|${exportCode}|${data.fullDescription}`);
    });

    // Descomposicions (~D)
    relationships.forEach((rels, norm) => {
        const exportCode = getExportCode(norm);
        const childStr = rels.map(r => {
            const childConcept = concepts.get(r.child);
            const isPercent = childConcept?.unit === '%';
            const yld = isPercent ? (r.yield / 100) : r.yield;
            return `${getExportCode(r.child)}\\${fNum(r.factor)}\\${fNum(yld)}`;
        }).join('\\');
        if (childStr) lines.push(`~D|${exportCode}|${childStr}`);
    });

    // Propietats dels conceptes i residus (~X i ~R)
    //
    //   ~X | [CODI] | {PROPIETAT\VALOR\}          propietats del concepte
    //   ~R | PARE   | {TIPUS\FILL\{PROP\VALOR\[UM]\}|}   components que generen residu
    //
    // Del `~X` en surten dues coses diferents: el codi LER, la massa i el volum dels components
    // de residu, i el cost energètic i les emissions de CO₂ dels materials, que viuen a la base
    // de preus. Un mateix concepte pot tenir-les totes dues, i llavors van al mateix registre.
    const propietatsX = new Map();
    const posa = (codi, dades) => {
        if (!codi) return;
        propietatsX.set(codi, { ...(propietatsX.get(codi) || {}), ...dades });
    };
    propietatsResidu.forEach((p, codi) => posa(codi, { ler: p.ler, m: p.m, v: p.v }));
    Object.entries(priceDatabase).forEach(([codi, dades]) => {
        const norm = normalizeCode(codi);
        const ce = Number(dades?.energy);
        const co2 = Number(dades?.co2);
        if (Number.isFinite(ce)) posa(norm, { ce });
        if (Number.isFinite(co2)) posa(norm, { eCO2: co2 });
    });

    if (propietatsX.size > 0) {
        // El primer `~X`, amb el codi buit, declara què vol dir cada propietat: és la capçalera
        // que la norma demana i sense la qual un altre programa no sap què són `ce`, `ler` o `v`.
        lines.push('~X||ce\\Cost energètic\\MJ\\eCO2\\Emissió de CO2\\kg\\ler\\Codi LER\\\\m\\Massa de l\'element\\kg\\v\\Volum\\m3\\|');
        propietatsX.forEach((p, codi) => {
            // Només s'escriuen les propietats que el concepte té de veritat: un zero escrit
            // voldria dir «zero MJ», que no és el mateix que «no se'n sap res».
            const trossos = [];
            if (p.ce !== undefined) trossos.push(`ce\\${fNum(p.ce)}`);
            if (p.eCO2 !== undefined) trossos.push(`eCO2\\${fNum(p.eCO2)}`);
            if (p.ler !== undefined) trossos.push(`ler\\${p.ler}`);
            if (p.m !== undefined) trossos.push(`m\\${fNum(p.m)}`);
            if (p.v !== undefined) trossos.push(`v\\${fNum(p.v)}`);
            if (trossos.length > 0) lines.push(`~X|${codi}|${trossos.join('\\')}\\|`);
        });
    }
    residus.forEach((components, norm) => {
        const blocs = components
            // L'embalatge que ve d'un material NO es reescriu aquí: el material també és un
            // node de l'arbre —el parser el crea a partir del `~D`— i ja porta el seu propi
            // `~R`. Escrivint-lo a totes dues bandes, cada cicle d'exportació hi sumava una
            // altra vegada l'embalatge: 19,99 kg passaven a 21,44, a 22,89…
            .filter(w => w.origin !== 'packaging')
            .map(w => {
                const codi = normalizeCode(w.code);
                // El residu de col·locació es declara amb el FACTOR, no amb la quantitat: la
                // norma el calcula com a rendiment del descomposat × factor, i escrivint-hi la
                // quantitat ja resolta un altre programa la tornaria a multiplicar.
                if (w.origin === 'placement') return `0\\${codi}\\wf\\${fNum(w.wasteFactor ?? 0)}\\\\`;
                // L'embalatge d'un material es reescriu com a component addicional de la
                // partida, amb la quantitat ja multiplicada. Es perd de quin material venia
                // —no és un node de l'arbre i no en tenim registre propi— però la xifra i el
                // codi LER es conserven, que és el que compta per a l'estimació.
                return `${w.type ?? '3'}\\${codi}\\r\\${fNum(w.quantity)}\\\\`;
            })
            .join('|');
        if (blocs) lines.push(`~R|${getExportCode(norm)}|${blocs}|`);
    });

    // Amidaments (~M)
    //
    //   ~M | [PARE\]FILL | {POSICIO\} | AMIDAMENT_TOTAL | {TIPUS\COMENTARI\U\L\A\H\} | ETIQUETA
    //
    // El primer subcamp de cada bloc és el TIPUS de línia, no la fase: es deixa buit, que és
    // el que la norma diu que hi ha d'anar en una línia normal. La POSICIO es deixa buida
    // perquè els amidaments s'agrupen per concepte i un mateix codi pot sortir a més d'un
    // capítol, cas en què no hi hauria una posició única per declarar.
    measurementsByCode.forEach((amidament, norm) => {
        const exportCode = getExportCode(norm);
        const mLines = amidament.lines
            .map(m => `\\${(m.description || '').replace(/[|\\~]/g, ' ')}\\${fNum(m.units)}\\${fNum(m.length)}\\${fNum(m.width)}\\${fNum(m.height)}\\`)
            .join('');
        lines.push(`~M|${exportCode}||${fNum(round2(amidament.total))}|${mLines}|`);
    });

    return lines.join('\n');
};
