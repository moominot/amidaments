import { useState, useMemo, useRef, useEffect } from 'react';
import { X, Search, Undo2, Ban, AlertTriangle } from 'lucide-react';
import { formatNumber, normalizeCode, getComponentCategory, getItemUnitPrice } from '../utils/calculations';
import { partidaDelProjecte, partidaDelBanc, mateixaUnitat } from '../utils/sistemes';

/**
 * Tria la partida que fa un paper d'un sistema constructiu (veure `utils/sistemes/`).
 *
 * Surten primer les partides del projecte —porten el seu descomposat— i després els conceptes
 * del banc de preus que no hi són, que valen el preu del concepte. Per defecte només es
 * mostren les de la unitat del paper: les línies que genera el sistema són en aquella unitat, i
 * posar-hi una partida en m3 on toca m2 donaria un import sense sentit.
 */
const TriaPartida = ({ paper, actual, perDefecte, chapters = [], priceDatabase = {}, onTria, onClose }) => {
    const [cerca, setCerca] = useState('');
    const [totes, setTotes] = useState(false);
    const camp = useRef(null);

    useEffect(() => {
        // Al mòbil el teclat tapa la meitat de la llista: només s'enfoca amb ratolí.
        if (window.matchMedia?.('(pointer: fine)').matches) camp.current?.focus();
    }, []);

    const opcions = useMemo(() => {
        const out = [];
        const vistos = new Set();
        const recull = (nodes) => nodes.forEach(n => {
            if (n.unit) {
                const codi = normalizeCode(n.code);
                if (!vistos.has(codi)) {
                    vistos.add(codi);
                    out.push({
                        codi, code: n.code, description: n.description || '', unit: n.unit, origen: 'projecte',
                        preu: getItemUnitPrice(n, priceDatabase), node: n,
                    });
                }
                return;   // els fills d'una partida són els seus components
            }
            recull([...(n.subChapters || []), ...(n.items || [])]);
        });
        recull(chapters);
        Object.entries(priceDatabase).forEach(([codi, d]) => {
            if (!codi || vistos.has(codi) || !d?.unit || d.unit === '%') return;
            if (getComponentCategory(codi) !== 'directCost') return;   // mà d'obra, materials, maquinària
            vistos.add(codi);
            out.push({ codi, code: d.code || codi, description: d.summary || '', unit: d.unit, origen: 'banc', preu: Number(d.price) || 0 });
        });
        return out;
    }, [chapters, priceDatabase]);

    const visibles = useMemo(() => {
        const t = cerca.trim().toLowerCase();
        return opcions
            .filter(o => totes || mateixaUnitat(o.unit, paper.unitat))
            .filter(o => !t || o.code.toLowerCase().includes(t) || o.description.toLowerCase().includes(t))
            .slice(0, 300);
    }, [opcions, cerca, totes, paper.unitat]);

    const tria = (o) => onTria(o.origen === 'projecte'
        ? partidaDelProjecte(o.node, priceDatabase)
        : partidaDelBanc(o.codi, priceDatabase));

    const codiActual = actual ? normalizeCode(actual.partida.code) : null;

    return (
        <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-8">
            <div className="bg-white shadow-2xl border border-slate-300 w-full max-w-2xl h-full md:h-auto md:max-h-full flex flex-col animate-in zoom-in-95 duration-200">
                <div className="bg-slate-950 text-white p-4 flex items-center justify-between flex-shrink-0">
                    <div className="min-w-0">
                        <h3 className="font-bold uppercase tracking-widest text-xs truncate">{paper.nom}</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                            Tria la partida · el sistema l&apos;amida en <span className="font-mono text-slate-200">{paper.unitat}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="hover:text-red-400 transition-colors p-2 -m-2 touch-manipulation flex-shrink-0" title="Tanca">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-3 border-b border-slate-200 flex flex-col sm:flex-row gap-2 flex-shrink-0">
                    <button
                        onClick={() => onTria(undefined)}
                        className="flex-1 min-w-0 flex items-center gap-2 border border-slate-200 hover:border-blue-400 hover:bg-blue-50 px-3 py-2 text-left touch-manipulation"
                    >
                        <Undo2 size={14} className="text-slate-400 flex-shrink-0" />
                        <span className="min-w-0">
                            <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400">La del sistema</span>
                            <span className="block text-[11px] truncate">
                                <span className="font-mono text-slate-500">{perDefecte.partida.code}</span> {perDefecte.partida.description}
                            </span>
                        </span>
                    </button>
                    <button
                        onClick={() => onTria(null)}
                        className="flex items-center justify-center gap-2 border border-slate-200 hover:border-red-300 hover:bg-red-50 hover:text-red-700 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 touch-manipulation"
                    >
                        <Ban size={14} /> Sense partida
                    </button>
                </div>

                <div className="p-3 border-b border-slate-200 flex items-center gap-3 flex-shrink-0">
                    <div className="flex-1 flex items-center gap-2 border border-slate-200 px-2 focus-within:border-blue-500">
                        <Search size={14} className="text-slate-400" />
                        <input
                            ref={camp}
                            value={cerca}
                            onChange={e => setCerca(e.target.value)}
                            placeholder="Cerca per codi o descripció"
                            className="flex-1 min-w-0 py-2 text-xs outline-none bg-transparent"
                        />
                    </div>
                    <label className="flex items-center gap-1.5 text-[10px] text-slate-500 whitespace-nowrap cursor-pointer select-none touch-manipulation py-2">
                        <input type="checkbox" checked={totes} onChange={e => setTotes(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                        Totes les unitats
                    </label>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto">
                    {visibles.length === 0 ? (
                        <div className="p-8 text-center text-xs text-slate-400">
                            {opcions.length === 0
                                ? 'El projecte no té cap partida ni el banc cap concepte.'
                                : `Cap partida en ${paper.unitat}${cerca ? ' amb aquesta cerca' : ''}.`}
                            {!totes && opcions.length > 0 && (
                                <button onClick={() => setTotes(true)} className="block mx-auto mt-2 text-blue-600 font-bold touch-manipulation">Mostra totes les unitats</button>
                            )}
                        </div>
                    ) : visibles.map(o => {
                        const unitatDiferent = !mateixaUnitat(o.unit, paper.unitat);
                        const esActual = o.codi === codiActual;
                        return (
                            <button
                                key={o.codi}
                                onClick={() => tria(o)}
                                className={`w-full flex items-start gap-3 px-3 py-2.5 border-b border-slate-100 text-left hover:bg-blue-50 touch-manipulation ${esActual ? 'bg-blue-50' : ''}`}
                            >
                                <span className={`mt-0.5 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 flex-shrink-0 ${o.origen === 'projecte' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                                    {o.origen === 'projecte' ? 'Projecte' : 'Banc'}
                                </span>
                                <span className="flex-1 min-w-0">
                                    <span className="block font-mono text-[10px] text-slate-500">{o.code}</span>
                                    <span className="block text-[11px] text-slate-700 leading-snug">{o.description}</span>
                                </span>
                                <span className="text-right flex-shrink-0">
                                    <span className="block font-mono text-[11px]">{formatNumber(o.preu)}</span>
                                    <span className={`flex items-center justify-end gap-1 font-mono text-[10px] ${unitatDiferent ? 'text-amber-600' : 'text-slate-400'}`}>
                                        {unitatDiferent && <AlertTriangle size={10} />}€/{o.unit}
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default TriaPartida;
