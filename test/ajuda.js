import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Utilitats compartides pels tests.
 *
 * Els fitxers de prova són **BC3 de veritat**, no maquetes: el de referència del projecte i
 * dues partides del Generador de Preus de CYPE, una de demolició i una de construcció. Les
 * xifres que s'hi comproven són les que es van contrastar a mà contra el fitxer, i per això
 * serveixen de xarxa: si algú toca `round2`, el parser o l'escriptor i el número es mou, salta.
 */

const AQUI = path.dirname(fileURLToPath(import.meta.url));

export const ARREL = path.resolve(AQUI, '..');

/** El BC3 és Windows-1252; llegir-lo com a UTF-8 destrossa els accents. */
export const llegeixBC3 = (ruta) =>
    new TextDecoder('windows-1252').decode(fs.readFileSync(path.resolve(ARREL, ruta)));

export const FITXERS = {
    /** Export de Presto 8.7: 24 capítols, 248 partides, PEM 135.202,54 €. */
    referencia: 'REFORMA ESPORLES_MEDICIONES_AJUSTADO.bc3',
    /** CYPE DCE010, demolició completa d'un edifici: porta residus, no petjada. */
    demolicio: 'test/fixtures/cype-demolicio.bc3',
    /** CYPE EHS010, pilar de formigó armat: porta petjada i residus de col·locació. */
    pilar: 'test/fixtures/cype-pilar.bc3',
};

/** Totes les partides de l'arbre, en ordre de recorregut. */
export const partides = (chapters = []) => {
    const out = [];
    const visita = (n) => {
        if (n.unit) out.push(n);
        [...(n.subChapters || []), ...(n.items || [])].forEach(visita);
    };
    (chapters || []).forEach(visita);
    return out;
};

/** Una partida pel seu codi (comparant pel principi, que els codis porten `#`). */
export const partida = (chapters, codi) =>
    partides(chapters).find(n => (n.code || '').startsWith(codi));

/** Substitueix l'amidament d'una partida per una sola línia amb aquestes unitats. */
export const amidament = (node, unitats) => {
    node.measurements = [{ id: 'test', description: 'prova', units: unitats, length: 1, width: 1, height: 1 }];
    return node;
};
