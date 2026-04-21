import { normalizeCode } from './calculations';

/**
 * Parser per al format FIEBDC-3 (BC3)
 */

export const processBC3Data = (text) => {
    if (!text) return null;

    const records = text.split('~').map(r => r.trim()).filter(r => r.length > 0);
    const concepts = {};
    const relations = {};
    const measurements = [];
    const longTexts = {};
    const phases = []; // [{ id, code, name, date }]

    records.forEach(record => {
        const type = record[0];
        const content = record.substring(2);
        const fields = content.split('|');

        switch (type) {
            case 'C':
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
            case 'T':
                const tCodeRaw = fields[0].trim();
                const tCode = normalizeCode(tCodeRaw);
                if (tCode) longTexts[tCode] = fields[1]?.trim();
                break;
            case 'F':
                const fCode = fields[0]?.trim();
                const fDate = fields[1]?.trim();
                const fTitle = fields[2]?.trim();
                if (fCode && fCode !== '0') {
                    phases.push({
                        id: crypto.randomUUID(),
                        code: fCode,
                        name: fTitle || `Certificació ${fCode}`,
                        date: fDate ? `${fDate.substring(0, 4)}-${fDate.substring(4, 6)}-${fDate.substring(6, 8)}` : new Date().toISOString().split('T')[0],
                        approved: true,
                        method: 'origin'
                    });
                }
                break;
            case 'D':
                const pCode = normalizeCode(fields[0]);
                const rawChildren = fields[1]?.trim() || fields[2]?.trim();
                if (pCode && rawChildren) {
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
            case 'M':
                const mPathParts = fields[0]?.split('\\') || [];
                const targetCode = normalizeCode(mPathParts[mPathParts.length - 1]);

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
                break;
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

        const node = {
            id: crypto.randomUUID(),
            code: concept.originalCode,
            description: concept.summary,
            fullDescription: longTexts[normCode] || concept.summary,
            unit: concept.unit,
            price: concept.price,
            breakdown,
            measurements: itemMeasurements,
            certifications: certData
        };

        const children = (relations[normCode] || [])
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
    const roots = Object.keys(concepts).filter(c => !allChildren.has(c));
    
    // Si no hi ha una arrel clara, usem el primer concepte 'C' que tingui fills
    const finalRoots = roots.length > 0 ? roots : [Object.keys(relations)[0]];
    const tree = finalRoots.map(r => buildTree(r)).filter(n => n !== null);

    return {
        name: concepts[finalRoots[0]]?.summary || 'Projecte Importat',
        chapters: tree,
        phases: phases
    };
};
