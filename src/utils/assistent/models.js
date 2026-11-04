/**
 * Models i esforç que es poden triar a l'assistent (veure `docs/assistent.md`).
 *
 * Fitxer a part de `agent.js` perquè el panell en pugui ensenyar les opcions sense carregar
 * el SDK. Cada model porta el que canvia a la petició:
 * - `fallbacks`: Opus i Sonnet admeten que, si els filtres declinen una petició legítima,
 *   Anthropic la torni a fer amb el model que recomana. Haiku no en té: amb `fallbacks` la
 *   petició declinada continua declinada, així que no s'hi envia.
 * - `webDinamic`: les versions `_20260209` de la cerca i la lectura web (filtren el resultat
 *   abans de posar-lo al context) només són per a Opus i Sonnet; Haiku fa servir les bàsiques.
 * - `preu`: dòlars per milió de tòquens, per a l'estimació del cost. Haiku té dues tarifes
 *   segons la llargada de la petició (fins a 100.000 tòquens d'entrada, i més).
 *
 * Canviar de model o d'esforç a mitja conversa funciona, però la memòria cau és de cada model
 * i la de la conversa es refà: la volta següent es paga sencera.
 */

export const MODELS = [
    {
        id: 'claude-opus-5-5', nom: 'Claude Opus 5.5', curt: 'Opus 5.5',
        descripcio: 'El més capaç: per a sistemes i amidaments complexos',
        fallbacks: true, webDinamic: true,
        preu: { entrada: 4, sortida: 20, escripturaCau: 5, lecturaCau: 0.2 },
    },
    {
        id: 'claude-sonnet-5-5', nom: 'Claude Sonnet 5.5', curt: 'Sonnet 5.5',
        descripcio: 'Més ràpid i a la meitat de preu; bo per a la majoria de feines',
        fallbacks: true, webDinamic: true,
        preu: { entrada: 2, sortida: 10, escripturaCau: 2.5, lecturaCau: 0.2 },
    },
    {
        id: 'claude-haiku-5-5', nom: 'Claude Haiku 5.5', curt: 'Haiku 5.5',
        descripcio: 'El més barat i ràpid: consultes i canvis senzills',
        fallbacks: false, webDinamic: false,
        preu: { entrada: 0.1, sortida: 0.5, escripturaCau: 0.125, lecturaCau: 0.01 },
        // Per sobre de 100.000 tòquens d'entrada, la tarifa és cinc vegades més cara.
        llindar: 100000,
        preuLlarg: { entrada: 0.5, sortida: 2.5, escripturaCau: 0.625, lecturaCau: 0.05 },
    },
];

export const MODEL_PER_DEFECTE = MODELS[0].id;

export const ESFORCOS = [
    { id: 'low', nom: 'Baix', descripcio: 'Ràpid i barat; per a consultes i canvis petits' },
    { id: 'medium', nom: 'Mitjà', descripcio: 'Equilibrat' },
    { id: 'high', nom: 'Alt', descripcio: 'Pensa més abans de fer; el recomanat per muntar sistemes' },
    { id: 'xhigh', nom: 'Molt alt', descripcio: 'Per a feines llargues i amb moltes partides' },
    { id: 'max', nom: 'Màxim', descripcio: 'El més acurat i el més car' },
];

export const ESFORC_PER_DEFECTE = 'high';

export const model = (id) => MODELS.find(m => m.id === id) || MODELS[0];
export const esforcValid = (id) => (ESFORCOS.some(e => e.id === id) ? id : ESFORC_PER_DEFECTE);

/** Cost en dòlars d'una resposta, amb els preus del model triat. */
export const costUs = (usage, idModel = MODEL_PER_DEFECTE) => {
    if (!usage) return 0;
    const m = model(idModel);
    const entrada = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
    const p = m.llindar && entrada > m.llindar ? m.preuLlarg : m.preu;
    return ((usage.input_tokens || 0) * p.entrada
        + (usage.output_tokens || 0) * p.sortida
        + (usage.cache_creation_input_tokens || 0) * p.escripturaCau
        + (usage.cache_read_input_tokens || 0) * p.lecturaCau) / 1e6;
};

/** Les eines del servidor (cerca i lectura web) en la versió que admet el model. */
export const einesWeb = (idModel) => (model(idModel).webDinamic
    ? [
        { type: 'web_search_20260209', name: 'web_search', max_uses: 8 },
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 8 },
    ]
    : [
        { type: 'web_search_20250305', name: 'web_search', max_uses: 8 },
        { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 8 },
    ]);

/** Els camps de la petició que depenen del model i de l'esforç. */
export const opcionsPeticio = (idModel, esforc) => {
    const m = model(idModel);
    return {
        model: m.id,
        thinking: { type: 'adaptive' },
        output_config: { effort: esforcValid(esforc) },
        ...(m.fallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
    };
};
