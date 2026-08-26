import { useState } from 'react';
import { X, Cloud, Key, Hash, AlertCircle, CheckCircle } from 'lucide-react';

/**
 * DriveSettingsModal
 * Modal per introduir les credencials de Google Cloud Console.
 * S'obre la primera vegada que l'usuari intenta connectar Drive sense credencials.
 */
const DriveSettingsModal = ({ config, onSave, onClose }) => {
    const [clientId, setClientId] = useState(config.clientId || '');
    const [apiKey, setApiKey] = useState(config.apiKey || '');
    const [appId, setAppId] = useState(config.appId || '');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!clientId.trim() || !apiKey.trim() || !appId.trim()) return;
        onSave({ clientId: clientId.trim(), apiKey: apiKey.trim(), appId: appId.trim() });
    };

    const isComplete = clientId.trim() && apiKey.trim() && appId.trim();

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-md">
            <div className="bg-white w-[560px] max-w-[95vw] shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-600 p-2">
                            <Cloud size={18} />
                        </div>
                        <div>
                            <h2 className="font-bold uppercase tracking-widest text-xs">
                                Configuració de Google Drive
                            </h2>
                            <p className="text-slate-400 text-[10px] mt-0.5">
                                Credencials de Google Cloud Console
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="hover:text-red-400 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Info */}
                <div className="bg-blue-50 border-b border-blue-100 px-6 py-3 flex gap-3 items-start">
                    <AlertCircle size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="text-[11px] text-blue-800 leading-relaxed">
                        Necessites un projecte a{' '}
                        <a
                            href="https://console.cloud.google.com"
                            target="_blank"
                            rel="noreferrer"
                            className="underline font-bold"
                        >
                            Google Cloud Console
                        </a>{' '}
                        amb <strong>Drive API</strong> i <strong>Picker API</strong> activades,
                        i unes credencials OAuth 2.0. Les claus es guarden localment al teu navegador.
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* Client ID */}
                    <div className="space-y-1.5">
                        <label className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500 tracking-widest">
                            <Key size={12} className="text-blue-500" />
                            Client ID (OAuth 2.0)
                        </label>
                        <input
                            type="text"
                            value={clientId}
                            onChange={(e) => setClientId(e.target.value)}
                            placeholder="xxxxxxxx.apps.googleusercontent.com"
                            className="w-full border border-slate-200 bg-slate-50 p-3 text-xs font-mono focus:border-blue-500 outline-none focus:bg-white transition-colors"
                            required
                        />
                    </div>

                    {/* API Key */}
                    <div className="space-y-1.5">
                        <label className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500 tracking-widest">
                            <Key size={12} className="text-emerald-500" />
                            API Key
                        </label>
                        <input
                            type="text"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="AIzaSy..."
                            className="w-full border border-slate-200 bg-slate-50 p-3 text-xs font-mono focus:border-blue-500 outline-none focus:bg-white transition-colors"
                            required
                        />
                    </div>

                    {/* App ID */}
                    <div className="space-y-1.5">
                        <label className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500 tracking-widest">
                            <Hash size={12} className="text-purple-500" />
                            App ID (número de projecte GCP)
                        </label>
                        <input
                            type="text"
                            value={appId}
                            onChange={(e) => setAppId(e.target.value)}
                            placeholder="123456789012"
                            className="w-full border border-slate-200 bg-slate-50 p-3 text-xs font-mono focus:border-blue-500 outline-none focus:bg-white transition-colors"
                            required
                        />
                        <p className="text-[10px] text-slate-400 italic">
                            A Google Cloud Console → Informació del projecte → Número de projecte
                        </p>
                    </div>

                    {isComplete && (
                        <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-2">
                            <CheckCircle size={14} />
                            <span className="text-[11px] font-medium">Credencials llestes per guardar</span>
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 p-3 text-xs font-bold uppercase tracking-widest transition-colors"
                        >
                            Cancel·lar
                        </button>
                        <button
                            type="submit"
                            disabled={!isComplete}
                            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 text-white p-3 text-xs font-bold uppercase tracking-widest shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
                        >
                            <Cloud size={14} />
                            Guardar i Connectar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default DriveSettingsModal;
