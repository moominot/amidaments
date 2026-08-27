import { useState, useMemo } from 'react';
import { X, Link as LinkIcon, Search, FileText, ChevronLeft, Layers } from 'lucide-react';
import { formatNumber, normalizeCode, calcItemTotalQty, calcMeasureTotal } from '../utils/calculations';
import { isRefLine, refLabel } from '../utils/measurementRefs';

/**
 * Tria de l'origen d'una línia d'amidament vinculada, en dos passos.
 *
 *   1. Quina partida.
 *   2. Tota la partida, o una línia concreta seva.
 *
 * El segon pas és el que permet que, si l'origen amida dues terrasses, la destinació en pugui
 * agafar només una. Les quantitats es mostren a la llista perquè es vegi què s'està vinculant
 * abans de fer-ho.
 */
const LinkItemModal = ({ chapters, excludeCode, onPick, onClose }) => {
    const [cerca, setCerca] = useState('');
    const [triada, setTriada] = useState(null);   // partida seleccionada al pas 1

    const partides = useMemo(() => {
        const fora = normalizeCode(excludeCode || '');
        const out = [];
        const walk = (nodes, capitol) => nodes.forEach(n => {
            if (n.unit && normalizeCode(n.code) !== fora) {
                out.push({
                    code: n.code, description: n.description, unit: n.unit, capitol,
                    qty: calcItemTotalQty(n), measurements: n.measurements || [],
                });
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

    // Aportació de cada línia, per poder-la ensenyar al pas 2. Les de percentatge no tenen
    // parcial propi: aporten un tant per cent del subtotal de les normals.
    const liniesDe = (p) => {
        const subtotal = (p.measurements || []).reduce((acc, m) => acc + (m.isIncrement ? 0 : calcMeasureTotal(m)), 0);
        return (p.measurements || []).map(m => ({
            ...m,
            valor: m.isIncrement ? subtotal * ((parseFloat(m.units) || 0) / 100) : calcMeasureTotal(m),
        }));
    };

    return (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 backdrop-blur-md p-2 md:p-8">
            <div className="bg-white shadow-2xl border border-slate-300 w-full max-w-2xl max-h-full flex flex-col animate-in zoom-in-95 duration-200">
                <div className="bg-slate-900 text-white p-4 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        {triada ? (
                            <button
                                onClick={() => setTriada(null)}
                                className="bg-slate-800 hover:bg-slate-700 p-2 -m-0.5 rounded transition-colors flex-shrink-0 touch-manipulation"
                                title="Tornar a la llista de partides"
                            >
                                <ChevronLeft size={16} />
                            </button>
                        ) : (
                            <div className="bg-blue-600 p-1.5 flex-shrink-0"><LinkIcon size={16} /></div>
                        )}
                        <div className="min-w-0">
                            <h3 className="font-bold uppercase tracking-widest text-xs truncate">
                                {triada ? 'Què vols agafar-ne' : 'Vincular a una partida'}
                            </h3>
                            <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                                {triada
                                    ? `${triada.code} · ${triada.description}`
                                    : "L'amidament es prendrà d'aquesta partida"}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="hover:text-red-400 transition-colors p-2 -m-2 touch-manipulation flex-shrink-0">
                        <X size={18} />
                    </button>
                </div>

                {/* Pas 1: quina partida */}
                {!triada && (
                    <>
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
                                    onClick={() => (p.measurements.length > 1 ? setTriada(p) : onPick(p.code, null))}
                                    className="w-full text-left p-3 hover:bg-blue-50 transition-colors flex items-center gap-3 touch-manipulation"
                                >
                                    <span className="font-mono text-[10px] text-slate-400 w-24 flex-shrink-0 truncate">{p.code}</span>
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-[11px] text-slate-700 truncate">{p.description}</span>
                                        <span className="block text-[9px] text-slate-400 uppercase truncate">
                                            {p.capitol}
                                            {p.measurements.length > 1 && (
                                                <span className="text-blue-500"> · {p.measurements.length} línies</span>
                                            )}
                                        </span>
                                    </span>
                                    <span className="font-mono text-[11px] text-slate-600 flex-shrink-0">
                                        {formatNumber(p.qty, 2)} <span className="text-slate-400">{p.unit}</span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {/* Pas 2: tota la partida o una línia */}
                {triada && (
                    <div className="overflow-auto flex-1 divide-y divide-slate-100">
                        <button
                            onClick={() => onPick(triada.code, null)}
                            className="w-full text-left p-3 hover:bg-emerald-50 transition-colors flex items-center gap-3 bg-emerald-50/40 touch-manipulation"
                        >
                            <Layers size={14} className="text-emerald-600 flex-shrink-0" />
                            <span className="flex-1 min-w-0">
                                <span className="block text-[11px] font-bold text-slate-700">Tota la partida</span>
                                <span className="block text-[9px] text-slate-400 uppercase">
                                    segueix el total, encara que hi afegeixis línies
                                </span>
                            </span>
                            <span className="font-mono text-[11px] font-bold text-emerald-700 flex-shrink-0">
                                {formatNumber(triada.qty, 2)} <span className="text-slate-400">{triada.unit}</span>
                            </span>
                        </button>

                        <div className="px-3 py-1.5 bg-slate-50 text-[9px] uppercase font-bold tracking-widest text-slate-400">
                            O bé una línia concreta
                        </div>

                        {liniesDe(triada).map(m => (
                            <button
                                key={m.id}
                                onClick={() => onPick(triada.code, m.id)}
                                className="w-full text-left p-3 hover:bg-blue-50 transition-colors flex items-center gap-3 touch-manipulation"
                            >
                                <span className="flex-1 min-w-0">
                                    <span className="block text-[11px] text-slate-700 truncate">
                                        {m.description || <span className="italic text-slate-400">sense descripció</span>}
                                    </span>
                                    <span className="block text-[9px] text-slate-400 font-mono truncate">
                                        {m.isIncrement
                                            ? `increment del ${formatNumber(m.units, 2)} %`
                                            : isRefLine(m)
                                                ? refLabel(m)
                                                : `${formatNumber(m.units, 2)} × ${formatNumber(m.length, 2)} × ${formatNumber(m.width, 2)} × ${formatNumber(m.height, 2)}`}
                                    </span>
                                </span>
                                <span className="font-mono text-[11px] text-slate-600 flex-shrink-0">
                                    {formatNumber(m.valor, 2)} <span className="text-slate-400">{triada.unit}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                )}

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
