import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Desfer i refer per a l'estat del projecte.
 *
 * No substitueix els `useState` existents: hi ha desenes de crides a `setBudget` repartides
 * per l'aplicació i reescriure-les totes seria una font de regressions. En comptes d'això
 * observa els valors i, quan canvien, guarda la instantània anterior.
 *
 * Guardar instantànies és barat perquè totes les mutacions de l'arbre són immutables: la
 * pila conté referències a objectes que ja existeixen, no còpies.
 *
 * Els canvis seguits es fusionen en una sola entrada (`FINESTRA_MS`), de manera que escriure
 * una xifra no deixa una entrada per tecla.
 */

const LIMIT = 60;
const FINESTRA_MS = 700;

export const useHistory = (valors, aplica) => {
    const [past, setPast] = useState([]);
    const [future, setFuture] = useState([]);

    const anterior = useRef(valors);
    const ultimaEntrada = useRef(0);
    const ignora = useRef(false);

    const claus = Object.keys(valors);
    const dependencies = claus.map(k => valors[k]);

    useEffect(() => {
        const previ = anterior.current;
        const haCanviat = claus.some(k => previ[k] !== valors[k]);
        if (!haCanviat) return;

        // El canvi ve d'un desfer o d'un refer: no s'ha de registrar com a pas nou.
        if (ignora.current) {
            ignora.current = false;
            anterior.current = { ...valors };
            return;
        }

        const ara = Date.now();
        if (ara - ultimaEntrada.current > FINESTRA_MS) {
            setPast(p => [...p.slice(-(LIMIT - 1)), previ]);
            setFuture([]);
            ultimaEntrada.current = ara;
        }
        anterior.current = { ...valors };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, dependencies);

    const undo = useCallback(() => {
        setPast(p => {
            if (p.length === 0) return p;
            const instantania = p[p.length - 1];
            ignora.current = true;
            setFuture(f => [{ ...anterior.current }, ...f].slice(0, LIMIT));
            aplica(instantania);
            ultimaEntrada.current = 0;
            return p.slice(0, -1);
        });
    }, [aplica]);

    const redo = useCallback(() => {
        setFuture(f => {
            if (f.length === 0) return f;
            const instantania = f[0];
            ignora.current = true;
            setPast(p => [...p.slice(-(LIMIT - 1)), { ...anterior.current }]);
            aplica(instantania);
            ultimaEntrada.current = 0;
            return f.slice(1);
        });
    }, [aplica]);

    /** Per quan es carrega un projecte nou: el que hi havia abans ja no és comparable. */
    const clear = useCallback(() => {
        setPast([]);
        setFuture([]);
        ultimaEntrada.current = 0;
    }, []);

    return { undo, redo, clear, canUndo: past.length > 0, canRedo: future.length > 0 };
};
