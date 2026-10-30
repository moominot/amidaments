import { describe, it, expect } from 'vitest';
import { parseCadClipboard, cadEntitiesToMeasurements, cadUnitKind } from '../src/utils/cadPaste.js';
import { calcMeasureTotal } from '../src/utils/calculations.js';

// Text tal com el deixa l'ordre AMIDA de `public/cad/amidaments.lsp`, amb CRLF.
const T = '\t';
const fila = (...c) => c.join(T);
const TEXT = [
    fila('AMIDAMENTS-CAD', '1', 'planta.dwg'),
    fila('LWPOLYLINE', '1', '14.0000', '12.0000', 'A-PAVIMENT', '', '2A1'),  // rectangle 4 × 3
    fila('LWPOLYLINE', '0', '7.5000', '0.0000', 'A-MUR', '', '2A2'),
    fila('LINE', '0', '2.2500', '0.0000', 'A-MUR', '', '2A3'),
    fila('HATCH', '1', '0.0000', '5.5000', 'A-PAVIMENT', '', '2A4'),
    fila('INSERT', '0', '0.0000', '0.0000', 'A-SANITARIS', 'LAVABO', '2A5'),
].join('\r\n') + '\r\n';

const parcials = (lines) => lines.map(calcMeasureTotal);

describe('Enganxat des del CAD', () => {
    it('reconeix només el text del LISP', () => {
        expect(parseCadClipboard('https://exemple.cat/fitxer.bc3')).toBeNull();
        expect(parseCadClipboard('')).toBeNull();
        const d = parseCadClipboard(TEXT);
        expect(d.drawing).toBe('planta.dwg');
        expect(d.entities).toHaveLength(5);
        expect(d.entities[0]).toMatchObject({ type: 'LWPOLYLINE', closed: true, length: 14, area: 12, layer: 'A-PAVIMENT' });
        expect(d.entities[4]).toMatchObject({ type: 'INSERT', name: 'LAVABO' });
    });

    it('accepta la coma decimal i el BOM', () => {
        const d = parseCadClipboard('\uFEFF' + fila('AMIDAMENTS-CAD', '1') + '\n' + fila('LINE', '0', '2,5', '0', 'C'));
        expect(d.entities[0].length).toBe(2.5);
    });

    it('redueix les unitats del sector', () => {
        expect(cadUnitKind('m²')).toBe('m2');
        expect(cadUnitKind('M2')).toBe('m2');
        expect(cadUnitKind('m³')).toBe('m3');
        expect(cadUnitKind('ml')).toBe('m');
        expect(cadUnitKind('u')).toBe('ud');
        expect(cadUnitKind('Ud.')).toBe('ud');
        expect(cadUnitKind('kg')).toBeNull();
        expect(cadUnitKind('h')).toBeNull();
    });

    it('en m2, la tancada és superfície i l\'oberta queda pendent d\'alçada', () => {
        const { entities } = parseCadClipboard(TEXT);
        const r = cadEntitiesToMeasurements(entities, 'm2');
        // El bloc no té ni àrea ni llargada.
        expect(r.lines).toHaveLength(4);
        expect(r.skipped.map(e => e.type)).toEqual(['INSERT']);
        expect(parcials(r.lines)).toEqual([12, 7.5, 2.25, 5.5]);
        expect(r.lines.map(l => !!l.needsHeight)).toEqual([false, true, true, false]);
        expect(r.pendingHeight).toBe(2);
        expect(r.lines[0].description).toBe('A-PAVIMENT');
    });

    it('en m, la llargada de tot el que en tingui, tancat o no', () => {
        const { entities } = parseCadClipboard(TEXT);
        const r = cadEntitiesToMeasurements(entities, 'm');
        expect(parcials(r.lines)).toEqual([14, 7.5, 2.25]);
        expect(r.lines.some(l => l.needsHeight)).toBe(false);
        expect(r.skipped.map(e => e.type)).toEqual(['HATCH', 'INSERT']);
    });

    it('en ud, una per entitat sigui el que sigui', () => {
        const { entities } = parseCadClipboard(TEXT);
        const r = cadEntitiesToMeasurements(entities, 'ud');
        expect(parcials(r.lines)).toEqual([1, 1, 1, 1, 1]);
        expect(r.lines[4].description).toBe('LAVABO');
        expect(r.skipped).toHaveLength(0);
    });

    it('en m3 sempre en falta una dimensió', () => {
        const { entities } = parseCadClipboard(TEXT);
        const r = cadEntitiesToMeasurements(entities, 'm3');
        expect(r.pendingHeight).toBe(4);
        expect(r.pendingWidth).toBe(2);
        expect(r.lines.filter(l => l.needsWidth).map(l => l.length)).toEqual([7.5, 2.25]);
    });

    it('una unitat que no s\'amida des del CAD no genera res', () => {
        const { entities } = parseCadClipboard(TEXT);
        const r = cadEntitiesToMeasurements(entities, 'kg');
        expect(r.kind).toBeNull();
        expect(r.lines).toHaveLength(0);
    });
});
