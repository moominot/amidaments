/**
 * Mesures de la geometria d'un element IFC: volum, superfície i cara més gran.
 *
 * Serveix per a dues coses: **contrastar** les quantitats que el model declara (el `GrossArea`
 * d'un revestiment pot ser la superfície total de la caixa) i **substituir-les** quan falten.
 *
 * Només hi ha el que es pot calcular amb fiabilitat sense un motor geomètric:
 *   · `IfcFacetedBrep` i `IfcShellBasedSurfaceModel` (cares planes amb polilínies),
 *   · `IfcTriangulatedFaceSet`,
 *   · `IfcExtrudedAreaSolid` amb perfil rectangular, circular o polilínia tancada.
 * Res d'operacions booleanes (buits, retalls) ni de mapped items: l'element surt amb
 * `parcial: true` i no s'ha de fer servir per corregir res.
 *
 * Les mesures surten en SI (m, m², m³): l'escala de la unitat de longitud ja hi és aplicada.
 */

const esRef = (v) => v && typeof v === 'object' && !Array.isArray(v) && typeof v.ref === 'number';
const nomEnum = (v) => (v && typeof v === 'object' && 'enum' in v ? v.enum : null);
const refs = (v) => (Array.isArray(v) ? v.filter(esRef).map(r => r.ref) : []);

const creu = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norma = (v) => Math.hypot(v[0], v[1], v[2]);

/** Àrea vectorial d'un polígon (la meitat de la suma de productes creuats). */
const areaVectorial = (pts) => {
    const s = [0, 0, 0];
    for (let i = 0; i < pts.length; i++) {
        const c = creu(pts[i], pts[(i + 1) % pts.length]);
        s[0] += c[0]; s[1] += c[1]; s[2] += c[2];
    }
    return [s[0] / 2, s[1] / 2, s[2] / 2];
};

const punt = (entitats, ref) => {
    const e = entitats.get(ref);
    return e && e.tipus === 'IFCCARTESIANPOINT' && Array.isArray(e.args[0]) ? e.args[0].map(Number) : null;
};

const puntsDeBucle = (entitats, refBucle) => {
    const b = entitats.get(refBucle);
    if (!b || b.tipus !== 'IFCPOLYLOOP') return null;
    const pts = refs(b.args[0]).map(r => punt(entitats, r));
    return pts.every(p => p && p.length >= 3) ? pts : null;
};

/** Acumulador d'una o diverses closques. */
const nou = () => ({ volum: 0, superficie: 0, caraMajor: 0, tancada: true, parcial: false, mostra: false });

const afegeixCares = (acc, cares, tancada) => {
    // cares: [{ pts, forats: [pts] }]
    let v = 0;
    let ok = true;
    for (const c of cares) {
        const exterior = areaVectorial(c.pts);
        let area = norma(exterior);
        for (const f of c.forats) area -= norma(areaVectorial(f));
        if (!(area > 0)) { if (area < 0) ok = false; continue; }
        // Volum per divergència: Σ (p·n̂)·A / 3, amb n̂ la normal de la cara (la de l'exterior).
        const n = exterior.map(x => x / norma(exterior));
        v += (c.pts[0][0] * n[0] + c.pts[0][1] * n[1] + c.pts[0][2] * n[2]) * area / 3;
        acc.superficie += area;
        acc.caraMajor = Math.max(acc.caraMajor, area);
    }
    if (!ok) acc.parcial = true;
    if (tancada) acc.volum += Math.abs(v);
    else acc.tancada = false;
    acc.mostra = true;
};

const caresDeClosca = (entitats, refClosca) => {
    const closca = entitats.get(refClosca);
    if (!closca || (closca.tipus !== 'IFCCLOSEDSHELL' && closca.tipus !== 'IFCOPENSHELL')) return null;
    const cares = [];
    for (const rf of refs(closca.args[0])) {
        const cara = entitats.get(rf);
        if (!cara || cara.tipus !== 'IFCFACE') return null;
        let pts = null;
        const forats = [];
        for (const rb of refs(cara.args[0])) {
            const b = entitats.get(rb);
            if (!b) return null;
            const bucle = esRef(b.args[0]) ? puntsDeBucle(entitats, b.args[0].ref) : null;
            if (!bucle) return null;
            if (b.tipus === 'IFCFACEOUTERBOUND') pts = nomEnum(b.args[1]) === 'F' ? [...bucle].reverse() : bucle;
            else forats.push(bucle);
        }
        // Una cara sense IfcFaceOuterBound explícit: el primer bucle és l'exterior.
        if (!pts && forats.length) pts = forats.shift();
        if (!pts) return null;
        cares.push({ pts, forats });
    }
    return { cares, tancada: closca.tipus === 'IFCCLOSEDSHELL' };
};

const perfilArea = (entitats, ref) => {
    const p = entitats.get(ref);
    if (!p) return null;
    if (p.tipus === 'IFCRECTANGLEPROFILEDEF' && typeof p.args[3] === 'number' && typeof p.args[4] === 'number') return p.args[3] * p.args[4];
    if (p.tipus === 'IFCCIRCLEPROFILEDEF' && typeof p.args[3] === 'number') return Math.PI * p.args[3] ** 2;
    if (p.tipus === 'IFCARBITRARYCLOSEDPROFILEDEF' && esRef(p.args[2])) {
        const corba = entitats.get(p.args[2].ref);
        if (!corba || corba.tipus !== 'IFCPOLYLINE') return null;
        const pts = refs(corba.args[0]).map(r => punt(entitats, r));
        if (pts.length < 3 || pts.some(x => !x || x.length < 2)) return null;
        let s = 0;
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i]; const b = pts[(i + 1) % pts.length];
            s += a[0] * b[1] - b[0] * a[1];
        }
        return Math.abs(s) / 2;
    }
    return null;
};

/** Retorna 'true' si l'element s'ha pogut mesurar (al menys en part). */
const itemGeometric = (entitats, ref, acc, f) => {
    const it = entitats.get(ref);
    if (!it) { acc.parcial = true; return; }
    const escala = { l: f, a: f * f, v: f * f * f };

    if (it.tipus === 'IFCFACETEDBREP' && esRef(it.args[0])) {
        const r = caresDeClosca(entitats, it.args[0].ref);
        if (!r) { acc.parcial = true; return; }
        const part = nou();
        afegeixCares(part, r.cares, r.tancada);
        acc.volum += part.volum * escala.v; acc.superficie += part.superficie * escala.a;
        acc.caraMajor = Math.max(acc.caraMajor, part.caraMajor * escala.a);
        acc.mostra = true;
        if (!part.tancada) acc.tancada = false;
        return;
    }
    if (it.tipus === 'IFCSHELLBASEDSURFACEMODEL') {
        for (const rs of refs(it.args[0])) {
            const r = caresDeClosca(entitats, rs);
            if (!r) { acc.parcial = true; continue; }
            const part = nou();
            afegeixCares(part, r.cares, r.tancada);
            acc.volum += part.volum * escala.v; acc.superficie += part.superficie * escala.a;
            acc.caraMajor = Math.max(acc.caraMajor, part.caraMajor * escala.a);
            acc.mostra = true;
            acc.tancada = acc.tancada && part.tancada;
        }
        acc.tancada = false; // un model de superfícies no és un sòlid
        return;
    }
    if (it.tipus === 'IFCTRIANGULATEDFACESET' && esRef(it.args[0])) {
        const llista = entitats.get(it.args[0].ref);
        const coords = llista?.tipus === 'IFCCARTESIANPOINTLIST3D' && Array.isArray(llista.args[0]) ? llista.args[0] : null;
        const indexos = Array.isArray(it.args[3]) ? it.args[3] : null;
        if (!coords || !indexos) { acc.parcial = true; return; }
        const cares = indexos.map(t => ({ pts: t.map(i => coords[i - 1]), forats: [] }));
        if (cares.some(c => c.pts.some(p => !Array.isArray(p)))) { acc.parcial = true; return; }
        const part = nou();
        const tancada = nomEnum(it.args[2]) === 'T';
        afegeixCares(part, cares, tancada);
        acc.volum += part.volum * escala.v; acc.superficie += part.superficie * escala.a;
        // Els triangles no són cares «de veritat»: la cara més gran no vol dir res.
        acc.caraMajor = 0;
        acc.mostra = true;
        if (!tancada) acc.tancada = false;
        acc.triangulada = true;
        return;
    }
    if (it.tipus === 'IFCEXTRUDEDAREASOLID' && esRef(it.args[0]) && esRef(it.args[2]) && typeof it.args[3] === 'number') {
        const area = perfilArea(entitats, it.args[0].ref);
        const dir = entitats.get(it.args[2].ref);
        const d = dir?.tipus === 'IFCDIRECTION' && Array.isArray(dir.args[0]) ? dir.args[0] : null;
        if (area == null || !d) { acc.parcial = true; return; }
        // Volum = àrea del perfil × profunditat × component de la direcció perpendicular al perfil.
        const dz = d.length >= 3 ? Math.abs(d[2]) / (Math.hypot(...d) || 1) : 1;
        acc.volum += area * it.args[3] * dz * escala.v;
        acc.mostra = true;
        acc.superficie = null; // no es calcula la superfície d'una extrusió
        acc.extrusio = true;
        return;
    }
    // Booleans, mapped items, sweeps…: no es poden mesurar aquí.
    acc.parcial = true;
};

/**
 * Mesura la geometria d'un producte IFC.
 *
 * @returns {null | { volum:number|null, superficie:number|null, caraMajor:number, tancada:boolean, parcial:boolean }}
 *   `null` si no té cap representació de cos. `volum` és null si no és un sòlid tancat.
 */
export const geometriaElement = (entitats, element, factorLongitud = 1) => {
    const producte = entitats.get(element);
    const rep = producte && esRef(producte.args[6]) ? entitats.get(producte.args[6].ref) : null;
    if (!rep || rep.tipus !== 'IFCPRODUCTDEFINITIONSHAPE') return null;

    const acc = { ...nou(), tancada: true };
    for (const rr of refs(rep.args[2])) {
        const sr = entitats.get(rr);
        if (!sr || sr.tipus !== 'IFCSHAPEREPRESENTATION') continue;
        if (sr.args[1] !== 'Body') continue; // Axis, FootPrint, Box…: no són el cos
        for (const ref of refs(sr.args[3])) itemGeometric(entitats, ref, acc, factorLongitud);
    }
    if (!acc.mostra && !acc.parcial) return null;
    const tancada = acc.tancada && acc.mostra && !acc.parcial;
    return {
        volum: acc.mostra && (tancada || acc.extrusio) && !acc.parcial ? acc.volum : null,
        superficie: acc.superficie == null || acc.parcial ? null : acc.superficie,
        caraMajor: acc.caraMajor,
        tancada,
        parcial: acc.parcial,
        triangulada: !!acc.triangulada,
    };
};
