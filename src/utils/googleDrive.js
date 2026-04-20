/**
 * googleDrive.js
 * Encapsula tota la interacció amb Google Drive API i Google Picker.
 * No requereix cap paquet npm — carrega les APIs de Google dinàmicament.
 */

// ─── Càrrega dinàmica d'APIs ────────────────────────────────────────────────

let _gapiReady = false;
let _gsiReady = false;
let _gapiInitialized = false;

const _loadScript = (src) =>
    new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) { resolve(); return; }
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.defer = true;
        s.onload = resolve;
        s.onerror = () => reject(new Error(`Error carregant script: ${src}`));
        document.head.appendChild(s);
    });

export const loadGoogleApis = async () => {
    await Promise.all([
        _loadScript('https://apis.google.com/js/api.js').then(() => { _gapiReady = true; }),
        _loadScript('https://accounts.google.com/gsi/client').then(() => { _gsiReady = true; }),
    ]);
};

export const initGapiClient = (apiKey) =>
    new Promise((resolve, reject) => {
        if (_gapiInitialized) { resolve(); return; }
        window.gapi.load('client:picker', async () => {
            try {
                await window.gapi.client.init({
                    apiKey,
                    discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
                });
                _gapiInitialized = true;
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    });

// ─── OAuth2 Token Client ─────────────────────────────────────────────────────

const SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.metadata.readonly',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export const createTokenClient = (clientId, callback) =>
    window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback,
    });

// ─── Google Picker ────────────────────────────────────────────────────────────

export const openPicker = ({ accessToken, apiKey, appId, onPicked, onCancel }) => {
    // View que mostra tots els fitxers de Drive (no filtrem per MIME perquè BC3
    // pot tenir mimeType variable; ho validem nosaltres per extensió després).
    const allFilesView = new window.google.picker.DocsView()
        .setIncludeFolders(false)
        .setSelectFolderEnabled(false);

    const picker = new window.google.picker.PickerBuilder()
        .addView(allFilesView)
        .setOAuthToken(accessToken)
        .setDeveloperKey(apiKey)
        .setAppId(appId)
        .setTitle('Selecciona un fitxer .json o .bc3')
        .setCallback((data) => {
            if (data.action === window.google.picker.Action.PICKED) {
                const file = data.docs[0];
                const nameLower = (file.name || '').toLowerCase();
                if (nameLower.endsWith('.json') || nameLower.endsWith('.bc3')) {
                    const fileType = nameLower.endsWith('.json') ? 'json' : 'bc3';
                    onPicked({ fileId: file.id, fileName: file.name, fileType });
                } else {
                    alert('Format no suportat. Selecciona un fitxer .json o .bc3');
                }
            } else if (data.action === window.google.picker.Action.CANCEL) {
                onCancel?.();
            }
        })
        .build();

    picker.setVisible(true);
};

// ─── Metadata ────────────────────────────────────────────────────────────────

export const getFileMetadata = async (fileId, accessToken) => {
    console.log('📡 Fetching metadata for:', fileId);
    const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) {
        const errText = await res.text();
        console.error('❌ Metadata fetch failed:', res.status, errText);
        throw new Error(`Error metadades Drive: ${res.status}`);
    }
    const data = await res.json();
    console.log('✅ Metadata received:', data.name);
    return data;
};

// ─── Descàrrega ──────────────────────────────────────────────────────────────

/**
 * Descarrega un fitxer de Drive.
 * @param {string} fileType - 'json' | 'bc3'
 * @returns {string | Uint8Array} — text per JSON, Uint8Array per BC3
 */
export const downloadDriveFile = async (fileId, accessToken, fileType) => {
    console.log('📡 Downloading file:', fileId, 'type:', fileType);
    const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) {
        const errText = await res.text();
        console.error('❌ Download failed:', res.status, errText);
        throw new Error(`Error descàrrega Drive: ${res.status}`);
    }

    if (fileType === 'json') {
        const text = await res.text();
        console.log('✅ JSON Downloaded, length:', text.length);
        return text;
    } else {
        // BC3: retorna ArrayBuffer per decodificar amb windows-1252
        const buf = await res.arrayBuffer();
        console.log('✅ BC3 Downloaded, size:', buf.byteLength);
        return buf;
    }
};

// ─── Informació d'usuari ──────────────────────────────────────────────────────

export const getUserInfo = async (accessToken) => {
    try {
        const res = await fetch(
            'https://www.googleapis.com/oauth2/v2/userinfo',
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        return res.ok ? res.json() : null;
    } catch {
        return null;
    }
};

// ─── Pujada a Drive ───────────────────────────────────────────────────────────

/**
 * Crea un fitxer nou a Drive amb contingut textual o binari.
 * @param {string} fileName
 * @param {string | Uint8Array} content
 * @param {string} mimeType
 * @param {string} accessToken
 */
export const createDriveFile = async (fileName, content, mimeType, accessToken) => {
    const form = _buildMultipartForm(fileName, content, mimeType);
    const res = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': `multipart/related; boundary=${form.boundary}`,
            },
            body: form.body,
        }
    );
    if (!res.ok) throw new Error(`Error creació Drive: ${res.status} ${await res.text()}`);
    return res.json();
};

/**
 * Actualitza el contingut d'un fitxer existent a Drive.
 * @param {string} fileId
 * @param {string | Uint8Array} content
 * @param {string} mimeType
 * @param {string} accessToken
 */
export const updateDriveFile = async (fileId, content, mimeType, accessToken) => {
    const form = _buildMultipartForm(null, content, mimeType);
    const res = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id,name`,
        {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': `multipart/related; boundary=${form.boundary}`,
            },
            body: form.body,
        }
    );
    if (!res.ok) throw new Error(`Error actualització Drive: ${res.status} ${await res.text()}`);
    return res.json();
};

// ─── Helpers interns ──────────────────────────────────────────────────────────

function _buildMultipartForm(fileName, content, mimeType) {
    const boundary = `amidaments_${Date.now()}`;
    const metadataPart = fileName
        ? JSON.stringify({ name: fileName })
        : '{}';

    // Capçaleres de les parts
    const enc = new TextEncoder();
    const metaHeader = enc.encode(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataPart}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
    );
    const footer = enc.encode(`\r\n--${boundary}--`);

    // Contingut
    const contentBytes = typeof content === 'string' ? enc.encode(content) : content;

    // Combina en un únic Uint8Array
    const total = metaHeader.length + contentBytes.length + footer.length;
    const body = new Uint8Array(total);
    body.set(metaHeader, 0);
    body.set(contentBytes, metaHeader.length);
    body.set(footer, metaHeader.length + contentBytes.length);

    return { boundary, body };
}

// ─── Codificació Windows-1252 ─────────────────────────────────────────────────
// Reutilitza la lògica existent de l'app per exportar BC3

export const toWindows1252Bytes = (str) => {
    const buf = new Uint8Array(str.length);
    const map = {
        0x00E0: 0xE0, 0x00E1: 0xE1, 0x00E8: 0xE8, 0x00E9: 0xE9,
        0x00ED: 0xED, 0x00F2: 0xF2, 0x00F3: 0xF3, 0x00FA: 0xFA,
        0x00EF: 0xEF, 0x00FC: 0xFC, 0x00E7: 0xE7, 0x00F1: 0xF1,
        0x00C0: 0xC0, 0x00C1: 0xC1, 0x00C8: 0xC8, 0x00C9: 0xC9,
        0x00CD: 0xCD, 0x00D2: 0xD2, 0x00D3: 0xD3, 0x00DA: 0xDA,
        0x00CF: 0xCF, 0x00DC: 0xDC, 0x00C7: 0xC7, 0x00D1: 0xD1,
        0x20AC: 0x80, 0x00B0: 0xB0,
    };
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        buf[i] = c < 128 ? c : (map[c] ?? 63);
    }
    return buf;
};
