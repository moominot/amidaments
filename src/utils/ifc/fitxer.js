/**
 * Lectura d'un fitxer `.ifc` del disc.
 *
 * L'IFC és text ASCII amb escapaments (`\X2\00F3\X0\`), però alguns programes hi escriuen els
 * accents en cru i en Latin-1 o Windows-1252: llegit com a UTF-8, «Construcció» surt com «Construcci�».
 * Es prova UTF-8 estricte i, si no hi cap, Windows-1252 (com el BC3).
 *
 * El lector corre al fil principal: un model gran bloqueja la pàgina mentre es llegeix, i per sobre
 * del límit ni s'intenta (un string de V8 no passa dels ~512 MB i la memòria del mòbil es queda
 * molt abans).
 */

export const LIMIT_IFC_MB = 150;

export const decodificaIfc = (buffer) => {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
        return new TextDecoder('windows-1252').decode(buffer);
    }
};

/** @returns {Promise<string>}  El text del fitxer; llença un `Error` en català si és massa gran. */
export const llegeixFitxerIfc = async (file) => {
    if (file.size > LIMIT_IFC_MB * 1024 * 1024) {
        throw new Error(`«${file.name}» fa ${(file.size / 1048576).toFixed(0)} MB: el límit són ${LIMIT_IFC_MB} MB. Exporta'n només la part que amidaràs.`);
    }
    return decodificaIfc(await file.arrayBuffer());
};
