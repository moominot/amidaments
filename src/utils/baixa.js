import { safeFileName } from './fileName';

/**
 * Baixa un contingut com a fitxer. El nom passa per `safeFileName`: Chromium descarta l'atribut
 * `download` sencer si porta accents (§11 de `docs/estat-actual.md`).
 */
export const baixaFitxer = (contingut, nom, extensio, tipus = 'application/octet-stream') => {
    const blob = contingut instanceof Blob ? contingut : new Blob([contingut], { type: tipus });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeFileName(nom, 'fitxer')}${extensio}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};
