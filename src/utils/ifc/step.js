/**
 * Lector de fitxers STEP (ISO 10303-21), el contenidor de l'IFC.
 *
 * Només fa la sintaxi: converteix el text en un mapa d'entitats `#id → { id, tipus, args }`.
 * No sap res d'IFC. El que significa cada entitat és a `lector.js`.
 *
 * Valors dels arguments:
 *   · `$`            → null (valor omès)
 *   · `*`            → { derivat: true }
 *   · `#12`          → { ref: 12 }
 *   · `'text'`       → string, ja decodificat (\X2\00F3\X0\ → ó)
 *   · `.T.` `.WALL.` → { enum: 'T' }
 *   · `1.5` `2.E-5`  → number
 *   · `(a,b,…)`      → array
 *   · `IFCLABEL('x')`→ { tipus: 'IFCLABEL', valor: 'x' } (valor és args[0] si n'hi ha un de sol)
 *
 * No s'ha d'ajudar de cap regex sobre el fitxer sencer: una entitat pot ocupar diverses línies i
 * dins dels textos hi pot haver `;`, `)` o `'`.
 */

const ESPAI = /\s/;

/** Decodifica els escapaments d'un text STEP (apartat 6.4.3 de la norma). */
export const decodificaText = (s) => {
    if (!s.includes('\\')) return s;
    let out = '';
    for (let i = 0; i < s.length; i++) {
        if (s[i] !== '\\') { out += s[i]; continue; }
        const resta = s.slice(i);
        let m;
        if ((m = /^\\X2\\([0-9A-Fa-f]*)\\X0\\/.exec(resta))) {
            for (let k = 0; k + 4 <= m[1].length; k += 4) out += String.fromCharCode(parseInt(m[1].slice(k, k + 4), 16));
            i += m[0].length - 1;
        } else if ((m = /^\\X4\\([0-9A-Fa-f]*)\\X0\\/.exec(resta))) {
            for (let k = 0; k + 8 <= m[1].length; k += 8) out += String.fromCodePoint(parseInt(m[1].slice(k, k + 8), 16));
            i += m[0].length - 1;
        } else if ((m = /^\\X\\([0-9A-Fa-f]{2})/.exec(resta))) {
            out += String.fromCharCode(parseInt(m[1], 16));
            i += m[0].length - 1;
        } else if ((m = /^\\S\\(.)/s.exec(resta))) {
            out += String.fromCharCode(m[1].charCodeAt(0) + 128);
            i += m[0].length - 1;
        } else if ((m = /^\\P[A-I]\\/.exec(resta))) {
            i += m[0].length - 1; // canvi de taula de caràcters: sense efecte aquí
        } else if (resta.startsWith('\\\\')) {
            out += '\\';
            i += 1;
        } else {
            out += '\\';
        }
    }
    return out;
};

class Escaner {
    constructor(text, pos = 0) { this.t = text; this.i = pos; }

    saltaEspais() {
        const t = this.t;
        for (;;) {
            while (this.i < t.length && ESPAI.test(t[this.i])) this.i++;
            // Comentaris /* … */
            if (t[this.i] === '/' && t[this.i + 1] === '*') {
                const fi = t.indexOf('*/', this.i + 2);
                this.i = fi < 0 ? t.length : fi + 2;
            } else return;
        }
    }

    final() { this.saltaEspais(); return this.i >= this.t.length; }
    mira() { this.saltaEspais(); return this.t[this.i]; }

    llegeixText() {
        // Entrem a la cometa d'obertura; '' dins del text és una cometa literal.
        let j = this.i + 1;
        let s = '';
        for (;;) {
            const q = this.t.indexOf("'", j);
            if (q < 0) { this.i = this.t.length; return decodificaText(s + this.t.slice(j)); }
            s += this.t.slice(j, q);
            if (this.t[q + 1] === "'") { s += "'"; j = q + 2; continue; }
            this.i = q + 1;
            return decodificaText(s);
        }
    }

    llegeixLlista() {
        this.i++; // (
        const out = [];
        for (;;) {
            const c = this.mira();
            if (c === undefined) return out;
            if (c === ')') { this.i++; return out; }
            if (c === ',') { this.i++; continue; }
            out.push(this.llegeixValor());
        }
    }

    llegeixValor() {
        const c = this.mira();
        const t = this.t;
        if (c === '$') { this.i++; return null; }
        if (c === '*') { this.i++; return { derivat: true }; }
        if (c === "'") return this.llegeixText();
        if (c === '(') return this.llegeixLlista();
        if (c === '#') {
            let j = this.i + 1;
            while (j < t.length && t[j] >= '0' && t[j] <= '9') j++;
            const ref = Number(t.slice(this.i + 1, j));
            this.i = j;
            return { ref };
        }
        if (c === '.') {
            const fi = t.indexOf('.', this.i + 1);
            const nom = t.slice(this.i + 1, fi);
            this.i = fi + 1;
            return { enum: nom };
        }
        if (c === '"') { // cadena binària: no ens interessa
            const fi = t.indexOf('"', this.i + 1);
            this.i = fi + 1;
            return null;
        }
        const num = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(t.slice(this.i, this.i + 40));
        if (num) { this.i += num[0].length; return Number(num[0]); }
        // Tipus amb valor: IFCLABEL('x'), IFCLENGTHMEASURE(2.5)…
        const nom = /^[A-Za-z_][A-Za-z0-9_]*/.exec(t.slice(this.i, this.i + 80));
        if (nom) {
            this.i += nom[0].length;
            if (this.mira() === '(') {
                const args = this.llegeixLlista();
                return { tipus: nom[0].toUpperCase(), valor: args.length === 1 ? args[0] : args };
            }
            return { enum: nom[0] };
        }
        this.i++; // caràcter inesperat: s'ometeix per no quedar-se a mig
        return null;
    }

    saltaFinsPuntiComa() {
        const t = this.t;
        while (this.i < t.length) {
            const c = t[this.i];
            if (c === "'") { this.llegeixText(); continue; }
            this.i++;
            if (c === ';') return;
        }
    }
}

/**
 * Llegeix un fitxer STEP.
 *
 * @returns {{ capcalera: Object<string, any[]>, entitats: Map<number, {id:number, tipus:string, args:any[]}> } | null}
 *   `null` si no sembla un STEP (falta `ISO-10303-21;`).
 */
export const parseStep = (text) => {
    if (typeof text !== 'string') return null;
    const inici = text.indexOf('ISO-10303-21');
    if (inici < 0) return null;

    const capcalera = {};
    const entitats = new Map();
    const e = new Escaner(text, inici + 'ISO-10303-21'.length);
    e.saltaFinsPuntiComa();

    let seccio = null;
    while (!e.final()) {
        const c = e.mira();
        if (c === '#') {
            if (seccio !== 'DATA') { e.saltaFinsPuntiComa(); continue; }
            const idv = e.llegeixValor();
            if (e.mira() !== '=') { e.saltaFinsPuntiComa(); continue; }
            e.i++;
            if (e.mira() === '(') { e.saltaFinsPuntiComa(); continue; } // entitat complexa: no la fem servir
            const nom = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(e.i, e.i + 80));
            if (!nom) { e.saltaFinsPuntiComa(); continue; }
            e.i += nom[0].length;
            const args = e.mira() === '(' ? e.llegeixLlista() : [];
            entitats.set(idv.ref, { id: idv.ref, tipus: nom[0].toUpperCase(), args });
            e.saltaFinsPuntiComa();
            continue;
        }
        const nom = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(text.slice(e.i, e.i + 80));
        if (!nom) { e.i++; continue; }
        const paraula = nom[0].toUpperCase();
        e.i += nom[0].length;
        if (paraula === 'HEADER' || paraula === 'DATA') { seccio = paraula; e.saltaFinsPuntiComa(); continue; }
        if (paraula === 'ENDSEC') { seccio = null; e.saltaFinsPuntiComa(); continue; }
        if (paraula === 'END-ISO-10303-21') break;
        if (seccio === 'HEADER' && e.mira() === '(') {
            capcalera[paraula] = e.llegeixLlista();
            e.saltaFinsPuntiComa();
            continue;
        }
        e.saltaFinsPuntiComa();
    }

    return { capcalera, entitats };
};
