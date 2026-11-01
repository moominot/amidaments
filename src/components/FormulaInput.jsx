import { useState, useRef, useEffect } from 'react';
import { parseDecimal } from '../utils/decimal';
import { interpretaCamp } from '../utils/formules';

/**
 * Camp d'una dimensió d'amidament que accepta un número o una fórmula amb paràmetres.
 *
 * - Un número (amb coma o punt) s'aplica mentre s'escriu, com a `NumberInput`.
 * - Qualsevol altra cosa és una fórmula i s'aplica en sortir del camp o amb Enter: mentre
 *   s'escriu, «L+» no és vàlida i no té sentit recalcular a cada tecla.
 * - Fora del camp es veu el valor calculat, en violeta si ve d'una fórmula (el text de la
 *   fórmula surt al `title`) i en vermell si la fórmula té un error.
 *
 * `teclatText`: al mòbil, el teclat decimal no té lletres i no deixaria escriure cap fórmula.
 * Qui el fa servir el posa a `true` quan el projecte té paràmetres.
 */
const aText = (valor) => {
    if (valor === null || valor === undefined || valor === '') return '';
    const n = Number(valor);
    return Number.isFinite(n) ? String(n).replace('.', ',') : '';
};

const FormulaInput = ({ value, formula, error, onChange, teclatText = false, className = '', ...props }) => {
    const [draft, setDraft] = useState(() => (formula ? formula : aText(value)));
    const [enFocus, setEnFocus] = useState(false);
    const cancelat = useRef(false);

    useEffect(() => {
        if (!enFocus) setDraft(formula ? formula : aText(value));
    }, [value, formula, enFocus]);

    const aplica = (text) => {
        const r = interpretaCamp(text);
        if ('valor' in r) {
            // Sortir d'un camp sense haver-lo tocat no ha de deixar un pas a l'historial de desfer.
            if (!formula && r.valor === Number(value || 0)) return;
            onChange?.({ valor: r.valor });
        } else if (r.formula !== formula) onChange?.({ formula: r.formula });
    };

    const color = error ? 'text-red-600 bg-red-50' : formula ? 'text-violet-700' : '';
    const titol = error ? `${formula}\n${error}` : formula ? `= ${formula}` : undefined;

    return (
        <input
            {...props}
            type="text"
            inputMode={teclatText ? 'text' : 'decimal'}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            title={titol}
            // El valor d'una fórmula es mostra amb tres decimals: «10,000979952» no diu res més.
            value={enFocus ? draft : (formula ? (error ? '⚠' : aText(Math.round(Number(value) * 1000) / 1000)) : draft)}
            className={`${className} ${color}`}
            onFocus={(e) => {
                setEnFocus(true);
                cancelat.current = false;
                setDraft(formula ? formula : aText(value));
                const camp = e.currentTarget;
                requestAnimationFrame(() => camp.select());
                props.onFocus?.(e);
            }}
            onChange={(e) => {
                const text = e.target.value;
                setDraft(text);
                // Els números s'apliquen en viu; les fórmules, en sortir.
                if (!text.trim().startsWith('=')) {
                    const n = parseDecimal(text);
                    if (n !== null && /^[-\d.,\s]*$/.test(text)) onChange?.({ valor: n });
                }
            }}
            onBlur={(e) => {
                setEnFocus(false);
                if (!cancelat.current) aplica(draft);
                props.onBlur?.(e);
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') {
                    cancelat.current = true;
                    e.currentTarget.blur();
                }
                props.onKeyDown?.(e);
            }}
        />
    );
};

export default FormulaInput;
