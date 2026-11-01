/**
 * La tria de partides de cada sistema es recorda en aquest navegador.
 *
 * Qui fa servir un sistema hi posa les seves partides —les del seu banc, amb els seus preus—
 * i no les vol tornar a triar a cada projecte. Es desa una instantània per paper
 * (`{ partida, prices }`), no un codi: el projecte següent potser no té aquella partida.
 *
 * És una comoditat, no una dada del projecte: si el navegador no deixa desar (finestra
 * privada, emmagatzematge ple), el sistema torna a les partides per defecte sense queixar-se.
 */

const clau = (sistemaId) => `amidaments:sistema:${sistemaId}:partides`;

const emmagatzematge = () => {
    try { return globalThis.localStorage || null; } catch { return null; }
};

const esInstantania = (v) => v === null || (
    v && typeof v === 'object'
    && v.partida && typeof v.partida.code === 'string' && v.partida.code
    && (!v.prices || typeof v.prices === 'object')
);

/** Torna la tria desada, filtrada als papers que el sistema encara té. */
export const llegeixTria = (sistema, magatzem = emmagatzematge()) => {
    if (!magatzem) return {};
    let dades;
    try {
        dades = JSON.parse(magatzem.getItem(clau(sistema.id)) || '{}');
    } catch {
        return {};
    }
    if (!dades || typeof dades !== 'object') return {};
    const papers = new Set(sistema.capitols.flatMap(c => c.partides.map(d => d.paper)));
    const out = {};
    Object.entries(dades).forEach(([paper, v]) => {
        if (!papers.has(paper) || !esInstantania(v)) return;
        out[paper] = v === null ? null : { partida: v.partida, prices: v.prices || {} };
    });
    return out;
};

export const desaTria = (sistema, tria, magatzem = emmagatzematge()) => {
    if (!magatzem) return;
    try {
        if (Object.keys(tria).length === 0) magatzem.removeItem(clau(sistema.id));
        else magatzem.setItem(clau(sistema.id), JSON.stringify(tria));
    } catch { /* no es pot desar: es farà servir la tria només en aquesta sessió */ }
};
