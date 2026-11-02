import { useState, useMemo, useRef } from 'react';
import { X, Languages, Square } from 'lucide-react';
import { IDIOMES_TRADUCCIO, recullTextos, aplicaTraduccions, estimaTokens } from '../utils/traduccio';
import { llegeixClau, desaClau, llegeixPref, PREF_MODEL } from '../utils/assistent/clau';
import { MODELS, ESFORCOS, MODEL_PER_DEFECTE, model as infoModel, costUs } from '../utils/assistent/models';

/**
 * Traduir el projecte sencer o un capítol o una partida (veure `docs/traduccio.md`).
 *
 * Fa servir la mateixa clau de l'API que l'assistent. Les traduccions s'apliquen totes juntes
 * al final (també si s'atura a mitges, amb el que s'hagi fet), en un sol canvi que es pot
 * desfer.
 */
const IDIOMA_PREF = 'amidaments:traduccio-idioma';

const dolars = (v) => `${v.toLocaleString('ca-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;

const selectCls = 'w-full border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-violet-500 bg-white disabled:opacity-50 touch-manipulation';

const TraduccioModal = ({ abast, getEstat, aplicaEstat, onTanca, notify }) => {
    const idNode = abast?.id || null;
    const [clau, setClau] = useState(llegeixClau);
    const [valorClau, setValorClau] = useState('');
    const [idioma, setIdioma] = useState(() => llegeixPref(IDIOMA_PREF, 'ca'));
    const [linies, setLinies] = useState(true);
    const [idModel, setIdModel] = useState(() => infoModel(llegeixPref(PREF_MODEL, MODEL_PER_DEFECTE)).id);
    // Traduir no demana gaire raonament: per defecte, esforç baix.
    const [esforc, setEsforc] = useState('low');
    const [progres, setProgres] = useState(null);
    const [resultat, setResultat] = useState(null);
    const [error, setError] = useState(null);
    const [gastat, setGastat] = useState(0);
    const control = useRef(null);

    const textos = useMemo(() => recullTextos(getEstat(), { idNode, linies }), [idNode, linies]); // eslint-disable-line react-hooks/exhaustive-deps
    const estimacio = useMemo(() => {
        const e = estimaTokens(textos);
        return { ...e, cost: costUs({ input_tokens: e.entrada, output_tokens: e.sortida }, idModel) };
    }, [textos, idModel]);

    const treballant = !!progres && !resultat;

    const comenca = async (llista = textos) => {
        if (!llista.length || treballant) return;
        try { localStorage.setItem(IDIOMA_PREF, idioma); } catch { /* res */ }
        setError(null);
        setResultat(null);
        setGastat(0);
        setProgres({ fets: 0, total: 1 });
        const ctrl = new AbortController();
        control.current = ctrl;
        let api;
        try {
            api = await import('../utils/assistent/tradueixApi');
            const r = await api.tradueix({
                clau, textos: llista, idioma, model: idModel, esforc, signal: ctrl.signal,
                onProgres: (fets, total) => setProgres({ fets, total }),
                onUs: (u) => setGastat(g => g + costUs(u, idModel)),
            });
            if (r.mapa.size) aplicaEstat(aplicaTraduccions(getEstat(), r.mapa, { idNode, linies }));
            setResultat({
                traduits: r.mapa.size, pendents: r.pendents, aturat: ctrl.signal.aborted, errors: r.errors.length,
                primerError: r.errors[0]?.message || null,
                // Per tornar-ho a provar només amb el que falta: els originals encara són al projecte.
                pendentsLlista: llista.filter(t => !r.mapa.has(t)),
            });
            if (r.mapa.size) notify?.(`Traduïts ${r.mapa.size} textos`);
        } catch (err) {
            const A = api?.Anthropic;
            let missatge = err?.message || String(err);
            if (A && err instanceof A.AuthenticationError) { missatge = 'La clau no és vàlida. Torna-la a posar.'; desaClau(''); setClau(''); }
            else if (A && err instanceof A.RateLimitError) missatge = 'Massa peticions seguides: espera una mica i torna-ho a provar.';
            else if (A && err instanceof A.APIConnectionError) missatge = 'No s\'ha pogut connectar amb Anthropic. Mira la connexió.';
            setError(missatge);
            setProgres(null);
        } finally {
            control.current = null;
        }
    };

    const titol = idNode ? `${abast.codi || ''} ${abast.nom || ''}`.trim() : 'Tot el projecte';

    return (
        <div className="fixed inset-0 z-[150] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-8">
            <div className="bg-white shadow-2xl border border-slate-300 w-full max-w-md max-h-full flex flex-col animate-in zoom-in-95 duration-200">
                <div className="bg-slate-950 text-white px-4 py-3 flex items-center gap-3 flex-shrink-0">
                    <Languages size={16} className="text-violet-400" />
                    <div className="flex-1 min-w-0">
                        <h2 className="text-[11px] font-bold uppercase tracking-widest">Tradueix</h2>
                        <p className="text-[11px] text-slate-400 truncate">{titol}</p>
                    </div>
                    <button onClick={() => { control.current?.abort(); onTanca(); }} className="p-2 -m-2 hover:text-red-400 touch-manipulation" title="Tanca">
                        <X size={16} />
                    </button>
                </div>

                <div className="p-4 space-y-3 overflow-y-auto text-[11px] text-slate-600">
                    {!clau ? (
                        <form onSubmit={(e) => { e.preventDefault(); if (valorClau.trim()) { desaClau(valorClau.trim()); setClau(valorClau.trim()); } }} className="space-y-2">
                            <p>Per traduir es fa servir l&apos;API de Claude amb <b>la teva clau</b>, la mateixa de l&apos;assistent. Es desa només en aquest navegador.</p>
                            <div className="flex gap-2">
                                <input type="password" value={valorClau} onChange={e => setValorClau(e.target.value)} placeholder="sk-ant-..." autoComplete="off"
                                    className="flex-1 min-w-0 border border-slate-200 px-2 py-1.5 text-xs font-mono focus:border-violet-500 outline-none" aria-label="Clau de l'API d'Anthropic" />
                                <button type="submit" className="bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest touch-manipulation">Desa</button>
                            </div>
                        </form>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 gap-2">
                                <label className="space-y-1 col-span-2">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Idioma de destí</span>
                                    <select value={idioma} onChange={e => setIdioma(e.target.value)} disabled={treballant} className={selectCls} aria-label="Idioma de destí">
                                        {IDIOMES_TRADUCCIO.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}
                                    </select>
                                </label>
                                <label className="space-y-1">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Model</span>
                                    <select value={idModel} onChange={e => setIdModel(e.target.value)} disabled={treballant} className={selectCls} aria-label="Model">
                                        {MODELS.map(m => <option key={m.id} value={m.id}>{m.curt}</option>)}
                                    </select>
                                </label>
                                <label className="space-y-1">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Esforç</span>
                                    <select value={esforc} onChange={e => setEsforc(e.target.value)} disabled={treballant} className={selectCls} aria-label="Esforç">
                                        {ESFORCOS.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}
                                    </select>
                                </label>
                            </div>
                            <label className="flex items-center gap-2">
                                <input type="checkbox" checked={linies} onChange={e => setLinies(e.target.checked)} disabled={treballant} className="accent-violet-600" />
                                També la descripció de les línies d&apos;amidament
                            </label>
                            <p className="text-slate-500 leading-relaxed">
                                Es tradueixen les descripcions i els textos llargs, el descomposat i la base de preus
                                {idNode ? ' dels codis d\'aquí' : ', els paràmetres i les condicions'}. Codis, unitats, preus i fórmules no es toquen.
                                {idNode && ' Un material compartit amb altres partides es tradueix per a totes.'}
                            </p>
                            <div className="bg-slate-50 border border-slate-200 px-3 py-2 font-mono text-[10px] text-slate-500 flex justify-between gap-2">
                                <span>{textos.length} textos · {estimacio.caracters.toLocaleString('ca-ES')} caràcters</span>
                                <span title="Estimació orientativa; el raonament del model pot fer-la pujar">≈ {dolars(estimacio.cost)}</span>
                            </div>

                            {progres && !resultat && (
                                <div className="space-y-1">
                                    <div className="h-1.5 bg-slate-100 overflow-hidden">
                                        <div className="h-full bg-violet-500 transition-all" style={{ width: `${Math.round((progres.fets / Math.max(1, progres.total)) * 100)}%` }} />
                                    </div>
                                    <div className="text-[10px] text-violet-600 font-mono">Traduint… {progres.fets}/{progres.total} blocs · {dolars(gastat)}</div>
                                </div>
                            )}
                            {resultat && (
                                <div className={`border px-3 py-2 ${resultat.pendents ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                                    {resultat.traduits} textos traduïts{resultat.aturat ? ' abans d\'aturar' : ''}.
                                    {resultat.pendents > 0 && ` ${resultat.pendents} s'han quedat com estaven${resultat.primerError ? ` (${resultat.primerError})` : ''}.`}
                                    {' '}Cost ≈ {dolars(gastat)}. Es desfà d'un cop amb el botó de desfer (Ctrl+Z).
                                </div>
                            )}
                            {error && <div className="border border-red-200 bg-red-50 text-red-700 px-3 py-2">{error}</div>}
                        </>
                    )}
                </div>

                {clau && (
                    <div className="border-t border-slate-200 px-4 py-3 flex justify-end gap-2 flex-shrink-0">
                        {treballant ? (
                            <button onClick={() => control.current?.abort()} className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 text-[10px] font-bold uppercase tracking-widest touch-manipulation">
                                <Square size={12} /> Atura
                            </button>
                        ) : resultat ? (
                            <>
                                {resultat.pendentsLlista.length > 0 && (
                                    <button onClick={() => comenca(resultat.pendentsLlista)} className="border border-violet-300 text-violet-700 hover:bg-violet-50 px-4 py-2 text-[10px] font-bold uppercase tracking-widest touch-manipulation">
                                        Tradueix els que falten
                                    </button>
                                )}
                                <button onClick={onTanca} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 text-[10px] font-bold uppercase tracking-widest touch-manipulation">Fet</button>
                            </>
                        ) : (
                            <button onClick={() => comenca()} disabled={!textos.length} className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-300 text-white px-4 py-2 text-[10px] font-bold uppercase tracking-widest touch-manipulation">
                                <Languages size={12} /> Tradueix
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TraduccioModal;
