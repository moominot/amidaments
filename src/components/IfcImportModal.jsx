import { useState, useMemo } from 'react';
import { X, Box, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { muntaPressupost, UNITATS } from '../utils/ifc/pressupost';
import { formatNumber } from '../utils/calculations';

/**
 * Importació d'un model IFC (veure `utils/ifc/` i `docs/ifc.md`).
 *
 * Es veu què entrarà abans d'inserir-ho: les classes IFC (amb la unitat en què s'amida cada una),
 * com s'agrupen en capítols i les quantitats que no quadren amb la geometria, amb la tria de
 * quin valor es vol. Les partides entren a preu 0, al final del pressupost.
 */
const total = (p) => p.measurements.reduce((s, m) => s + (m.units || 0) * (m.length || 1) * (m.width || 1) * (m.height || 1), 0);

const IfcImportModal = ({ nom, model, onInsereix, onTanca }) => {
    const [classes, setClasses] = useState({});
    const [capitols, setCapitols] = useState('classe');
    const [usa, setUsa] = useState({});

    const r = useMemo(() => muntaPressupost(model, { classes, capitols, usa }), [model, classes, capitols, usa]);
    const partides = useMemo(() => r.chapters.flatMap(c => c.items), [r]);
    const sospitosos = r.avisos.filter(a => a.sospitos);
    const altres = r.avisos.filter(a => !a.sospitos);

    const canvia = (classe, camps) => setClasses(prev => ({ ...prev, [classe]: { ...prev[classe], ...camps } }));

    const insereix = () => onInsereix(r, `IFC importat: ${partides.length} partides, ${r.total} línies d'amidament`);

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-md p-0 md:p-8">
            <div role="dialog" aria-label="Importa un model IFC" className="bg-white w-full h-full md:h-auto md:max-h-full md:max-w-3xl flex flex-col shadow-2xl">
                <div className="flex items-center gap-2 px-4 py-3 bg-slate-950 text-white flex-shrink-0">
                    <Box size={16} className="text-blue-400" />
                    <div className="min-w-0 flex-1">
                        <div className="text-xs font-black uppercase tracking-widest">Importa un model IFC</div>
                        <div className="text-[10px] text-slate-400 truncate">
                            {nom}{model.info.esquema ? ` · ${model.info.esquema}` : ''}{model.info.programa ? ` · ${model.info.programa}` : ''}
                        </div>
                    </div>
                    <button onClick={onTanca} className="p-2 -m-1 text-slate-400 hover:text-white touch-manipulation" aria-label="Tanca"><X size={16} /></button>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0">
                    {model.avisos.length > 0 && (
                        <ul className="p-3 border-b border-slate-100 space-y-1">
                            {model.avisos.map((a, i) => (
                                <li key={i} className="flex items-start gap-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1.5">
                                    <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" /><span>{a}</span>
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className="p-4 border-b border-slate-100">
                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Classes del model</div>
                        <div className="space-y-1">
                            {r.classes.map(c => (
                                <div key={c.classe} className="flex items-center gap-2 py-0.5 text-[11px]">
                                    <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer touch-manipulation">
                                        <input
                                            type="checkbox" checked={c.inclou} disabled={c.exclosa}
                                            onChange={e => canvia(c.classe, { inclou: e.target.checked })}
                                            className="accent-blue-600"
                                        />
                                        <span className={`truncate ${c.inclou ? '' : 'text-slate-400'}`}>
                                            {c.coneguda ? c.capitol : <span className="font-mono">{c.classe.replace(/^IFC/, '')}</span>}
                                            {c.coneguda && <span className="font-mono text-slate-400"> {c.classe.replace(/^IFC/, '')}</span>}
                                            {!c.coneguda && !c.exclosa && <span className="text-slate-400"> · sense regla</span>}
                                            {c.exclosa && <span className="text-slate-400"> · no és element d&apos;obra</span>}
                                        </span>
                                    </label>
                                    <span className="font-mono text-slate-400 w-8 text-right">{c.n}</span>
                                    <select
                                        value={c.unitat} disabled={!c.inclou}
                                        onChange={e => canvia(c.classe, { unitat: e.target.value })}
                                        className="w-16 border border-slate-200 px-1 py-1 text-[11px] font-mono bg-white outline-none focus:border-blue-500 disabled:opacity-40"
                                        aria-label={`Unitat de ${c.classe}`}
                                    >
                                        {UNITATS.map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </div>
                            ))}
                        </div>
                        <fieldset className="mt-3">
                            <legend className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Capítols</legend>
                            {[['classe', 'Un per classe (murs, lloses, pilars…)'], ['unic', `Un de sol: «${model.info.projecte.nom || 'Model IFC'}»`]].map(([id, text]) => (
                                <label key={id} className="flex items-center gap-2 py-1 text-xs cursor-pointer touch-manipulation">
                                    <input type="radio" name="capitols-ifc" checked={capitols === id} onChange={() => setCapitols(id)} className="accent-blue-600" />
                                    {text}
                                </label>
                            ))}
                        </fieldset>
                    </div>

                    {sospitosos.length > 0 && (
                        <div className="p-4 border-b border-slate-100">
                            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Quantitats que no quadren amb la geometria</div>
                            <ul className="space-y-1.5">
                                {sospitosos.map(a => (
                                    <li key={a.guid} className="text-[11px] bg-amber-50 border border-amber-200 px-2 py-1.5">
                                        <div className="flex items-start gap-1.5 text-amber-900">
                                            <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                                            <span><span className="font-bold">{a.nom || a.classe}</span>: {a.text}</span>
                                        </div>
                                        <div className="mt-1 ml-[18px] flex gap-3">
                                            {[['geometria', 'Geometria'], ['qto', 'Declarat al model']].map(([v, t]) => (
                                                <label key={v} className="flex items-center gap-1 cursor-pointer touch-manipulation">
                                                    <input
                                                        type="radio" name={`usa-${a.guid}`}
                                                        checked={(usa[a.guid] || (a.origen === 'geometria' ? 'geometria' : 'qto')) === v}
                                                        onChange={() => setUsa(prev => ({ ...prev, [a.guid]: v }))}
                                                        className="accent-blue-600"
                                                    />{t}
                                                </label>
                                            ))}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="p-4">
                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">
                            Partides que entraran ({partides.length}) · {r.total} línies
                        </div>
                        {partides.length === 0 ? (
                            <p className="text-[11px] text-slate-500">Cap element amb les classes triades i quantitats utilitzables.</p>
                        ) : (
                            <div className="border border-slate-100 divide-y divide-slate-100">
                                {r.chapters.map(c => (
                                    <div key={c.id}>
                                        <div className="px-2 py-1 bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500">{c.description}</div>
                                        {c.items.map(p => (
                                            <div key={p.id} className="flex items-baseline gap-2 px-2 py-1 text-[11px]">
                                                <span className="font-mono text-slate-400 w-20 flex-shrink-0">{p.code}</span>
                                                <span className="flex-1 min-w-0 truncate">{p.description}</span>
                                                <span className="font-mono text-slate-400">{p.measurements.length}×</span>
                                                <span className="font-mono font-bold text-right w-20">{formatNumber(total(p))}</span>
                                                <span className="font-mono text-slate-400 w-6">{p.unit}</span>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )}
                        {(altres.length > 0 || r.excloses.length > 0) && (
                            <details className="mt-3 text-[11px] text-slate-500">
                                <summary className="cursor-pointer touch-manipulation">{r.excloses.length} elements sense quantitat, {altres.length} avisos</summary>
                                <ul className="mt-1 space-y-0.5">
                                    {r.excloses.map(x => <li key={x.guid}>{x.nom || x.classe}: {x.motiu}</li>)}
                                    {altres.map(a => <li key={a.guid}>{a.nom || a.classe}: {a.text}</li>)}
                                </ul>
                            </details>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3 px-4 py-3 border-t border-slate-200 flex-shrink-0">
                    <span className="flex-1 text-[10px] text-slate-400">Les partides entren a preu 0.</span>
                    <button onClick={onTanca} className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 touch-manipulation">Cancel·la</button>
                    <button
                        onClick={insereix} disabled={partides.length === 0}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-bold disabled:opacity-40 hover:bg-blue-700 touch-manipulation"
                    >
                        <CheckCircle2 size={14} /> Insereix
                    </button>
                </div>
            </div>
        </div>
    );
};

export default IfcImportModal;
