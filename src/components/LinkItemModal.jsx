import { useState, useMemo } from 'react';
import { X, Link as LinkIcon, Search, FileText } from 'lucide-react';
import { formatNumber, normalizeCode, calcItemTotalQty } from '../utils/calculations';

/**
 * Tria de la partida d'origen d'una línia d'amidament vinculada.
 *
 * Es llisten només les partides (les que tenen unitat), amb la quantitat que tenen ara,
 * perquè es vegi què s'està vinculant abans de fer-ho.
 */
const LinkItemModal = ({ chapters, excludeCode, onPick, onClose }) => {
    const [cerca, setCerca] = useState('');

    const partides = useMemo(() => {
        const fora = normalizeCode(excludeCode || '');
        const out = [];
        const walk = (nodes, capitol) => nodes.forEach(n => {
            if (n.unit) {
                if (normalizeCode(n.code) !== fora) {
                    out.push({ code: n.code, description: n.description, unit: n.unit, capitol, qty: calcItemTotalQty(n) });
                }
            }
            walk([...(n.subChapters || []), ...(n.items || [])], n.unit ? capitol : (n.description || capitol));
        });
        walk(chapters || [], '');
        return out;
    }, [chapters, excludeCode]);

    const filtrades = useMemo(() => {
        const t = cerca.trim().toLowerCase();
        if (!t) return partides.slice(0, 200);
        return partides.filter(p =>
            (p.code || '').toLowerCase().includes(t) || (p.description || '').toLowerCase().includes(t)
        ).slice(0, 200);
    }, [partides, cerca]);

    return (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 backdrop-blur-md p-2 md:p-8">
            <div className="bg-white shadow-2xl border border-slate-300 w-full max-w-2xl max-h-full flex flex-col animate-in zoom-in-95 duration-200">
                <div className="bg-slate-900 text-white p-4 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-600 p-1.5"><LinkIcon size={16} /></div>
                        <div>
                            <h3 className="font-bold uppercase tracking-widest text-xs">Vincular a una partida</h3>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                                L&apos;amidament es prendrà d&apos;aquesta partida
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="hover:text-red-400 transition-colors p-2 -m-2 touch-manipulation">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-3 border-b border-slate-200 flex-shrink-0 relative">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                    <input
                        autoFocus
                        value={cerca}
                        onChange={e => setCerca(e.target.value)}
                        placeholder="Cerca per codi o descripció..."
                        className="w-full pl-9 pr-3 py-2.5 border border-slate-200 text-xs focus:border-blue-500 outline-none"
                    />
                </div>

                <div className="overflow-auto flex-1 divide-y divide-slate-100">
                    {filtrades.length === 0 && (
                        <div className="p-12 text-center">
                            <FileText size={36} className="mx-auto text-slate-200 mb-3" />
                            <p className="text-xs text-slate-400 italic">Cap partida coincideix amb la cerca.</p>
                        </div>
                    )}
                    {filtrades.map(p => (
                        <button
                            key={p.code}
                            onClick={() => onPick(p.code)}
                            className="w-full text-left p-3 hover:bg-blue-50 transition-colors flex items-center gap-3 touch-manipulation"
                        >
                            <span className="font-mono text-[10px] text-slate-400 w-24 flex-shrink-0 truncate">{p.code}</span>
                            <span className="flex-1 min-w-0">
                                <span className="block text-[11px] text-slate-700 truncate">{p.description}</span>
                                {p.capitol && <span className="block text-[9px] text-slate-400 uppercase truncate">{p.capitol}</span>}
                            </span>
                            <span className="font-mono text-[11px] text-slate-600 flex-shrink-0">
                                {formatNumber(p.qty, 2)} <span className="text-slate-400">{p.unit}</span>
                            </span>
                        </button>
                    ))}
                </div>

                <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-shrink-0 gap-3">
                    <p className="text-[10px] text-slate-400 italic leading-tight">
                        El vincle es desa al projecte i al JSON. En exportar a BC3 es converteix en la quantitat calculada.
                    </p>
                    <button
                        onClick={onClose}
                        className="bg-slate-800 text-white hover:bg-slate-700 px-5 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors flex-shrink-0 touch-manipulation"
                    >
                        Cancel·lar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LinkItemModal;
