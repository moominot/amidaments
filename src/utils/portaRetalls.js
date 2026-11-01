import { normalizeCode } from './calculations';
import { isRefLine, refLabel } from './measurementRefs';

/**
 * Copiar i enganxar capítols i partides entre finestres a través del porta-retalls.
 *
 * Arrossegar d'una finestra a l'altra no pot funcionar: el que viatja amb l'arrossegament
 * intern és només l'`id` del node, que a l'altra finestra no vol dir res. El porta-retalls,
 * en canvi, és compartit entre pestanyes i finestres, i hi cap un text: s'hi desa el
 * subarbre sencer en JSON amb una marca que el distingeix de qualsevol altre text.
 *
 * El fragment és autosuficient:
 * - porta les entrades de `priceDatabase` de tots els codis que hi surten (partides,
 *   components i descomposats), perquè a l'altre projecte els imports quadrin;
 * - les línies vinculades es copien ja resoltes, com a línies fixes: el vincle apunta a un
 *   codi que a l'altre projecte pot no existir o ser una partida diferent, i els vincles a
 *   una línia concreta no sobreviurien als ids nous de la còpia;
 * - no porta `certifications`: van indexades per les fases del projecte d'origen i, a més,
 *   una còpia no està certificada.
 *
 * Per enganxar no es fa servir cap camí nou: el fragment s'embolcalla amb la cadena de
 * capítols del destí i passa pel mateix flux que la importació d'un BC3 (`startImportProcess`),
 * que ja pregunta què fer amb els codis de partida que ja existeixen.
 */

export const MARCA_FRAGMENT = 'amidaments/fragment';

const congelaLinia = (m) => {
    if (!isRefLine(m)) return m;
    // eslint-disable-next-line no-unused-vars
    const { refCode, refLineId, factor, refDescription, ...resta } = m;
    return {
        ...resta,
        description: m.description || refLabel(m),
        units: m.units || 0,
        length: 1, width: 1, height: 1,
    };
};

const netejaNode = (node) => {
    // eslint-disable-next-line no-unused-vars
    const { certifications, ...resta } = node;
    return {
        ...resta,
        measurements: (node.measurements || []).map(congelaLinia),
        subChapters: (node.subChapters || []).map(netejaNode),
        items: (node.items || []).map(netejaNode),
    };
};

const codisDe = (node, codis = new Set()) => {
    if (node.code) codis.add(normalizeCode(node.code));
    (node.breakdown || []).forEach(b => { if (b.code) codis.add(normalizeCode(b.code)); });
    [...(node.subChapters || []), ...(node.items || [])].forEach(n => codisDe(n, codis));
    return codis;
};

/**
 * Text per al porta-retalls amb `node` i tot el que penja d'ell.
 *
 * `node` ha de sortir de `resolvedChapters`: així les línies vinculades ja porten la quantitat.
 */
export const creaFragment = (node, priceDatabase = {}) => {
    const prices = {};
    codisDe(node).forEach(codi => {
        if (priceDatabase[codi]) prices[codi] = priceDatabase[codi];
    });
    return JSON.stringify({ format: MARCA_FRAGMENT, versio: 1, nodes: [netejaNode(node)], prices });
};

const idsNous = (node) => ({
    ...node,
    id: crypto.randomUUID(),
    measurements: (node.measurements || []).map(m => ({ ...m, id: crypto.randomUUID() })),
    subChapters: (node.subChapters || []).map(idsNous),
    items: (node.items || []).map(idsNous),
});

/**
 * Llegeix un fragment del porta-retalls. Retorna `null` si el text no n'és un, de manera que
 * qui enganxa pot provar altres formats (CAD, URL de BC3...).
 *
 * Els nodes surten amb ids nous: si s'enganxa a la mateixa finestra d'on s'ha copiat, els
 * ids d'origen hi xocarien.
 */
export const llegeixFragment = (text) => {
    if (!text || !text.includes(MARCA_FRAGMENT)) return null;
    let dades;
    try {
        dades = JSON.parse(text.trim());
    } catch {
        return null;
    }
    if (!dades || dades.format !== MARCA_FRAGMENT || !Array.isArray(dades.nodes) || dades.nodes.length === 0) return null;
    return {
        nodes: dades.nodes.map(idsNous),
        prices: dades.prices && typeof dades.prices === 'object' ? dades.prices : {},
    };
};

const camiFins = (nodes, id, cami = []) => {
    for (const n of nodes) {
        const aqui = [...cami, n];
        if (n.id === id) return aqui;
        const dins = camiFins([...(n.subChapters || []), ...(n.items || [])], id, aqui);
        if (dins) return dins;
    }
    return null;
};

/**
 * Prepara els nodes enganxats perquè `mergeTreeBranches` els posi on toca.
 *
 * La fusió de la importació va per codis des de l'arrel, així que els nodes s'embolcallen
 * amb uns capítols buits que reprodueixen la cadena fins al destí: la fusió hi baixa codi a
 * codi i deixa el fragment al final del capítol de destí.
 *
 * - Destí capítol: el fragment hi va a dins.
 * - Destí partida: va al capítol que la conté.
 * - Sense destí: a l'arrel, que només admet capítols.
 *
 * Retorna `{ chapters, cami }` (`cami`: ids dels capítols de destí, per desplegar-los), o
 * `null` si el fragment porta partides i no hi ha cap capítol on posar-les.
 */
export const embolcallaPerEnganxar = (chapters, destiId, nodes) => {
    let cadena = destiId ? (camiFins(chapters, destiId) || []) : [];
    // Una partida no admet fills: es puja fins al capítol que la conté (la partida pot ser
    // un component d'una altra, i per això és un bucle).
    while (cadena.length && cadena[cadena.length - 1].unit) cadena = cadena.slice(0, -1);

    if (cadena.length === 0) {
        if (nodes.some(n => n.unit)) return null;
        return { chapters: nodes, cami: [] };
    }

    let fills = {
        subChapters: nodes.filter(n => !n.unit),
        items: nodes.filter(n => n.unit),
    };
    for (let i = cadena.length - 1; i >= 0; i--) {
        const c = cadena[i];
        const closca = { id: crypto.randomUUID(), code: c.code, description: c.description, ...fills };
        fills = { subChapters: [closca], items: [] };
    }
    return { chapters: fills.subChapters, cami: cadena.map(c => c.id) };
};
