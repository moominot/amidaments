import { normalizeCode } from './calculations';

/**
 * Parser per al format FIEBDC-3 (BC3)
 */

/** Un ISO `YYYY-MM-DD` a partir del DDMMYYYY del format. Torna null si no hi ha data. */
const dataDeFiebdc = (raw) => {
    const net = (raw || '').trim();
    if (!/^\d{8}$/.test(net)) return null;
    return `${net.substring(4, 8)}-${net.substring(2, 4)}-${net.substring(0, 2)}`;
};

export const processBC3Data = (text) => {
    if (!text) return null;

    const records = text.split('~').map(r => r.trim()).filter(r => r.length > 0);
    const concepts = {};
    const relations = {};
    const measurements = [];
    const longTexts = {};
    const phases = []; // [{ id, code, name, date }]

    // Residus. `~X` són les propietats de cada concepte (codi LER, massa, volum) i `~R` la
    // relació entre una partida i els components que en generen. Veure `docs/residus.md`.
    const wasteProperties = {};   // id de propietat -> { label, unit }
    const propietatsPerCodi = {}; // normCode -> { ler, m, v, ... }
    const residusPerCodi = {};    // normCode del pare -> [{ type, child, props }]

    // Què és aquest fitxer, segons el seu registre ~V. TIPUS_INFORMACIO 3 vol dir que és una
    // certificació: mateixa estructura que un pressupost, però els amidaments són el que s'ha
    // executat a origen. Veure `utils/bc3Writer.js`.
    const info = { type: null, certNumber: null, certDate: null, comment: '', owner: '' };

    records.forEach(record => {
        const type = record[0];
        const content = record.substring(2);
        const fields = content.split('|');

        switch (type) {
            case 'V': {
                // ~V | PROPIETAT | VERSIO\\DATA | PROGRAMA | CAPÇALERA | JOC_CARÀCTERS |
                //    | COMENTARI | TIPUS_INFORMACIO | NUM_CERTIFICACIO | DATA_CERTIFICACIO | URL
                info.owner = fields[0]?.trim() || '';
                info.comment = fields[5]?.trim() || '';
                const tipus = parseInt(fields[6]);
                if (Number.isFinite(tipus)) info.type = tipus;
                const num = parseInt(fields[7]);
                if (Number.isFinite(num)) info.certNumber = num;
                info.certDate = dataDeFiebdc(fields[8]);
                break;
            }
            case 'C': {
                const codeRaw = fields[0].split('\\')[0].trim();
                const normCode = normalizeCode(codeRaw);
                const unit = fields[1]?.trim();
                const summary = fields[2]?.trim();
                const prices = fields[3] ? fields[3].split('\\').map(p => parseFloat(p.replace(',', '.')) || 0) : [0];

                concepts[normCode] = {
                    originalCode: codeRaw,
                    code: normCode,
                    unit,
                    summary,
                    price: prices[0]
                };
                break;
            }
            case 'T': {
                const tCodeRaw = fields[0].trim();
                const tCode = normalizeCode(tCodeRaw);
                if (tCode) longTexts[tCode] = fields[1]?.trim();
                break;
            }
            case 'F': {
                // A la norma, ~F és el registre de DOCUMENTS ADJUNTS:
                //   ~F | CODI_CONCEPTE | {TIPUS\\{FITXER.EXT;}\\[DESCRIPCIO]\\} | [URL_EXT] |
                // Fins a l'agost de 2026 aquesta aplicació hi escrivia les fases de
                // certificació, i encara hi ha projectes exportats així. Es continuen llegint,
                // però només quan el registre té la forma d'aquells: número de fase curt i una
                // data de vuit xifres, cosa que un adjunt de veritat no té mai.
                const fCode = fields[0]?.trim();
                const fDate = fields[1]?.trim();
                const fTitle = fields[2]?.trim();
                const semblaFase = /^\d{1,3}$/.test(fCode || '') && fCode !== '0' && /^\d{8}$/.test(fDate || '');
                if (semblaFase) {
                    phases.push({
                        id: crypto.randomUUID(),
                        code: fCode,
                        name: fTitle || `Certificació ${fCode}`,
                        // Aquells fitxers escrivien la data com YYYYMMDD, no com DDMMYYYY.
                        date: `${fDate.substring(0, 4)}-${fDate.substring(4, 6)}-${fDate.substring(6, 8)}`,
                        approved: true,
                        method: 'origin'
                    });
                }
                break;
            }
            case 'X': {
                // Capçalera (codi buit): tripletes id\etiqueta\unitat, una per propietat.
                //   ~X||ce\Cost energètic\MJ\eCO2\Emissió de CO2\kg\ler\Codi LER\\…
                // Per concepte: parelles id\valor.
                //   ~X|re150101|ler\15 01 01\m\1.000000\v\0.001333\
                const xCode = normalizeCode(fields[0]);
                const trossos = (fields[1] || '').split('\\').map(t => t.trim());
                if (!fields[0]?.trim()) {
                    for (let i = 0; i + 1 < trossos.length; i += 3) {
                        if (trossos[i]) wasteProperties[trossos[i]] = { label: trossos[i + 1] || '', unit: trossos[i + 2] || '' };
                    }
                } else if (xCode) {
                    const props = propietatsPerCodi[xCode] || (propietatsPerCodi[xCode] = {});
                    for (let i = 0; i + 1 < trossos.length; i += 2) {
                        if (trossos[i]) props[trossos[i]] = trossos[i + 1];
                    }
                }
                break;
            }
            case 'R': {
                // ~R | PARE | {TIPUS\FILL\{PROPIETAT\VALOR\[UM]\}|}
                // Cada camp a partir del primer és un component de residu.
                const rCode = normalizeCode(fields[0]);
                if (!rCode) break;
                const components = residusPerCodi[rCode] || (residusPerCodi[rCode] = []);
                fields.slice(1).forEach(bloc => {
                    const t = bloc.split('\\').map(x => x.trim());
                    const [tipus, fill] = t;
                    if (!fill) return;
                    const props = {};
                    for (let i = 2; i + 1 < t.length; i += 3) {
                        if (t[i]) props[t[i]] = t[i + 1];
                    }
                    components.push({ type: tipus || '', child: normalizeCode(fill), props });
                });
                break;
            }
            case 'D': {
                const pCode = normalizeCode(fields[0]);
                const rawChildren = fields[1]?.trim() || fields[2]?.trim();
                // El concepte arrel del pressupost es codifica «##», i `normalizeCode` treu els
                // coixinets finals, de manera que en queda la cadena buida. Comprovar `pCode` a
                // seques la descartava com si fos un registre sense codi, i amb ella la llista
                // de capítols del projecte: en reimportar un fitxer nostre, els capítols es
                // quedaven sense pare i sortien en l'ordre en què l'objecte els retornava
                // («10», «11»… abans que «00»), no en el del projecte.
                if (fields[0]?.trim() && rawChildren) {
                    const parts = rawChildren.split('\\');
                    const children = [];
                    for (let i = 0; i < parts.length; i += 3) {
                        const cCode = normalizeCode(parts[i]);
                        if (cCode) {
                            children.push({
                                child: cCode,
                                factor: parseFloat((parts[i + 1] || '1').replace(',', '.')) || 1,
                                yield: parseFloat((parts[i + 2] || '1').replace(',', '.')) || 1
                            });
                        }
                    }
                    relations[pCode] = children;
                }
                break;
            }
            case 'M': {
                const mPathParts = fields[0]?.split('\\') || [];
                const targetCode = normalizeCode(mPathParts[mPathParts.length - 1]);

                // MEDICION_TOTAL: el total que declara el fitxer. La detecció de línies de
                // sota és heurística (blocs de 5, 6 o 7 camps segons qui hagi generat el
                // fitxer), així que aquest valor serveix de xarxa de seguretat: si el que
                // n'hem tret no hi quadra, val més fiar-se del que diu el fitxer.
                const totalDeclarat = parseFloat((fields[2] || '').replace(',', '.'));

                let mLinesRaw = null;
                let maxWeight = -1;

                for (let i = 1; i <= 4; i++) {
                    const content = fields[i] || '';
                    const bCount = (content.match(/\\/g) || []).length;
                    // Mínim 4 barres per considerar-ho línies d'amidament (per evitar FASE\LINEA\)
                    if (bCount >= 4) {
                        const parts = content.split('\\');
                        const actualParts = parts[0] === '' ? parts.slice(1) : parts;
                        let weight = bCount;
                        // Prioritzem formats coneguts
                        if (actualParts.length >= 5 && (actualParts.length % 5 === 0 || actualParts.length % 6 === 0 || actualParts.length % 7 === 0)) {
                            weight += 20;
                        }
                        if (weight > maxWeight) {
                            maxWeight = weight;
                            mLinesRaw = content;
                        }
                    }
                }

                if (mLinesRaw) {
                    const mLines = mLinesRaw.split('\\');
                    const startIdx = mLines[0] === '' ? 1 : 0;
                    const remainingLength = mLines.length - startIdx;
                    
                    // Millora: Detectem el step provant quin d'ells té més camps numèrics vàlids
                    const testStep = (s) => {
                        if (remainingLength % s !== 0) return -1;
                        let validScore = 0;
                        let off = (s === 7) ? 1 : 0;
                        // Provem els primers 3 blocs
                        for (let k = 0; k < Math.min(3, remainingLength / s); k++) {
                            const base = startIdx + k * s + off;
                            // Camps U, L, A, H
                            for (let j = 1; j <= 4; j++) {
                                const val = mLines[base + j];
                                if (val === undefined) continue;
                                if (val === '' || !isNaN(parseFloat(val.replace(',', '.')))) {
                                    validScore++;
                                } else {
                                    validScore -= 10; // Penalitzem fort si hi ha text on hi hauria d'haver números
                                }
                            }
                        }
                        return validScore;
                    };

                    const scores = {
                        6: testStep(6),
                        5: testStep(5),
                        7: testStep(7)
                    };

                    let step = 6;
                    if (scores[6] >= scores[5] && scores[6] >= scores[7]) step = 6;
                    else if (scores[5] >= scores[7]) step = 5;
                    else if (scores[7] !== -1) step = 7;

                    let offset = (step === 7) ? 1 : 0;

                    for (let i = startIdx; i < mLines.length; i += step) {
                        const phaseVal = (step === 7) ? (parseInt(mLines[i]) || 0) : 0;
                        
                        const desc = mLines[i + offset]?.trim() || '';
                        const uStr = (mLines[i + offset + 1] || '0').replace(',', '.');
                        const u = parseFloat(uStr) || 0;
                        const l = parseFloat((mLines[i + offset + 2] || '1').replace(',', '.')) || 1;
                        const a = parseFloat((mLines[i + offset + 3] || '1').replace(',', '.')) || 1;
                        const h = parseFloat((mLines[i + offset + 4] || '1').replace(',', '.')) || 1;

                        // Acceptem línies amb u=0 si tenen descripció (són títols/subcapítols d'amidament)
                        if (u === 0 && !desc) continue;

                        measurements.push({
                            target: targetCode,
                            phase: phaseVal,
                            description: desc || 'Importat',
                            units: u,
                            length: l,
                            width: a,
                            height: h
                        });
                    }
                } else {
                    for (let i = 1; i <= 4; i++) {
                        const valStr = (fields[i] || '').replace(',', '.');
                        const val = parseFloat(valStr);
                        if (!isNaN(val) && val !== 0 && !fields[i].includes('\\')) {
                            measurements.push({
                                target: targetCode,
                                phase: 0,
                                description: 'Amidament base',
                                units: val,
                                length: 1, width: 1, height: 1
                            });
                            break;
                        }
                    }
                }

                // Contrast amb el total declarat. Només per als registres sense fases: amb
                // fases el MEDICION_TOTAL no diu a quina correspon i no es pot repartir.
                if (Number.isFinite(totalDeclarat)) {
                    const propies = measurements.filter(m => m.target === targetCode);
                    const teFases = propies.some(m => m.phase !== 0);
                    if (!teFases) {
                        const suma = propies.reduce(
                            (acc, m) => acc + (m.units || 0) * (m.length || 1) * (m.width || 1) * (m.height || 1), 0);
                        if (Math.abs(suma - totalDeclarat) > 0.02) {
                            // Les línies llegides no reprodueixen el total del fitxer: les
                            // descartem i deixem el total declarat, que és el que quadra amb
                            // el PEM del document d'origen.
                            for (let i = measurements.length - 1; i >= 0; i--) {
                                if (measurements[i].target === targetCode) measurements.splice(i, 1);
                            }
                            if (totalDeclarat !== 0) {
                                measurements.push({
                                    target: targetCode,
                                    phase: 0,
                                    description: 'Amidament total (segons BC3)',
                                    units: totalDeclarat,
                                    length: 1, width: 1, height: 1
                                });
                            }
                        }
                    }
                }
                break;
            }
        }
    });

    const buildTree = (normCode, stack = new Set()) => {
        if (stack.has(normCode)) return null;
        const concept = concepts[normCode];
        if (!concept) return null;

        const nextStack = new Set(stack);
        nextStack.add(normCode);

        const breakdown = [];
        (relations[normCode] || []).forEach(rel => {
            const childConcept = concepts[rel.child];
            const unitPrice = childConcept?.price || 0;
            const childUnit = childConcept?.unit || '';
            const isPercent = childUnit === '%';
            const lineYield = isPercent ? (rel.yield * rel.factor * 100) : (rel.yield * rel.factor);
            const lineTotal = isPercent ? (lineYield / 100) * unitPrice : lineYield * unitPrice;

            breakdown.push({
                code: rel.child,
                description: childConcept?.summary || 'Sense descripció',
                unit: childConcept?.unit || '',
                yield: lineYield,
                price: unitPrice,
                total: lineTotal
            });
        });

        if (breakdown.length === 0 && concept.unit && concept.price > 0) {
            breakdown.push({
                code: 'pa' + concept.originalCode,
                description: concept.summary,
                unit: concept.unit,
                yield: 1,
                price: concept.price,
                total: concept.price
            });
        }

        const itemMeasurements = measurements.filter(m => m.target === normCode && m.phase === 0).map(m => ({
            id: crypto.randomUUID(),
            description: m.description,
            units: m.units,
            length: m.length,
            width: m.width,
            height: m.height
        }));

        const certData = {};
        phases.forEach(phase => {
            const phaseM = measurements.filter(m => m.target === normCode && parseInt(m.phase) === parseInt(phase.code));
            if (phaseM.length > 0) {
                certData[phase.id] = {
                    quantity: phaseM.reduce((acc, m) => acc + (m.units * m.length * m.width * m.height), 0),
                    measurements: phaseM.map(m => ({
                        id: crypto.randomUUID(),
                        description: m.description,
                        units: m.units,
                        length: m.length,
                        width: m.width,
                        height: m.height
                    }))
                };
            }
        });

        // Residus de la partida.
        //
        // Es desen les tres magnituds primitives i no la massa ja multiplicada: `quantity` és
        // quant component surt per unitat de partida, i `massPerUnit`/`volumePerUnit` són la
        // massa i el volum per unitat de component, que és el que diu el `~X`. Guardant només
        // el producte es perdrien els components declarats amb quantitat zero —els envasos
        // ho són sovint— i en exportar no es podria refer el `~X`.
        const numero = (valor, defecte) => {
            const n = parseFloat(String(valor ?? '').replace(',', '.'));
            return Number.isFinite(n) ? n : defecte;
        };
        const waste = (residusPerCodi[normCode] || []).map(rel => {
            const x = propietatsPerCodi[rel.child] || {};
            const fill = concepts[rel.child];
            return {
                code: fill?.originalCode || rel.child,
                description: fill?.summary || '',
                unit: fill?.unit || 'kg',
                type: rel.type,
                ler: (x.ler || '').replace(/\s+/g, ' ').trim(),
                // La norma diu `o` (rendiment); CYPE hi escriu `r`. S'accepten tots dos.
                quantity: numero(rel.props.r ?? rel.props.o, 0),
                massPerUnit: numero(x.m, 1),
                volumePerUnit: numero(x.v, 0),
            };
        });

        const node = {
            id: crypto.randomUUID(),
            code: concept.originalCode,
            description: concept.summary,
            fullDescription: longTexts[normCode] || concept.summary,
            unit: concept.unit,
            price: concept.price,
            breakdown,
            measurements: itemMeasurements,
            certifications: certData,
            ...(waste.length > 0 ? { waste } : {}),
        };

        const children = (relations[normCode] || [])
            .filter(rel => {
                const childConcept = concepts[rel.child];
                return childConcept?.unit !== '%'; // No afegim els conceptes de % com a ítems separats
            })
            .map(rel => buildTree(rel.child, nextStack))
            .filter(n => n !== null);

        if (node.unit) {
            node.items = children;
            node.subChapters = [];
        } else {
            node.subChapters = children.filter(c => !c.unit);
            node.items = children.filter(c => c.unit);
        }

        return node;
    };

    // Busquem l'arrel (normalment el concepte que no és fill de ningú, o el primer 'C' sense relacions d'entrada)
    const allChildren = new Set(Object.values(relations).flat().map(r => r.child));
    const teAmidament = new Set(measurements.map(m => m.target));
    const roots = Object.keys(concepts)
        .filter(c => !allChildren.has(c))
        // Un concepte de percentatge és un component del preu, mai una partida del projecte.
        // Com a fill ja s'excloïa; com a arrel s'hi colava.
        .filter(c => concepts[c].unit !== '%')
        // Un concepte que no és fill de ningú només és un node del projecte si es descompon
        // —és un capítol— o si porta amidament —és una partida.
        //
        // Sense això, importar una partida del Generador de Preus de CYPE hi afegia també els
        // disset conceptes de gestió de residus que porta el fitxer (`re150101`, `ruo170101`…),
        // que no són partides d'obra sinó entrades de banc de preus: no els referencia ningú i
        // no tenen amidament. On han d'anar és a `prices`, i ja hi van.
        //
        // Els fitxers que són una llista plana de partides sense estructura (~C i ~M sense cap
        // ~D) continuen entrant: cadascuna porta el seu amidament.
        .filter(c => (relations[c] || []).length > 0 || teAmidament.has(c));
    
    // Si no hi ha una arrel clara, usem el primer concepte 'C' que tingui fills
    
    const finalRoots = roots.length > 0 ? roots : [Object.keys(relations)[0]];
    const tree = [];
    let projectName = 'Projecte Importat';

    finalRoots.forEach(r => {
        const node = buildTree(r);
        if (node) {
            // Si és un node d'arrel de projecte (té ##), l'aplanem
            if (node.code.includes('##')) {
                projectName = node.description || projectName;
                if (node.subChapters) tree.push(...node.subChapters);
                if (node.items) tree.push(...node.items);
            } else {
                tree.push(node);
            }
        }
    });

    // Construïm la base de dades de preus, excloent els conceptes de %
    const prices = {};
    Object.keys(concepts).forEach(c => {
        const concept = concepts[c];
        // El concepte arrel («##», que normalitzat queda buit) no és un preu: si entrava a la
        // base, la següent exportació escrivia un ~C sense codi i el fitxer es desmuntava.
        if (c && concept.unit !== '%') {
            prices[c] = {
                code: concept.originalCode,
                price: concept.price,
                summary: concept.summary,
                unit: concept.unit
            };
        }
    });

    return {
        name: projectName,
        chapters: tree,
        phases: phases,
        prices: prices,
        info,
        wasteProperties,
    };
};
