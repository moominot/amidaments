/**
 * Data que surt als PDF. `config.date` és una cadena `AAAA-MM-DD` de la configuració
 * d'exportació; si és buida, s'usa el dia d'avui.
 */
export const pdfDate = (config, fallback = new Date()) => {
    const text = String(config?.date || '').substring(0, 10);
    const d = text ? new Date(`${text}T12:00:00`) : null;
    return d && !Number.isNaN(d.getTime()) ? d : fallback;
};

export const pdfDateText = (config, fallback) => pdfDate(config, fallback).toLocaleDateString('ca-ES');
