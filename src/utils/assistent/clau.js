/**
 * La clau de l'API d'Anthropic de l'usuari, desada en aquest navegador. La comparteixen
 * l'assistent i el traductor. No passa per cap servidor nostre: va directament a Anthropic.
 */
const CLAU = 'amidaments:clau-anthropic';

export const llegeixClau = () => { try { return localStorage.getItem(CLAU) || ''; } catch { return ''; } };
export const desaClau = (v) => { try { if (v) localStorage.setItem(CLAU, v); else localStorage.removeItem(CLAU); } catch { /* res */ } };

/** Les preferències de l'assistent (model, esforç, idioma de CYPE), també d'aquest navegador. */
export const llegeixPref = (clau, perDefecte) => { try { return localStorage.getItem(clau) || perDefecte; } catch { return perDefecte; } };
export const desaPref = (clau, v) => { try { localStorage.setItem(clau, v); } catch { /* res */ } };
export const PREF_MODEL = 'amidaments:assistent-model';
