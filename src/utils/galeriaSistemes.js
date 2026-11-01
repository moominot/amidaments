import { llegeixDocument } from './sistemesDoc';
import piscina from './sistemes/piscina.sistema.json';

/**
 * Galeria de sistemes constructius.
 *
 * Els que l'usuari desa viuen en aquest navegador, com la biblioteca de projectes: un índex
 * amb les metadades i cada document sota la seva clau. Per conservar-los o passar-los a un
 * altre ordinador s'exporten com a fitxer (és un `.amid` normal, que també es pot obrir com a
 * projecte per editar-lo) i es tornen a importar.
 *
 * Els **integrats** venen amb l'aplicació i no es poden esborrar ni sobreescriure; si se n'edita
 * un i es desa, en surt un de nou.
 */

const CLAU_INDEX = 'amidaments_sistemes';
const PREFIX = 'amidaments_sist_';
const clauDe = (id) => `${PREFIX}${id}`;

const INTEGRATS = [
    { id: 'integrat:piscina', integrat: true, doc: llegeixDocument(piscina) },
];

const metaDe = (id, doc, extra = {}) => ({
    id,
    nom: doc.nom,
    descripcio: doc.descripcio || '',
    nParametres: (doc.parametres || []).filter(p => !p.formula).length,
    ...extra,
});

const llegirIndex = () => {
    try {
        const dades = JSON.parse(localStorage.getItem(CLAU_INDEX) || '[]');
        return Array.isArray(dades) ? dades : [];
    } catch {
        return [];
    }
};

const escriureIndex = (entrades) => {
    try { localStorage.setItem(CLAU_INDEX, JSON.stringify(entrades)); return true; } catch { return false; }
};

/** Integrats primer i després els desats, del més recent al més antic. */
export const llistaSistemes = () => [
    ...INTEGRATS.map(i => metaDe(i.id, i.doc, { integrat: true })),
    ...llegirIndex().sort((a, b) => (b.actualitzat || '').localeCompare(a.actualitzat || '')),
];

export const llegeixSistema = (id) => {
    const integrat = INTEGRATS.find(i => i.id === id);
    if (integrat) return integrat.doc;
    try {
        return llegeixDocument(JSON.parse(localStorage.getItem(clauDe(id)) || 'null'));
    } catch {
        return null;
    }
};

/**
 * Desa un document a la galeria. Amb `id` (d'un sistema desat, no integrat) el sobreescriu.
 * Torna `{ ok, id }` o `{ ok: false, error }` (normalment, que no hi cap).
 */
export const desaSistema = (doc, id = null) => {
    const propi = id && !String(id).startsWith('integrat:') ? id : crypto.randomUUID();
    try {
        localStorage.setItem(clauDe(propi), JSON.stringify(doc));
    } catch {
        return { ok: false, error: 'El navegador no té lloc per desar-lo. Exporta\'l a un fitxer.' };
    }
    const index = llegirIndex().filter(e => e.id !== propi);
    index.push(metaDe(propi, doc, { actualitzat: new Date().toISOString() }));
    if (!escriureIndex(index)) {
        try { localStorage.removeItem(clauDe(propi)); } catch { /* res */ }
        return { ok: false, error: 'El navegador no té lloc per desar-lo. Exporta\'l a un fitxer.' };
    }
    return { ok: true, id: propi };
};

export const esborraSistema = (id) => {
    if (String(id).startsWith('integrat:')) return;
    try { localStorage.removeItem(clauDe(id)); } catch { /* res */ }
    escriureIndex(llegirIndex().filter(e => e.id !== id));
};
