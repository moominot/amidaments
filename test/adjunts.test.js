import { describe, it, expect } from 'vitest';
import {
    midaReduida, contingutMissatge, blocAdjunt, pesConversa, comprovaAdjunts, tipusAdmes,
    MAX_IMATGES_CONVERSA, MAX_BASE64_CONVERSA,
} from '../src/utils/assistent/adjunts';

/**
 * Adjunts de l'assistent: la mida a què es redueixen les imatges, el contingut del missatge
 * per a l'API i els límits de la conversa.
 */

const img = (n = 10) => ({ tipus: 'imatge', nom: 'croquis.jpg', mediaType: 'image/jpeg', dades: 'a'.repeat(n) });
const pdf = (n = 10) => ({ tipus: 'pdf', nom: 'planta.pdf', mediaType: 'application/pdf', dades: 'b'.repeat(n) });

describe('mida de les imatges', () => {
    it('una imatge petita no es toca', () => {
        expect(midaReduida(1200, 800)).toEqual({ amplada: 1200, alcada: 800 });
    });

    it('el costat llarg no passa de 2576 px', () => {
        expect(midaReduida(5152, 1000)).toEqual({ amplada: 2576, alcada: 500 });
    });

    it('ni passa de 3,75 megapíxels', () => {
        const { amplada, alcada } = midaReduida(4000, 3000);
        expect(amplada * alcada).toBeLessThanOrEqual(3.75e6);
        expect(Math.max(amplada, alcada)).toBeLessThanOrEqual(2576);
        expect(amplada / alcada).toBeCloseTo(4 / 3, 2);
    });
});

describe('contingut del missatge', () => {
    it('sense adjunts és el text tal qual', () => {
        expect(contingutMissatge('hola')).toBe('hola');
    });

    it('els adjunts van davant del text, amb els noms', () => {
        const c = contingutMissatge('Amida aquest mur', [img(), pdf()]);
        expect(c.map(b => b.type)).toEqual(['image', 'document', 'text']);
        expect(c[0].source).toEqual({ type: 'base64', media_type: 'image/jpeg', data: 'aaaaaaaaaa' });
        expect(c[1].source.media_type).toBe('application/pdf');
        expect(c[1].title).toBe('planta.pdf');
        expect(c[2].text).toMatch(/^Amida aquest mur/);
        expect(c[2].text).toContain('1. croquis.jpg');
        expect(c[2].text).toContain('2. planta.pdf');
    });

    it('només amb adjunts, hi posa una petició', () => {
        const c = contingutMissatge('', [img()]);
        expect(c[1].text).toMatch(/^Interpreta/);
    });

    it('accepta imatges i PDF, i res més', () => {
        expect(tipusAdmes('image/png')).toBe(true);
        expect(tipusAdmes('application/pdf')).toBe(true);
        expect(tipusAdmes('image/svg+xml')).toBe(false);
        expect(tipusAdmes('application/zip')).toBe(false);
    });
});

describe('límits de la conversa', () => {
    const historial = (adjunts) => [
        { role: 'user', content: contingutMissatge('primer', adjunts) },
        { role: 'assistant', content: [{ type: 'text', text: 'fet' }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: '{}' }] },
    ];

    it('compta les imatges i el pes de tota la conversa', () => {
        expect(pesConversa(historial([img(100), img(50), pdf(30)]))).toEqual({ imatges: 2, bytes: 180 });
    });

    it('passat el límit d\'imatges, demana una conversa nova', () => {
        const h = historial(Array.from({ length: MAX_IMATGES_CONVERSA }, () => img()));
        expect(comprovaAdjunts(h, [])).toBeNull();
        expect(comprovaAdjunts(h, [img()])).toMatch(/conversa/);
        expect(comprovaAdjunts(h, [pdf()])).toBeNull();
    });

    it('passat el pes, també', () => {
        const h = historial([pdf(MAX_BASE64_CONVERSA - 10)]);
        expect(comprovaAdjunts(h, [img(10)])).toBeNull();
        expect(comprovaAdjunts(h, [img(11)])).toMatch(/pesen massa/);
    });

    it('el bloc d\'una imatge porta el seu tipus', () => {
        expect(blocAdjunt({ ...img(), mediaType: 'image/png' }).source.media_type).toBe('image/png');
    });
});
