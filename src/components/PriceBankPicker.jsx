import { useState, useMemo, useRef, useEffect } from 'react';
import { X, Database, Search, Plus } from 'lucide-react';
import { formatCurrency, normalizeCode, getComponentCategory } from '../utils/calculations';

/**
 * Tria d'un concepte del banc de preus del projecte.
 *
 * El banc s'omple sol amb tot el que entra per un BC3 —materials, mà d'obra, maquinària i les
 * partides senceres—, de manera que un cop importada una partida de CYPE ja hi ha centenars de
 * conceptes amb preu per reaprofitar. Fins ara només es podien mirar; això els fa servibles des
 * de tres llocs: el descomposat d'una partida, la creació d'una partida nova i els residus.
 *
 * `filtre` deixa que qui el crida en restringeixi el contingut (per exemple, només mà d'obra i
 * materials per a un descomposat, o només partides per crear-ne una de nova).
 */
const CATEGORIES = [
    { id: 'tots', nom: 'Tots' },
    { id: 'material', nom: 'Materials' },
    { id: 'labor', nom: 'Mà d\'obra' },
    { id: 'machinery', nom: 'Maquinària' },
];

const PriceBankPicker = ({
    priceDatabase = {},
    titol = 'Banc de preus',
    subtitol = 'Tria un concepte del projecte',
    filtre,
    onPick,
    onClose,
    onCrearNou,
}) => {
    const [cerca, setCerca] = useState('');
    const [categoria, setCategoria] = useState('tots');
    const camp = useRef(null);

    useEffect(() => { camp.current?.focus(); }, []);

    const conceptes = useMemo(() => {
        const out = [];
        Object.entries(priceDatabase).forEach(([code, data]) => {
            if (!code) return;
            const concepte = {
                code: data.code || code,
                norm: normalizeCode(code),
                description: data.summary || '',
                unit: data.unit || '',
                price: Number(data.price) || 0,
                categoria: getComponentCategory(code),
            };
            if (filtre && !filtre(concepte)) return;
            out.push(concepte);
        });
        return out.sort((a, b) => a.norm.localeCompare(b.norm));
    }, [priceDatabase, filtre]);

    const visibles = useMemo(() => {
        const t = cerca.trim().toLowerCase();
        return conceptes
            .filter(c => categoria === 'tots' || c.categoria === categoria)
            .filter(c => !t || c.code.toLowerCase().includes(t) || c.description.toLowerCase().includes(t))
            // Una llista de milers de files no aporta res: si no es troba, val més afinar la cerca.
            .slice(0, 300);
    }, [conceptes, cerca, categoria]);

    return (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/60 backdrop-blur-md p-2 md:p-8">
            <div className="bg-white shadow-2xl border border-slate-300 w-full max-w-2xl max-h-full flex flex-col animate-in zoom-in-95 duration-200">
                <div className="bg-slate-900 text-white p-4 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="bg-blue-600 p-1.5 flex-shrink-0"><Database size={16} /></div>
                        <div className="min-w-0">
                            <h3 className="font-bold uppercase tracking-widest text-xs truncate">{titol}</h3>
                            <p className="text-[10px] text-slate-400 mt-0.5 truncate">{subtitol}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="hover:text-red-400 transition-colors p-2 -m-2 touch-manipulation flex-shrink-0">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-3 border-b border-slate-200 flex-shrink-0 space-y-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                        <input
                            ref={camp}
                            value={cerca}
                            onChange={e => setCerca(e.target.value)}
                            placeholder="Cerca per codi o descripció..."
                            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 text-xs focus:border-blue-500 outline-none"
                        />
                    </div>
                    <div className="flex gap-1 overflow-x-auto no-scrollbar">
                        {CATEGORIES.map(c => (
                            <button
                                key={c.id}
                                onClick={() => setCategoria(c.id)}
                                className={`px-3 py-2 md:py-1 text-[9px] font-bold uppercase tracking-widest whitespace-nowrap transition-colors touch-manipulation ${
                                    categoria === c.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                }`}
                            >
                                {c.nom}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="overflow-auto flex-1 divide-y divide-slate-100">
                    {visibles.length === 0 && (
                        <div className="p-12 text-center">
                            <Database size={36} className="mx-auto text-slate-200 mb-3" />
                            <p className="text-xs text-slate-400 italic">
                                {conceptes.length === 0
                                    ? 'El banc de preus és buit. S\'omple important un BC3.'
                                    : 'Cap concepte no coincideix amb la cerca.'}
                            </p>
                        </div>
                    )}
                    {visibles.map(c => (
                        <button
                            key={c.norm}
                            onClick={() => onPick(c)}
                            className="w-full text-left p-3 hover:bg-blue-50 transition-colors flex items-center gap-3 touch-manipulation"
                        >
                            <span className="font-mono text-[10px] text-slate-400 w-24 flex-shrink-0 truncate">{c.code}</span>
                            <span className="flex-1 min-w-0">
                                <span className="block text-[11px] text-slate-700 line-clamp-2">{c.description}</span>
                            </span>
                            <span className="font-mono text-[11px] text-slate-600 flex-shrink-0 text-right">
                                {formatCurrency(c.price)}
                                <span className="block text-[9px] text-slate-400">{c.unit || '—'}</span>
                            </span>
                        </button>
                    ))}
                </div>

                <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 flex-shrink-0">
                    <p className="text-[10px] text-slate-400 italic hidden md:block">
                        {conceptes.length} conceptes al banc{visibles.length < conceptes.length && `, ${visibles.length} a la llista`}
                    </p>
                    <div className="flex gap-2 ml-auto">
                        {onCrearNou && (
                            <button
                                onClick={onCrearNou}
                                className="bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 touch-manipulation"
                            >
                                <Plus size={13} /> En blanc
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="bg-slate-800 text-white hover:bg-slate-700 px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-colors touch-manipulation"
                        >
                            Cancel·lar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PriceBankPicker;
