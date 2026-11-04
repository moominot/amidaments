import { describe, it, expect } from 'vitest';
import { ambImport, walkPrintTree } from '../src/utils/printTree';

/**
 * walkPrintTree és l'única implementació de la lògica que decideix quins capítols/partides
 * surten a la previsualització i al PDF d'amidaments (maxLevels, numeració correlativa,
 * amagar import 0). Abans cada sortida la reimplementava pel seu compte i van divergir dues
 * vegades real (§32 de docs/estat-actual.md): un cop amb les columnes desplaçades, un altre
 * perdent sencer el subarbre d'un capítol aplanat. Aquests tests fixen el comportament
 * correcte perquè no torni a passar en cap de les dues sortides.
 */

// Amb una sola línia d'1x1x1, la quantitat total és `qty` i l'import és `qty * price`.
const partida = (code, { unit = 'm2', price = 10, qty = 1 } = {}) => ({
    id: code,
    code,
    unit,
    description: code,
    price,
    measurements: qty ? [{ units: qty, length: 1, width: 1, height: 1 }] : [],
});
const capitol = (code, { subChapters = [], items = [] } = {}) => ({ id: code, code, description: code, subChapters, items });

const recorre = (nodes, config) => {
    const events = [];
    walkPrintTree(nodes, config, {}, {
        onChapterHeader: ({ node, level, displayCode }) => events.push(['chapter', node.code, level, displayCode]),
        onItem: ({ node, displayCode }) => events.push(['item', node.code, displayCode]),
        onChapterFooter: ({ node, level, displayCode }) => events.push(['chapter-footer', node.code, level, displayCode]),
    });
    return events;
};

describe('walkPrintTree', () => {
    it('amb maxLevels superat, aplana el subcapítol però no en perd les partides', () => {
        const arbre = [
            capitol('01', {
                subChapters: [capitol('01.01', { items: [partida('A')] })],
                items: [partida('C')],
            }),
        ];

        const events = recorre(arbre, { maxLevels: 1, useCorrelativeCodes: true });

        // El subcapítol 01.01 no obre capçalera pròpia...
        expect(events.find(e => e[0] === 'chapter' && e[1] === '01.01')).toBeUndefined();
        // ...però la partida que hi penjava dins no es perd.
        expect(events).toEqual([
            ['chapter', '01', 0, '1'],
            ['item', 'A', '1.1'],
            ['item', 'C', '1.2'],
            ['chapter-footer', '01', 0, '1'],
        ]);
    });

    it('amb prou maxLevels, el subcapítol sí que obre la seva pròpia capçalera i numeració', () => {
        const arbre = [
            capitol('01', {
                subChapters: [capitol('01.01', { items: [partida('A')] })],
                items: [partida('C')],
            }),
        ];

        const events = recorre(arbre, { maxLevels: 5, useCorrelativeCodes: true });

        expect(events).toEqual([
            ['chapter', '01', 0, '1'],
            ['chapter', '01.01', 1, '1.1'],
            ['item', 'A', '1.1.1'],
            ['chapter-footer', '01.01', 1, '1.1'],
            ['item', 'C', '1.2'],
            ['chapter-footer', '01', 0, '1'],
        ]);
    });

    it('sense codis correlatius, fa servir el codi original del node', () => {
        const arbre = [capitol('CAP01', { items: [partida('PART01')] })];

        const events = recorre(arbre, { maxLevels: 5, useCorrelativeCodes: false });

        expect(events).toEqual([
            ['chapter', 'CAP01', 0, 'CAP01'],
            ['item', 'PART01', 'PART01'],
            ['chapter-footer', 'CAP01', 0, 'CAP01'],
        ]);
    });
});

describe('ambImport', () => {
    it('sense hideZeroItems, no filtra res', () => {
        const nodes = [partida('A', { price: 0 }), partida('B', { price: 10 })];
        expect(ambImport(nodes, { hideZeroItems: false }, {})).toEqual(nodes);
    });

    it('amb hideZeroItems, treu les partides amb import 0 i els capítols que només en tenen', () => {
        const nodes = [
            partida('A', { price: 0 }),
            partida('B', { price: 10 }),
            capitol('ZERO', { items: [partida('Z1', { price: 0 })] }),
            capitol('NOZERO', { items: [partida('N1', { price: 10 })] }),
        ];
        const filtrats = ambImport(nodes, { hideZeroItems: true }, {}).map(n => n.code);
        expect(filtrats).toEqual(['B', 'NOZERO']);
    });
});
