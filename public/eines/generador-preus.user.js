// ==UserScript==
// @name         Generador de Preus → Copiar BC3
// @namespace    https://moominot.github.io/amidaments/
// @version      1.0
// @description  Botó flotant per copiar l'enllaç del BC3 de la partida i enganxar-lo a PreuArq BIM
// @match        *://*.generadordepreus.info/*
// @match        *://*.generadordeprecios.info/*
// @grant        GM_setClipboard
// @run-at       document-idle
// @noframes
// @downloadURL  https://moominot.github.io/amidaments/eines/generador-preus.user.js
// @updateURL    https://moominot.github.io/amidaments/eines/generador-preus.user.js
// ==/UserScript==

/* global GM_setClipboard */

/**
 * Script d'usuari per a Tampermonkey. Veure docs/generador-preus.md.
 *
 * Posa un botó flotant al Generador de Preus de CYPE que copia l'enllaç del BC3 de la partida
 * que tens a la pantalla. Enganxat a l'aplicació amb Ctrl+V, la partida entra al projecte
 * a través del proxy de worker/.
 */
(function () {
    'use strict';
    if (document.getElementById('btn-bc3-extractor')) return;

    const btn = document.createElement('button');
    btn.id = 'btn-bc3-extractor';
    btn.textContent = '📋 Copiar BC3';
    Object.assign(btn.style, {
        position: 'fixed', bottom: '20px', right: '20px', zIndex: '99999',
        padding: '12px 18px', backgroundColor: '#007bff', color: 'white',
        border: 'none', borderRadius: '50px', cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)', fontWeight: 'bold', fontFamily: 'sans-serif'
    });

    const avisa = (text, color) => {
        btn.textContent = text;
        btn.style.backgroundColor = color;
        setTimeout(() => {
            btn.textContent = '📋 Copiar BC3';
            btn.style.backgroundColor = '#007bff';
        }, 2000);
    };

    btn.addEventListener('click', () => {
        // Es busca en el moment del clic: l'enllaç canvia quan tries les opcions de la partida.
        const enllac = document.querySelector('a[data-href$=".bc3"], a[href$=".bc3"]');
        if (!enllac) {
            avisa('❌ Cap BC3', '#dc3545');
            return;
        }
        const relatiu = enllac.getAttribute('data-href') || enllac.getAttribute('href');
        // Sempre absoluta: un camí relatiu, l'aplicació no el podria descarregar.
        const url = new URL(relatiu, location.href).href;
        GM_setClipboard(url, 'text');
        avisa('✅ Copiat!', '#28a745');
    });

    document.body.appendChild(btn);
})();
