/**
 * El fitxer de projecte natiu.
 *
 * És JSON, però es desa amb extensió pròpia **`.amid`** i un tipus MIME propi. El motiu és
 * l'associació de fitxers: el `.json` se'l disputen l'editor de text, el navegador i mig
 * sistema operatiu, de manera que declarar-lo a `file_handlers` del manifest no dona una
 * associació neta. Amb una extensió que no fa servir ningú més, doble clic obre l'aplicació.
 *
 * Els projectes desats abans porten `.json` i s'han de continuar obrint: `esFitxerProjecte`
 * accepta les dues extensions i només l'escriptura fa servir la nova.
 *
 * Aquí hi viu tot el que sap què és un fitxer de projecte, perquè abans estava repartit en
 * quatre llocs amb tres comprovacions diferents —i una d'elles, la de la File Handling API,
 * mirava un camp `projectMetadata` que no s'escrivia enlloc, de manera que obrir un projecte
 * des del sistema no feia res i tampoc no avisava.
 */

export const EXTENSIO_PROJECTE = '.amid';
export const MIME_PROJECTE = 'application/x-amidaments+json';
export const VERSIO_FITXER = '1.0';

/** Extensions que s'accepten en obrir. `.json` hi és per als projectes ja desats. */
export const EXTENSIONS_PROJECTE = ['.amid', '.json'];

const acaba = (nom, extensions) => {
    const n = (nom || '').toLowerCase();
    return extensions.some(e => n.endsWith(e));
};

export const esFitxerProjecte = (nom) => acaba(nom, EXTENSIONS_PROJECTE);
export const esFitxerBC3 = (nom) => acaba(nom, ['.bc3']);

/** Afegeix l'extensió si el nom no en porta ja una de vàlida. */
export const ambExtensioProjecte = (nom) =>
    esFitxerProjecte(nom) ? nom : `${nom}${EXTENSIO_PROJECTE}`;

/** Contingut del fitxer de projecte. */
export const serialitzaProjecte = (budget, priceDatabase) => JSON.stringify({
    budget,
    priceDatabase,
    exportDate: new Date().toISOString(),
    version: VERSIO_FITXER,
}, null, 2);

/**
 * Llegeix un fitxer de projecte.
 *
 * @returns {{budget: object, priceDatabase: object}|null} `null` si no és un projecte nostre.
 *   Qui el crida ha d'avisar l'usuari: fallar en silenci era el defecte de la File Handling API.
 */
export const llegeixProjecte = (text) => {
    let dades;
    try {
        dades = JSON.parse(text);
    } catch {
        return null;
    }
    if (!dades || typeof dades !== 'object') return null;
    // N'hi ha prou amb el pressupost: un projecte pot no tenir base de preus pròpia, i
    // exigir-la descartava fitxers perfectament vàlids.
    if (!dades.budget || typeof dades.budget !== 'object') return null;
    return {
        budget: dades.budget,
        priceDatabase: dades.priceDatabase && typeof dades.priceDatabase === 'object'
            ? dades.priceDatabase
            : {},
    };
};
