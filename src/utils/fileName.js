/**
 * Nom de fitxer segur per a una descàrrega del navegador.
 *
 * Chromium descarta l'atribut `download` sencer si conté caràcters no ASCII i desa el
 * fitxer com a "download", sense extensió. Com que els noms de projecte en català en
 * porten gairebé sempre ("Reforma d'habitatge", "Certificació 2"), aquí es transliteren
 * els accents en comptes d'eliminar-los: es perd el diacrític, però el nom continua
 * essent llegible i el fitxer conserva l'extensió.
 */

const ACCENTS = {
    à: 'a', á: 'a', â: 'a', ä: 'a', ã: 'a', å: 'a',
    è: 'e', é: 'e', ê: 'e', ë: 'e',
    ì: 'i', í: 'i', î: 'i', ï: 'i',
    ò: 'o', ó: 'o', ô: 'o', ö: 'o', õ: 'o',
    ù: 'u', ú: 'u', û: 'u', ü: 'u',
    ç: 'c', ñ: 'n', ý: 'y', ÿ: 'y',
    '·': '', '€': 'EUR',
};

export const safeFileName = (value, fallback = 'document') => {
    const base = (value || '').toString().trim() || fallback;

    const ascii = [...base]
        .map(ch => {
            const lower = ch.toLowerCase();
            if (ACCENTS[lower] === undefined) return ch;
            const repl = ACCENTS[lower];
            return ch === lower ? repl : repl.toUpperCase();
        })
        .join('')
        // Caràcters no vàlids en un nom de fitxer, i qualsevol cosa que quedi fora d'ASCII.
        .replace(/[\\/:*?"<>|]/g, '')
        // eslint-disable-next-line no-control-regex
        .replace(/[^\x20-\x7E]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    return ascii || fallback;
};
