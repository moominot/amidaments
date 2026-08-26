/**
 * Converteix un import en euros a text en català, en majúscules.
 * Cobreix fins a milions, que és de sobres per a un pressupost d'obra.
 *
 * Exemple: 1234.56 -> "MIL DOS-CENTS TRENTA-QUATRE EUROS AMB CINQUANTA-SIS CÈNTIMS"
 */
export const numberToTextCatalan = (n) => {
    const units = ['', 'UN', 'DOS', 'TRES', 'QUATRE', 'CINC', 'SIS', 'SET', 'VUIT', 'NOU'];
    const tens = ['', 'DEU', 'VINT', 'TRENTA', 'QUARANTA', 'CINQUANTA', 'SEIXANTA', 'SETANTA', 'VUITANTA', 'NORANTA'];
    const unique = {
        11: 'ONZE', 12: 'DOTZE', 13: 'TRETZE', 14: 'CATORZE', 15: 'QUINZE',
        16: 'SETZE', 17: 'DISSET', 18: 'DIVUIT', 19: 'DINOU'
    };
    const n2t = (num) => {
        if (num === 0) return '';
        if (num < 10) return units[num];
        if (num < 20 && unique[num]) return unique[num];
        if (num < 100) {
            const t = Math.floor(num / 10);
            const u = num % 10;
            if (u === 0) return tens[t];
            if (t === 2) return `VINT-I-${units[u]}`;
            return `${tens[t]}-${units[u]}`;
        }
        if (num < 1000) {
            const h = Math.floor(num / 100);
            const r = num % 100;
            const prefix = h === 1 ? 'CENT' : `${units[h]}-CENTS`;
            if (r === 0) return prefix;
            return `${prefix} ${n2t(r)}`;
        }
        return '';
    };
    const integerPart = Math.floor(n);
    const decimalPart = Math.round((n - integerPart) * 100);
    let result = '';
    const millions = Math.floor(integerPart / 1000000);
    const thousands = Math.floor((integerPart % 1000000) / 1000);
    const units_part = integerPart % 1000;
    if (millions > 0) result += millions === 1 ? 'UN MILIÓ' : `${n2t(millions)} MILIONS`;
    if (thousands > 0) {
        if (result) result += ' ';
        result += thousands === 1 ? 'MIL' : `${n2t(thousands)} MIL`;
    }
    if (units_part > 0 || (millions === 0 && thousands === 0)) {
        if (result) result += ' ';
        result += units_part === 0 && (millions > 0 || thousands > 0) ? '' : (integerPart === 0 ? 'ZERO' : n2t(units_part));
    }
    result += integerPart === 1 ? ' EURO' : ' EUROS';
    if (decimalPart > 0) result += ` AMB ${n2t(decimalPart)} ${decimalPart === 1 ? 'CÈNTIM' : 'CÈNTIMS'}`;
    return result.trim();
};
