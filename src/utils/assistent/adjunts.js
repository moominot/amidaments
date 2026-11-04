/**
 * Imatges i PDF adjunts als missatges de l'assistent (veure `docs/assistent.md`).
 *
 * Van dins del missatge, en base64, davant del text: un croquis, una foto d'un detall o un
 * plànol en PDF. Tres límits de l'API que s'apliquen aquí:
 * - **Imatges**: Claude Opus 5.5 les llegeix fins a 2576 px al costat llarg i 3,75 MP; més gran
 *   no hi veu més i costa el mateix, així que es redueixen al navegador abans d'enviar-les.
 *   Es tornen a codificar en JPEG (fons blanc per a les transparències) perquè no passin dels
 *   5 MB per imatge.
 * - **Petició**: 32 MB en total, i la conversa sencera es torna a enviar a cada volta. Per
 *   això es compta el que porta tota la conversa, no només el missatge.
 * - **Moltes imatges**: amb més de 20 en una petició, l'API en limita la mida. Es posa el límit
 *   a 20 per conversa i, passat, es demana començar-ne una de nova.
 *
 * Les funcions pures (comprovar, muntar el contingut) no toquen el DOM i es poden provar fora
 * del navegador; `preparaAdjunt` fa servir `createImageBitmap` i un canvas.
 */

export const TIPUS_IMATGE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const ACCEPTA = [...TIPUS_IMATGE, 'application/pdf'].join(',');

const COSTAT_MAX = 2576;
const PIXELS_MAX = 3.75e6;
export const MAX_IMATGES_CONVERSA = 20;
// Base64 (un terç més gran que el fitxer) del que porta tota la conversa: deixa marge per al
// text, les eines i els resultats dins dels 32 MB de la petició.
export const MAX_BASE64_CONVERSA = 24 * 1024 * 1024;
export const MAX_PDF = 20 * 1024 * 1024;

export const esPdf = (tipus) => tipus === 'application/pdf';
export const tipusAdmes = (tipus) => TIPUS_IMATGE.includes(tipus) || esPdf(tipus);

/** La mida a què s'ha de reduir una imatge (igual si ja hi cap). */
export const midaReduida = (amplada, alcada) => {
    const escala = Math.min(1, COSTAT_MAX / Math.max(amplada, alcada), Math.sqrt(PIXELS_MAX / (amplada * alcada)));
    return { amplada: Math.max(1, Math.round(amplada * escala)), alcada: Math.max(1, Math.round(alcada * escala)) };
};

/** El bloc de l'API d'un adjunt ja preparat (`{ tipus, mediaType, dades }`). */
export const blocAdjunt = (a) => (a.tipus === 'pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.dades }, title: a.nom }
    : { type: 'image', source: { type: 'base64', media_type: a.mediaType, data: a.dades } });

/**
 * El contingut d'un missatge de l'usuari: els adjunts primer i el text al final (el model
 * llegeix millor la pregunta quan ja ha vist el document). Amb el nom de cada fitxer, perquè
 * s'hi pugui referir.
 */
export const contingutMissatge = (text, adjunts = []) => {
    if (!adjunts.length) return text;
    const noms = adjunts.map((a, i) => `${i + 1}. ${a.nom}`).join('\n');
    return [
        ...adjunts.map(blocAdjunt),
        { type: 'text', text: `${text || 'Interpreta el que t\'he adjuntat.'}\n\nAdjunts:\n${noms}` },
    ];
};

/** Quantes imatges i quants bytes en base64 porta ja la conversa. */
export const pesConversa = (historial) => {
    let imatges = 0;
    let bytes = 0;
    historial.forEach(m => {
        if (m.role !== 'user' || !Array.isArray(m.content)) return;
        m.content.forEach(b => {
            if ((b.type === 'image' || b.type === 'document') && b.source?.type === 'base64') {
                if (b.type === 'image') imatges++;
                bytes += b.source.data.length;
            }
        });
    });
    return { imatges, bytes };
};

/**
 * Si els adjunts nous hi caben amb el que ja porta la conversa. Torna `null` o el motiu en
 * català per ensenyar-lo.
 */
export const comprovaAdjunts = (historial, nous) => {
    const ara = pesConversa(historial);
    const imatges = ara.imatges + nous.filter(a => a.tipus === 'imatge').length;
    const bytes = ara.bytes + nous.reduce((s, a) => s + a.dades.length, 0);
    if (imatges > MAX_IMATGES_CONVERSA) {
        return `Una conversa admet fins a ${MAX_IMATGES_CONVERSA} imatges. Comença'n una de nova per enviar-ne més.`;
    }
    if (bytes > MAX_BASE64_CONVERSA) {
        return 'Els adjunts d\'aquesta conversa ja pesen massa. Comença\'n una de nova o envia\'n menys (un PDF amb només les pàgines que calen).';
    }
    return null;
};

// ─── Navegador ───

const llegeixBase64 = (blob) => new Promise((resol, falla) => {
    const r = new FileReader();
    r.onload = () => resol(String(r.result).split(',')[1] || '');
    r.onerror = () => falla(r.error || new Error('No s\'ha pogut llegir el fitxer'));
    r.readAsDataURL(blob);
});

const canvasABlob = (canvas, tipus, qualitat) => new Promise((resol, falla) => {
    canvas.toBlob(b => (b ? resol(b) : falla(new Error('No s\'ha pogut convertir la imatge'))), tipus, qualitat);
});

/**
 * Llegeix un fitxer triat i el deixa a punt per enviar: `{ id, tipus, nom, mida, mediaType,
 * dades, miniatura }`. Les imatges es redueixen; la miniatura (una imatge petita en data URL)
 * és només per ensenyar-la al xat. Llança amb un missatge en català si no es pot.
 */
export const preparaAdjunt = async (fitxer) => {
    const nom = fitxer.name || 'imatge';
    if (!tipusAdmes(fitxer.type)) {
        throw new Error(`«${nom}» no és una imatge (JPEG, PNG, WebP, GIF) ni un PDF. Un DWG o un DXF, exporta'l a PDF o fes-ne una captura.`);
    }
    if (esPdf(fitxer.type)) {
        if (fitxer.size > MAX_PDF) throw new Error(`«${nom}» passa de 20 MB: envia'n només les pàgines que calen`);
        return { id: crypto.randomUUID(), tipus: 'pdf', nom, mida: fitxer.size, mediaType: 'application/pdf', dades: await llegeixBase64(fitxer) };
    }

    let bitmap;
    try {
        bitmap = await createImageBitmap(fitxer);
    } catch {
        throw new Error(`No s'ha pogut obrir la imatge «${nom}»`);
    }
    const { amplada, alcada } = midaReduida(bitmap.width, bitmap.height);
    const pinta = (w, h) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(bitmap, 0, 0, w, h);
        return c;
    };
    const blob = await canvasABlob(pinta(amplada, alcada), 'image/jpeg', 0.9);
    const esc = Math.min(1, 160 / Math.max(amplada, alcada));
    const miniatura = pinta(Math.max(1, Math.round(amplada * esc)), Math.max(1, Math.round(alcada * esc))).toDataURL('image/jpeg', 0.7);
    bitmap.close?.();
    return {
        id: crypto.randomUUID(), tipus: 'imatge', nom, mida: blob.size, mediaType: 'image/jpeg',
        dades: await llegeixBase64(blob), miniatura, amplada, alcada,
    };
};
