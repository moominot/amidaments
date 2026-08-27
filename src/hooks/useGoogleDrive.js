import { useState, useEffect, useRef, useCallback } from 'react';
import {
    loadGoogleApis,
    initGapiClient,
    createTokenClient,
    openPicker,
    getFileMetadata,
    downloadDriveFile,
    getUserInfo,
    createDriveFile,
    updateDriveFile,
    toWindows1252Bytes,
} from '../utils/googleDrive';

/**
 * Hook principal d'integració amb Google Drive.
 *
 * @param {object} params
 * @param {string} params.clientId
 * @param {string} params.apiKey
 * @param {string} params.appId
 * @param {function} params.onProjectLoaded({ budget, priceDatabase }) — callback per JSON
 * @param {function} params.onBC3Loaded(arrayBuffer) — callback per BC3
 * @param {function} params.notify(msg, type)
 */
export const useGoogleDrive = ({
    clientId,
    apiKey,
    appId,
    onProjectLoaded,
    onBC3Loaded,
    notify,
}) => {
    const [isReady, setIsReady] = useState(false);       // APIs carregades + gapi init
    const [isSignedIn, setIsSignedIn] = useState(false);
    const [userName, setUserName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [currentFileId, setCurrentFileId] = useState(null);
    const [currentFileName, setCurrentFileName] = useState('');
    const [currentFileType, setCurrentFileType] = useState(null); // 'json' | 'bc3' | null

    const tokenClientRef = useRef(null);
    const accessTokenRef = useRef(null);
    const tokenExpiryRef = useRef(null);

    // ── Inicialització ──────────────────────────────────────────────────────

    useEffect(() => {
        if (!clientId || !apiKey || !appId) return;

        let cancelled = false;
        (async () => {
            try {
                await loadGoogleApis();
                await initGapiClient(apiKey);
                if (cancelled) return;

                tokenClientRef.current = createTokenClient(clientId, async (resp) => {
                    if (resp.error) {
                        notify?.('Error d\'autenticació Drive: ' + resp.error, 'error');
                        return;
                    }
                    accessTokenRef.current = resp.access_token;
                    tokenExpiryRef.current = Date.now() + (resp.expires_in - 30) * 1000;
                    setIsSignedIn(true);

                    // Obtenir nom d'usuari
                    const info = await getUserInfo(resp.access_token);
                    console.log('👤 Active Google User:', info?.email || 'unknown');
                    if (info?.name) setUserName(info.name);
                });

                setIsReady(true);

                // Comprova si venim d'un "Open with..." (paràmetre ?state= a l'URL)
                _handleUrlState();
            } catch (err) {
                console.error('Drive init error:', err);
            }
        })();

        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clientId, apiKey, appId]);

    // ── Token management ────────────────────────────────────────────────────

    const _ensureToken = () =>
        new Promise((resolve, reject) => {
            const now = Date.now();
            if (accessTokenRef.current && tokenExpiryRef.current && now < tokenExpiryRef.current) {
                resolve(accessTokenRef.current);
                return;
            }
            // Token caducat o inexistent → demana un de nou
            if (!tokenClientRef.current) {
                reject(new Error('Token client no inicialitzat'));
                return;
            }
            const originalCallback = tokenClientRef.current.callback;
            tokenClientRef.current.callback = (resp) => {
                tokenClientRef.current.callback = originalCallback;
                if (resp.error) { reject(new Error(resp.error)); return; }
                accessTokenRef.current = resp.access_token;
                tokenExpiryRef.current = Date.now() + (resp.expires_in - 30) * 1000;
                setIsSignedIn(true);
                getUserInfo(resp.access_token).then(info => {
                    if (info?.name) setUserName(info.name);
                });
                originalCallback?.(resp);
                resolve(resp.access_token);
            };
            tokenClientRef.current.requestAccessToken({ prompt: '' });
        });

    // ── Sign in / Sign out ──────────────────────────────────────────────────

    const signIn = useCallback(() => {
        if (!tokenClientRef.current) return;
        tokenClientRef.current.requestAccessToken({ prompt: 'consent' });
    }, []);

    const signOut = useCallback(() => {
        const token = accessTokenRef.current;
        if (token) window.google?.accounts?.oauth2?.revoke(token);
        accessTokenRef.current = null;
        tokenExpiryRef.current = null;
        setIsSignedIn(false);
        setUserName('');
        setCurrentFileId(null);
        setCurrentFileName('');
        setCurrentFileType(null);
    }, []);

    // ── Obrir des de Drive (Picker) ──────────────────────────────────────────

    const openFromDrive = useCallback(async () => {
        try {
            const token = await _ensureToken();
            openPicker({
                accessToken: token,
                apiKey,
                appId,
                onPicked: ({ fileId, fileName, fileType }) => {
                    _loadFile(fileId, fileName, fileType);
                },
            });
        } catch (err) {
            notify?.('Error obrint Drive: ' + err.message, 'error');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiKey, appId]);

    // ── Carregar fitxer ──────────────────────────────────────────────────────

    const _loadFile = useCallback(async (fileId, fileName, fileType) => {
        console.log('📂 _loadFile called for:', fileId, fileName, fileType);
        try {
            setIsLoading(true);
            const token = await _ensureToken();
            console.log('🎫 Token acquired for _loadFile');
            const rawFileName = fileName || (await getFileMetadata(fileId, token)).name;
            const ext = rawFileName.toLowerCase().endsWith('.bc3') ? 'bc3' : 'json';

            const data = await downloadDriveFile(fileId, token, ext);

            if (ext === 'json') {
                const projectData = JSON.parse(data);
                if (projectData.budget && projectData.priceDatabase) {
                    onProjectLoaded(projectData);
                    setCurrentFileId(fileId);
                    setCurrentFileName(rawFileName);
                    setCurrentFileType('json');
                    notify?.(`Projecte carregat des de Drive: ${rawFileName}`);
                } else {
                    notify?.('Format JSON no vàlid', 'error');
                }
            } else {
                // BC3: passa l'ArrayBuffer al callback
                onBC3Loaded(data, rawFileName);
                // El BC3 sí que el marquem com a fitxer Drive obert
                setCurrentFileId(fileId);
                setCurrentFileName(rawFileName);
                setCurrentFileType('bc3');
                notify?.(`BC3 importat des de Drive: ${rawFileName}`);
            }
        } catch (err) {
            console.error(err);
            notify?.('Error carregant fitxer de Drive: ' + err.message, 'error');
        } finally {
            setIsLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onProjectLoaded, onBC3Loaded]);

    // ── "Open with..." — processa ?state= de l'URL ───────────────────────────

    const _handleUrlState = useCallback(async () => {
        const params = new URLSearchParams(window.location.search);
        const stateStr = params.get('state');
        if (!stateStr) return;

        try {
            const state = JSON.parse(stateStr);
            if (state.action === 'open' && state.ids?.[0]) {
                const fileId = state.ids[0];
                console.log('🔄 Drive URL State detected:', state);
                notify?.('Obrint fitxer des de Google Drive...');

                // Netejar el paràmetre de l'URL sense recarregar
                const newUrl = window.location.pathname;
                window.history.replaceState({}, document.title, newUrl);
                console.log('🧹 URL cleaned');

                // Necessitem token primer
                const token = await _ensureToken();
                console.log('✅ Token acquired for URL state');

                const meta = await getFileMetadata(fileId, token);
                console.log('📄 Metadata retrieved:', meta.name);
                const ext = meta.name.toLowerCase().endsWith('.bc3') ? 'bc3' : 'json';
                await _loadFile(fileId, meta.name, ext);
            }
        } catch (err) {
            console.error('❌ Error processant state de Drive:', err);
            notify?.('Error al processar l\'obertura des de Drive: ' + err.message, 'error');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [_loadFile]);

    // ── Desar JSON a Drive ────────────────────────────────────────────────────

    const saveToDrive = useCallback(async (budget, priceDatabase) => {
        try {
            const token = await _ensureToken();
            const projectData = {
                budget,
                priceDatabase,
                exportDate: new Date().toISOString(),
                version: '1.0',
            };
            const json = JSON.stringify(projectData, null, 2);
            const mimeType = 'application/json';

            if (currentFileId && currentFileType === 'json') {
                await updateDriveFile(currentFileId, json, mimeType, token);
                notify?.(`Desat a Drive: ${currentFileName} ✓`);
            } else {
                // Nou fitxer
                const name = prompt('Nom del fitxer a Drive:', `${budget.name || 'projecte'}.json`);
                if (!name) return;
                const fileName = name.endsWith('.json') ? name : `${name}.json`;
                const result = await createDriveFile(fileName, json, mimeType, token);
                setCurrentFileId(result.id);
                setCurrentFileName(fileName);
                setCurrentFileType('json');
                notify?.(`Desat com a fitxer nou a Drive: ${fileName} ✓`);
            }
        } catch (err) {
            notify?.('Error desant a Drive: ' + err.message, 'error');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentFileId, currentFileType, currentFileName]);

    const saveAsToDrive = useCallback(async (budget, priceDatabase) => {
        try {
            const token = await _ensureToken();
            const name = prompt('Nom del nou fitxer a Drive:', `${budget.name || 'projecte'}.json`);
            if (!name) return;
            const fileName = name.endsWith('.json') ? name : `${name}.json`;
            const projectData = { budget, priceDatabase, exportDate: new Date().toISOString(), version: '1.0' };
            const result = await createDriveFile(fileName, JSON.stringify(projectData, null, 2), 'application/json', token);
            setCurrentFileId(result.id);
            setCurrentFileName(fileName);
            setCurrentFileType('json');
            notify?.(`Còpia desada a Drive: ${fileName} ✓`);
        } catch (err) {
            notify?.('Error desant còpia a Drive: ' + err.message, 'error');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Exportar BC3 a Drive ──────────────────────────────────────────────────

    /**
     * @param {string}  bc3Content contingut ja generat
     * @param {string}  fileName   nom sense extensió
     * @param {boolean} sempreNou  no oferir mai de sobreescriure el fitxer obert. S'hi passa
     *   `true` en exportar una certificació: el fitxer que es té obert és el del pressupost, i
     *   proposar de sobreescriure'l amb una certificació és una manera fàcil de perdre'l.
     */
    const exportBC3ToDrive = useCallback(async (bc3Content, fileName, sempreNou = false) => {
        try {
            const token = await _ensureToken();
            const bytes = toWindows1252Bytes(bc3Content);
            const mimeType = 'text/plain';

            if (!sempreNou && currentFileId && currentFileType === 'bc3') {
                // Preguntar sobreescriure o còpia
                const overwrite = window.confirm(
                    `Sobreescriure "${currentFileName}" a Drive?\n\n` +
                    `[Accepta] Sobreescriure\n[Cancel·la] Desar com a còpia nova`
                );
                if (overwrite) {
                    await updateDriveFile(currentFileId, bytes, mimeType, token);
                    notify?.(`BC3 actualitzat a Drive: ${currentFileName} ✓`);
                } else {
                    const name = prompt('Nom de la còpia BC3 a Drive:', `${fileName || 'projecte'}_còpia.bc3`);
                    if (!name) return;
                    const fileName = name.endsWith('.bc3') ? name : `${name}.bc3`;
                    const res = await createDriveFile(fileName, bytes, mimeType, token);
                    setCurrentFileId(res.id);
                    setCurrentFileName(fileName);
                    setCurrentFileType('bc3');
                    notify?.(`BC3 desat a Drive: ${fileName} ✓`);
                }
            } else {
                // No hi ha fitxer BC3 de referència, o és una certificació → desa com a nou
                const name = prompt('Nom del fitxer BC3 a Drive:', `${fileName || 'projecte'}.bc3`);
                if (!name) return;
                const nomFinal = name.endsWith('.bc3') ? name : `${name}.bc3`;
                const res = await createDriveFile(nomFinal, bytes, mimeType, token);
                // Una certificació no passa a ser el fitxer de referència: el que s'està
                // editant continua essent el pressupost.
                if (!sempreNou) {
                    setCurrentFileId(res.id);
                    setCurrentFileName(nomFinal);
                    setCurrentFileType('bc3');
                }
                notify?.(`BC3 exportat a Drive: ${nomFinal} ✓`);
            }
        } catch (err) {
            notify?.('Error exportant BC3 a Drive: ' + err.message, 'error');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentFileId, currentFileType, currentFileName]);

    return {
        isReady,
        isSignedIn,
        userName,
        isLoading,
        currentFileId,
        currentFileName,
        currentFileType,
        signIn,
        signOut,
        openFromDrive,
        saveToDrive,
        saveAsToDrive,
        exportBC3ToDrive,
    };
};
