import { defineConfig } from 'vitest/config';

/**
 * Configuració pròpia i no la de Vite, a posta.
 *
 * Els tests són tots de lògica de càlcul —parser, escriptor, residus, petjada, certificacions—
 * i no munten cap component, de manera que no els cal el plugin de React ni l'entorn de
 * navegador. Reaprofitant `vite.config.js` s'hi carregava igualment i omplia la sortida
 * d'avisos que no tenen res a veure amb el que s'està provant.
 *
 * El dia que hi hagi tests de components, la manera d'afegir-los és posar-hi
 * `environment: 'jsdom'` i el plugin, no barrejar-ho amb la configuració de la construcció.
 */
export default defineConfig({
    test: {
        include: ['test/**/*.test.js'],
        environment: 'node',
    },
});
