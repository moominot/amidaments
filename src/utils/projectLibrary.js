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
