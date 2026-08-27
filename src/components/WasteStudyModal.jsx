import { useState, useMemo } from 'react';
import { X, Recycle, FileDown, Info } from 'lucide-react';
import NumberInput from './NumberInput';
import { formatNumber } from '../utils/calculations';
import { buildWasteStudy, tarifesBuides } from '../utils/wasteStudy';

/**
 * Paràmetres de l'estudi de gestió de residus abans de generar-lo.
 *
 * Dues coses que el càlcul no pot saber:
 *
 *   · Les dades administratives de l'obra (emplaçament, promotor, autor), que van a la
 *     portada i al peu de signatura.
 *   · Les **tarifes del gestor**, que són l'apartat 7 del RD 105/2008. No s'hi posen valors
 *     per defecte a propòsit: inventar-se un preu de gestió i que acabi a un projecte visat
 *     seria pitjor que deixar l'apartat pendent, i el document ho diu quan no n'hi ha cap.
 *
 * Només es demana tarifa de les fraccions que el projecte realment genera.
 */
const WasteStudyModal = ({ summary, onGenerate, onClose }) => {
    const [dades, setDades] = useState({ emplacament: '', promotor: '', autor: '', lloc: '' });
    const [tarifes, setTarifes] = useState(tarifesBuides);
    const [totes, setTotes] = useState('');

    const study = useMemo(() => buildWasteStudy(summary, tarifes), [summary, tarifes]);

    const posaATotes = (valor) => {
        setTotes(valor);
        const n = Number(valor) || 0;
        setTarifes(prev => Object.fromEntries(Object.keys(prev).map(k => [k, n])));
    };

    const camp = (clau, etiqueta, placeholder) => (
        <label className="block">
            <span className="block text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-1">{etiqueta}</span>
            <input
                value={dades[clau]}
                onChange={e => setDades(d => ({ ...d, [clau]: e.target.value }))}
                placeholder={placeholder}
                className="w-full px-3 py-2.5 border border-slate-200 text-xs focus:border-emerald-500 outline-none"
            />
        </label>
    );

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-md p-2 md:p-8">
            <div className="bg-white shadow-2xl border border-slate-300 w-full max-w-3xl max-h-full flex flex-col animate-in zoom-in-95 duration-200">
                <div className="bg-slate-900 text-white p-4 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="bg-emerald-600 p-1.5 flex-shrink-0"><Recycle size={16} /></div>
                        <div className="min-w-0">
                            <h3 className="font-bold uppercase tracking-widest text-xs truncate">Estudi de gestió de residus</h3>
                            <p className="text-[10px] text-slate-400 mt-0.5 truncate">RD 105/2008, article 4.1.a)</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="hover:text-red-400 transition-colors p-2 -m-2 touch-manipulation flex-shrink-0">
                        <X size={18} />
                    </button>
                </div>

                <div className="overflow-auto flex-1 p-4 md:p-6 space-y-6">
                    <section>
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-700 mb-3">Dades de l&apos;obra</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {camp('emplacament', 'Emplaçament', 'Carrer, número, municipi')}
                            {camp('promotor', 'Promotor', 'Nom del promotor')}
                            {camp('autor', 'Autor del projecte', 'Nom i titulació')}
                            {camp('lloc', 'Lloc de signatura', 'Palma')}
                        </div>
                        <p className="text-[10px] text-slate-400 italic mt-2">
                            Es poden deixar en blanc: els apartats que no tenen dades no surten al document.
                        </p>
                    </section>

                    <section>
                        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
                            <div>
                                <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-700">Tarifes de gestió</h4>
                                <p className="text-[10px] text-slate-400 mt-0.5">Euros per tona, segons el gestor autoritzat</p>
                            </div>
                            <label className="flex items-center gap-2">
                                <span className="text-[9px] uppercase tracking-widest text-slate-500">Aplica a totes</span>
                                <NumberInput
                                    value={totes}
                                    onChange={posaATotes}
                                    className="w-24 px-2 py-2.5 md:py-1.5 border border-slate-200 text-xs text-right font-mono focus:border-emerald-500 outline-none"
                                    placeholder="0,00"
                                />
                            </label>
                        </div>

                        <div className="border border-slate-200 divide-y divide-slate-100">
                            {study.fraccions.map(f => (
                                <div key={f.id} className="flex items-center gap-3 p-2.5 hover:bg-slate-50">
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-[11px] text-slate-700 truncate">{f.nom}</span>
                                        <span className="block text-[9px] text-slate-400 font-mono">
                                            {formatNumber(f.tones, 3)} t · {formatNumber(f.volume, 2)} m³
                                            {f.calSeparar && <span className="text-red-500 ml-2 uppercase font-bold">separació obligatòria</span>}
                                        </span>
                                    </span>
                                    <NumberInput
                                        value={tarifes[f.id]}
                                        onChange={v => setTarifes(prev => ({ ...prev, [f.id]: v }))}
                                        className="w-24 px-2 py-2.5 md:py-1.5 border border-slate-200 text-xs text-right font-mono focus:border-emerald-500 outline-none flex-shrink-0"
                                        placeholder="0,00"
                                    />
                                    <span className="w-24 text-right text-[11px] font-mono text-slate-600 flex-shrink-0">
                                        {formatNumber(f.cost, 2)} €
                                    </span>
                                </div>
                            ))}
                        </div>

                        <div className="flex items-center justify-between mt-2 px-2.5">
                            <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Cost previst de la gestió</span>
                            <span className="font-mono text-sm font-bold text-emerald-700">{formatNumber(study.totals.cost, 2)} €</span>
                        </div>

                        {!study.valorada && (
                            <p className="flex items-start gap-2 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 p-2.5 mt-3 leading-relaxed">
                                <Info size={13} className="flex-shrink-0 mt-0.5" />
                                <span>
                                    Sense tarifes, l&apos;apartat 7 queda pendent i el document ho fa constar. No s&apos;hi posen
                                    valors per defecte a propòsit: un preu de gestió inventat en un projecte visat seria pitjor
                                    que un apartat obertament incomplet.
                                </span>
                            </p>
                        )}
                    </section>
                </div>

                <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 flex-shrink-0">
                    <p className="text-[10px] text-slate-400 italic leading-tight hidden md:block">
                        El redactat dels apartats 2, 3, 5 i 6 és estàndard i s&apos;ha de revisar per al projecte.
                    </p>
                    <div className="flex gap-2 ml-auto">
                        <button
                            onClick={onClose}
                            className="bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-colors touch-manipulation"
                        >
                            Cancel·lar
                        </button>
                        <button
                            onClick={() => onGenerate({ dades, tarifes, study })}
                            className="bg-emerald-600 text-white hover:bg-emerald-500 px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 touch-manipulation"
                        >
                            <FileDown size={13} /> Generar PDF
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WasteStudyModal;
