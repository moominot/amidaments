/**
 * Conversió de text a número acceptant la coma com a separador decimal, que és el que
 * escriu un teclat català. Veure `components/NumberInput.jsx`.
 */

/** "1.234,5" o "1234.5" → 1234.5. Retorna null si no és interpretable. */
export const parseDecimal = (text) => {
    if (text === null || text === undefined) return null;
    const net = String(text).trim();
    if (net === '' || net === '-') return null;

    // Si hi ha coma, manen les comes: els punts són separadors de milers.
    const normalitzat = net.includes(',')
        ? net.replace(/\./g, '').replace(',', '.')
        : net;

    const valor = Number(normalitzat);
    return Number.isFinite(valor) ? valor : null;
};
