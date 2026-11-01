/**
 * Biblioteca de projectes al navegador.
 *
 * Fins ara només hi havia un projecte viu: «Nou projecte» o obrir-ne un altre substituïa el
 * que hi havia, i l'única xarxa de seguretat era haver exportat un JSON abans.
 *
 * Cada projecte es desa sota la seva pròpia clau i a part se'n manté un índex només amb les
 * metadades. Això importa: l'autodesat es dispara a cada pausa d'escriptura i, amb tots els
 * projectes en una sola entrada, cada desat obligaria a serialitzar-los tots — uns quants MB
 * en un telèfon.
 *
 * El `localStorage` ronda els 5 MB i un projecte gran els 300 kB, així que hi caben poques
 * obres: es limita el nombre d'entrades i, si la quota peta, s'esborren les més antigues.
 */

const CLAU_INDEX = 'amidaments_biblioteca';
const PREFIX = 'amidaments_proj_';
const MAX_PROJECTES = 12;

const clauDe = (id) => `${PREFIX}${id}`;

const llegirIndex = () => {
    try {
        const cru = localStorage.getItem(CLAU_INDEX);
        const dades = cru ? JSON.parse(cru) : [];
        return Array.isArray(dades) ? dades : [];
    } catch {
        return [];
    }
};

const escriureIndex = (entrades) => {
    try {
        localStorage.setItem(CLAU_INDEX, JSON.stringify(entrades));
        return true;
    } catch {
        return false;
    }
};

const esborrarProjecte = (id) => {
    try { localStorage.removeItem(clauDe(id)); } catch { /* res a fer */ }
};

/** Metadades dels projectes desats, del més recent al més antic. */
export const listProjects = () =>
    llegirIndex().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

export const getProject = (id) => {
    try {
        const cru = localStorage.getItem(clauDe(id));
        return cru ? JSON.parse(cru) : null;
    } catch {
        return null;
    }
};

/**
 * Desa (o actualitza) un projecte. Només escriu el projecte indicat i l'índex.
 * @returns {{ok: boolean, descartats?: number}}
 */
export const saveProject = ({ id, budget, priceDatabase, total = 0 }) => {
    if (!id) return { ok: false };

    const contingut = JSON.stringify({ budget, priceDatabase });
    const meta = {
        id,
        name: budget?.name || 'Projecte sense nom',
        updatedAt: new Date().toISOString(),
        chapterCount: (budget?.chapters || []).length,
        total,
    };

    let index = [meta, ...llegirIndex().filter(p => p.id !== id)]
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

    // Els que sobrepassen el límit se'n van, i amb ells el seu contingut.
    index.slice(MAX_PROJECTES).forEach(p => esborrarProjecte(p.id));
    index = index.slice(0, MAX_PROJECTES);

    let descartats = 0;
    for (;;) {
        try {
            localStorage.setItem(clauDe(id), contingut);
            escriureIndex(index);
            return descartats ? { ok: true, descartats } : { ok: true };
        } catch {
            // Quota exhaurida: alliberem el projecte més antic que no sigui aquest i reintentem.
            const victima = [...index].reverse().find(p => p.id !== id);
            if (!victima) {
                escriureIndex(index.filter(p => p.id !== id));
                return { ok: false };
            }
            esborrarProjecte(victima.id);
            index = index.filter(p => p.id !== victima.id);
            descartats++;
        }
    }
};

export const deleteProject = (id) => {
    esborrarProjecte(id);
    escriureIndex(llegirIndex().filter(p => p.id !== id));
    return { ok: true };
};

/*
 * ─── Quin projecte obre cada finestra ───
 *
 * Abans hi havia un sol espai de «projecte actual» (`amidaments_budget` i `amidaments_prices`)
 * per a tot el navegador. Amb dues finestres obertes, l'última que desava guanyava, i en
 * recarregar podia sortir el projecte de l'altra finestra o un BC3 obert per consultar.
 *
 * Ara el contingut només viu a la biblioteca, sota l'id del projecte, i cada finestra recorda
 * quin té obert a `sessionStorage`, que és per pestanya i sobreviu a recarregar. Una finestra
 * nova obre l'últim projecte que s'ha desat des de qualsevol finestra.
 */
const CLAU_ACTIU = 'amidaments_actiu';
const CLAU_DARRER = 'amidaments_darrer';
const ANTIC_BUDGET = 'amidaments_budget';
const ANTIC_PREUS = 'amidaments_prices';

/** Clau de `localStorage` on es desa el projecte, per escoltar-ne els canvis (`storage`). */
export const projectStorageKey = clauDe;

/** Aquesta finestra té obert el projecte `id`. */
export const markProjectOpen = (id) => {
    if (!id) return;
    try { sessionStorage.setItem(CLAU_ACTIU, id); } catch { /* res a fer */ }
    try { localStorage.setItem(CLAU_DARRER, id); } catch { /* res a fer */ }
};

/**
 * Projecte amb què arrenca la finestra: el que tenia oberta (si s'ha recarregat), si no
 * l'últim desat, i si no el de l'espai antic d'abans de la biblioteca. `null` si no n'hi ha.
 */
export const initialProject = () => {
    const candidats = [];
    try { candidats.push(sessionStorage.getItem(CLAU_ACTIU)); } catch { /* res a fer */ }
    try { candidats.push(localStorage.getItem(CLAU_DARRER)); } catch { /* res a fer */ }
    for (const id of candidats) {
        const p = id && getProject(id);
        if (p?.budget) return p;
    }
    try {
        const budget = JSON.parse(localStorage.getItem(ANTIC_BUDGET) || 'null');
        if (budget) return { budget, priceDatabase: JSON.parse(localStorage.getItem(ANTIC_PREUS) || '{}') || {} };
    } catch { /* espai antic malmès: es comença de nou */ }
    return null;
};

/** Esborra l'espai antic un cop el projecte ja és a la biblioteca: ocupava el doble. */
export const dropLegacySlot = () => {
    try {
        localStorage.removeItem(ANTIC_BUDGET);
        localStorage.removeItem(ANTIC_PREUS);
    } catch { /* res a fer */ }
};
