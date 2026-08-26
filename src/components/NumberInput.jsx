import { useState, useRef, useEffect } from 'react';
import { parseDecimal } from '../utils/decimal';

/**
 * Camp numèric que accepta la coma com a separador decimal.
 *
 * Amb `<input type="number">` el navegador descarta els caràcters que no encaixen amb el
 * seu format intern, que fa servir el punt. En un teclat català l'usuari escriu "12,5" i
 * el camp es queda amb "125": deu vegades més, sense cap avís. És el defecte més perillós
 * per a l'entrada de dades a peu d'obra.
 *
 * Per això aquí el camp és de text amb `inputMode="decimal"` — al mòbil surt igualment el
 * teclat numèric — i la conversió la fem nosaltres. Mentre s'escriu es conserva el text tal
 * qual (perquè "12," sigui un estat vàlid) i es va notificant el valor numèric a mesura que
 * es pot interpretar, de manera que els totals segueixen actualitzant-se en directe.
 */

/** Presentació amb coma, sense zeros decimals sobrers. */
const aText = (valor) => {
    if (valor === null || valor === undefined || valor === '') return '';
    const n = Number(valor);
    if (!Number.isFinite(n)) return '';
    return String(n).replace('.', ',');
};

const NumberInput = ({
    value,
    onChange,          // rep un número
    onCommit,          // opcional: es crida en sortir del camp o prémer Enter
    className = '',
    selectOnFocus = true,
    ...props
}) => {
    const [draft, setDraft] = useState(() => aText(value));
    const editant = useRef(false);
    const camp = useRef(null);

    // Mentre l'usuari escriu no li reescrivim el text a sota; fora d'això, el camp
    // segueix el valor del model (per exemple després d'un "100%" o d'un desfer).
    useEffect(() => {
        if (!editant.current) setDraft(aText(value));
    }, [value]);

    const handleChange = (e) => {
        const text = e.target.value;
        // Acceptem xifres, un signe menys al davant i un únic separador decimal.
        if (!/^-?[\d.]*,?\d*$/.test(text) && !/^-?\d*\.?\d*$/.test(text)) return;
        setDraft(text);
        const valor = parseDecimal(text);
        if (valor !== null) onChange?.(valor);
    };

    return (
        <input
            {...props}
            ref={camp}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={draft}
            className={className}
            onFocus={(e) => {
                editant.current = true;
                if (selectOnFocus) e.target.select();
                props.onFocus?.(e);
            }}
            onChange={handleChange}
            onBlur={(e) => {
                editant.current = false;
                const valor = parseDecimal(draft);
                // Un camp buit o a mitges torna al darrer valor vàlid en comptes de
                // quedar-se en un estat que no es podria desar.
                if (valor === null) setDraft(aText(value));
                else { setDraft(aText(valor)); onCommit?.(valor); }
                props.onBlur?.(e);
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                props.onKeyDown?.(e);
            }}
        />
    );
};

export default NumberInput;
