import { useState, useMemo, useRef } from 'react';
import {
    X, Blocks, ArrowLeft, Upload, Download, Trash2, Pencil, Save, AlertCircle, CheckCircle2, Link as LinkIcon, ChevronRight,
} from 'lucide-react';
import FormulaInput from './FormulaInput';
import { formatCurrency, formatNumber } from '../utils/calculations';
import { resumLimits } from '../utils/parametres';
import { referencies } from '../utils/formules';
import {
    llegeixDocument, parametresADemanar, instancia, previsualitza, nomInstanciaLliure, projecteDeDocument,
} from '../utils/sistemesDoc';
import { llistaSistemes, llegeixSistema, desaSistema, esborraSistema } from '../utils/galeriaSistemes';
import { serialitzaProjecte, EXTENSIO_PROJECTE, MIME_PROJECTE } from '../utils/projectFile';
import { baixaFitxer } from '../utils/baixa';

/**
 * Sistemes constructius: galeria, inserció i desar (veure `utils/sistemesDoc.js`).
 *
 * Tres vistes:
 * - **galeria**: els sistemes desats en aquest navegador, i importar-ne un de fitxer;
 * - **paràmetres**: el sistema triat, amb els paràmetres que declara per omplir. Si el
 *   projecte ja en té un amb el mateix nom, per defecte es fa servir aquest. El total es veu
 *   en viu;
 * - **desa**: el projecte actual (o la instància filtrada, `docADesar`) a la galeria o a fitxer.
 */
const SistemesModal = ({
    budget, priceDatabase, destiLabel, vistaInicial = 'galeria', docADesar = null,
    onInsereix, onObreEditar, onClose, notify,
}) => {
    const [vista, setVista] = useState(vistaInicial);
    const [galeria, setGaleria] = useState(() => llistaSistemes());
    const [triat, setTriat] = useState(null);           // { doc, id }
    const fitxer = useRef(null);

    const obre = (id) => {
        const doc = llegeixSistema(id);
        if (!doc) { notify('Aquest sistema ja no hi és', 'error'); setGaleria(llistaSistemes()); return; }
        setTriat({ doc, id });
        setVista('parametres');
    };

    const importa = async (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        let doc = null;
        try { doc = llegeixDocument(JSON.parse(await f.text())); } catch { doc = null; }
        if (!doc) { notify('Aquest fitxer no és cap sistema ni cap projecte', 'error'); return; }
        setTriat({ doc, id: null });
        setVista('parametres');
    };

    const exporta = (doc) => {
        const { budget: b, priceDatabase: p } = projecteDeDocument(doc);
        baixaFitxer(serialitzaProjecte(b, p), doc.nom, EXTENSIO_PROJECTE, MIME_PROJECTE);
    };

    const esborra = (s) => {
        if (!confirm(`Esborrar «${s.nom}» de la galeria d'aquest navegador?`)) return;
        esborraSistema(s.id);
        setGaleria(llistaSistemes());
    };

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-md p-0 md:p-8">
            <div className="bg-white shadow-2xl border border-slate-300 w-full max-w-4xl h-full md:h-auto md:max-h-full flex flex-col animate-in zoom-in-95 duration-200">
                <div className="bg-slate-950 text-white p-4 flex items-center gap-3 flex-shrink-0">
                    {vista !== 'galeria' && (
                        <button onClick={() => setVista('galeria')} className="p-2 -m-2 hover:text-blue-300 touch-manipulation" title="Torna a la galeria">
                            <ArrowLeft size={18} />
                        </button>
                    )}
                    <div className="bg-blue-600 p-1.5 flex-shrink-0"><Blocks size={16} /></div>
                    <div className="min-w-0 flex-1">
                        <h3 className="font-bold uppercase tracking-widest text-xs truncate">
                            {vista === 'galeria' ? 'Sistemes constructius' : vista === 'desa' ? 'Desa com a sistema' : triat?.doc.nom}
                        </h3>
                        <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                            {vista === 'galeria' && 'Documents d\'amidament amb paràmetres, per reaprofitar entre obres'}
                            {vista === 'parametres' && 'Omple els paràmetres i insereix-lo al projecte'}
                            {vista === 'desa' && 'Amb els paràmetres i les fórmules de les línies'}
                        </p>
                    </div>
                    <button onClick={onClose} className="hover:text-red-400 transition-colors p-2 -m-2 touch-manipulation" title="Tanca">
                        <X size={18} />
                    </button>
                </div>

                {vista === 'galeria' && (
                    <div className="flex-1 min-h-0 overflow-y-auto">
                        <div className="p-3 border-b border-slate-200 flex flex-wrap gap-2">
                            <button
                                onClick={() => setVista('desa')}
                                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 text-[10px] font-bold uppercase tracking-widest touch-manipulation"
                            >
                                <Save size={13} /> Desa aquest projecte com a sistema
                            </button>
                            <button
                                onClick={() => fitxer.current?.click()}
                                className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-2 text-[10px] font-bold uppercase tracking-widest touch-manipulation"
                            >
                                <Upload size={13} /> Des d&apos;un fitxer
                            </button>
                            <input ref={fitxer} type="file" accept=".amid,.json" className="hidden" onChange={importa} />
                        </div>
                        {galeria.length === 0 && (
                            <div className="p-4 text-[11px] text-slate-500 leading-relaxed space-y-2">
                                <p>Encara no hi ha cap sistema a la galeria.</p>
                                <p>
                                    Un sistema és un projecte amb paràmetres: fes l&apos;amidament d&apos;un detall constructiu amb
                                    fórmules a les línies (<span className="font-mono">L*H</span>, <span className="font-mono">2*L+A</span>…),
                                    desa&apos;l com a sistema i el podràs inserir en altres obres omplint només els paràmetres.
                                    També en pots obrir un des d&apos;un fitxer {EXTENSIO_PROJECTE}.
                                </p>
                            </div>
                        )}
                        {galeria.map(s => (
                            <div key={s.id} className="flex items-stretch border-b border-slate-100 hover:bg-blue-50/40">
                                <button onClick={() => obre(s.id)} className="flex-1 min-w-0 text-left p-3 touch-manipulation">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-slate-800 truncate">{s.nom}</span>
                                        <span className="text-[10px] text-violet-600 font-mono whitespace-nowrap">{s.nParametres} paràm.</span>
                                    </div>
                                    {s.descripcio && <p className="text-[11px] text-slate-500 leading-snug mt-0.5">{s.descripcio}</p>}
                                </button>
                                <div className="flex items-center gap-0.5 pr-2">
                                    <button onClick={() => onObreEditar(llegeixSistema(s.id), s.id)} className="p-2 text-slate-400 hover:text-blue-600 touch-manipulation" title="Obre'l com a projecte per editar-lo">
                                        <Pencil size={14} />
                                    </button>
                                    <button onClick={() => exporta(llegeixSistema(s.id))} className="p-2 text-slate-400 hover:text-blue-600 touch-manipulation" title={`Exporta'l a un fitxer ${EXTENSIO_PROJECTE}`}>
                                        <Download size={14} />
                                    </button>
                                    <button onClick={() => esborra(s)} className="p-2 text-slate-400 hover:text-red-600 touch-manipulation" title="Esborra'l de la galeria">
                                        <Trash2 size={14} />
                                    </button>
                                    <ChevronRight size={14} className="text-slate-300 hidden sm:block" />
                                </div>
                            </div>
                        ))}
                        <p className="p-3 text-[10px] text-slate-400 leading-relaxed">
                            Els sistemes desats es queden en aquest navegador. Per conservar-los o passar-los a un altre ordinador,
                            exporta&apos;ls a fitxer: és un {EXTENSIO_PROJECTE} normal, que també es pot obrir com a projecte.
                        </p>
                    </div>
                )}

                {vista === 'parametres' && triat && (
                    <VistaParametres
                        doc={triat.doc}
                        budget={budget}
                        priceDatabase={priceDatabase}
                        destiLabel={destiLabel}
                        onInsereix={onInsereix}
                        // Un sistema obert de fitxer encara no és a la galeria: s'hi pot desar.
                        onDesa={triat.id ? null : () => {
                            const r = desaSistema(triat.doc);
                            if (!r.ok) { notify(r.error, 'error'); return; }
                            setTriat({ ...triat, id: r.id });
                            setGaleria(llistaSistemes());
                            notify(`«${triat.doc.nom}» desat a la galeria`);
                        }}
                    />
                )}

                {vista === 'desa' && (
                    <VistaDesa
                        budget={budget}
                        priceDatabase={priceDatabase}
                        docADesar={docADesar}
                        onExporta={exporta}
                        onDesat={(nom) => { setGaleria(llistaSistemes()); notify(`«${nom}» desat a la galeria`); setVista('galeria'); }}
                        notify={notify}
                    />
                )}
            </div>
        </div>
    );
};

/** Omplir els paràmetres d'un sistema i inserir-lo. */
const VistaParametres = ({ doc, budget, priceDatabase, destiLabel, onInsereix, onDesa }) => {
    const parametresProjecte = useMemo(() => budget.parametres || [], [budget.parametres]);
    const demanats = useMemo(() => parametresADemanar(doc, parametresProjecte), [doc, parametresProjecte]);
    const [nomInstancia, setNomInstancia] = useState(() => nomInstanciaLliure(doc.nom, budget.sistemes || []));
    const [aLArrel, setALArrel] = useState(true);
    const [ometZero, setOmetZero] = useState(false);
    // Per defecte es fa servir el paràmetre del projecte amb el mateix nom si és del projecte
    // (una «alçada de planta» comuna), però no si és d'una altra instància: la segona instància
    // d'un mateix sistema no ha de tenir per força les mides de la primera.
    const [respostes, setRespostes] = useState(() => new Map(
        demanats.filter(p => !p.derivat && p.existent && !p.existent.sistema).map(p => [p.nom, { enllaca: true }]),
    ));
    const canvia = (nom, r) => setRespostes(prev => { const m = new Map(prev); if (r) m.set(nom, r); else m.delete(nom); return m; });

    const opcions = useMemo(() => ({ respostes, nomInstancia, parametresProjecte, ometZero, id: 'previsualitzacio' }),
        [respostes, nomInstancia, parametresProjecte, ometZero]);
    const vista = useMemo(() => previsualitza(doc, opcions, priceDatabase), [doc, opcions, priceDatabase]);

    const grups = useMemo(() => {
        const out = [];
        demanats.filter(p => !p.derivat).forEach(p => {
            let g = out.find(x => x.nom === (p.grup || ''));
            if (!g) { g = { nom: p.grup || '', ps: [] }; out.push(g); }
            g.ps.push(p);
        });
        return out;
    }, [demanats]);
    const derivats = demanats.filter(p => p.derivat);
    // Els paràmetres que surten a una condició que no es compleix: es marquen igual que els
    // que no compleixen els seus límits, perquè es vegi què s'ha de tocar.
    const implicats = useMemo(() => {
        const noms = new Set();
        vista.condicions.filter(c => !c.ok).forEach(c => referencies(c.expressio).forEach(n => noms.add(n)));
        return noms;
    }, [vista]);
    const primersAvisos = [
        ...vista.condicions.filter(c => !c.ok).map(c => c.missatge || c.error),
        ...[...vista.limitsPerNom.entries()].map(([nom, m]) => `${nom}: ${m[0].charAt(0).toLowerCase()}${m[0].slice(1)}`),
    ];

    const insereix = () => {
        const inst = instancia(doc, { respostes, nomInstancia: nomInstancia.trim() || doc.nom, parametresProjecte, ometZero });
        onInsereix(inst, { aLArrel });
    };

    return (
        <>
            <div className="flex-1 min-h-0 overflow-y-auto">
                {doc.descripcio && <p className="px-4 pt-3 text-[11px] text-slate-500 leading-snug">{doc.descripcio}</p>}
                <div className="p-4 grid sm:grid-cols-2 gap-3 border-b border-slate-100">
                    <label className="block">
                        <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Nom de la instància</span>
                        <input
                            value={nomInstancia}
                            onChange={e => setNomInstancia(e.target.value)}
                            className="w-full border border-slate-200 px-2 py-1.5 text-xs focus:border-blue-500 outline-none"
                        />
                        <span className="block text-[10px] text-slate-400 mt-1">Agrupa els seus paràmetres i permet filtrar-la després</span>
                    </label>
                    <div>
                        <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">On</span>
                        <label className="flex items-center gap-2 text-xs py-1 cursor-pointer touch-manipulation">
                            <input type="radio" checked={aLArrel} onChange={() => setALArrel(true)} className="accent-blue-600" />
                            A l&apos;arrel, amb els seus capítols
                        </label>
                        <label className={`flex items-center gap-2 text-xs py-1 touch-manipulation ${destiLabel ? 'cursor-pointer' : 'text-slate-300'}`}>
                            <input type="radio" disabled={!destiLabel} checked={!aLArrel} onChange={() => setALArrel(false)} className="accent-blue-600" />
                            {destiLabel ? <>Dins de <span className="font-bold truncate">{destiLabel}</span></> : 'Dins del capítol seleccionat (no n\'hi ha cap)'}
                        </label>
                    </div>
                    <label className="sm:col-span-2 flex items-start gap-2 text-xs cursor-pointer select-none touch-manipulation">
                        <input type="checkbox" checked={ometZero} onChange={e => setOmetZero(e.target.checked)} className="w-4 h-4 mt-0.5 accent-blue-600 flex-shrink-0" />
                        <span>
                            No insereixis les partides que surten a zero
                            {ometZero && vista.omeses.length > 0 && (
                                <span className="text-slate-500"> · se&apos;n deixen fora {vista.omeses.length}: <span className="font-mono">{vista.omeses.map(o => o.code).join(', ')}</span></span>
                            )}
                            <span className="block text-[10px] text-slate-400 mt-0.5">
                                Per a sistemes amb variants. Si després canvies un paràmetre, les partides que no s&apos;han inserit no apareixeran: caldrà tornar a inserir el sistema.
                            </span>
                        </span>
                    </label>
                </div>

                {vista.condicions.length > 0 && (
                    <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Condicions</div>
                        {vista.condicions.map(c => (
                            <div key={c.id} className={`flex items-start gap-1.5 text-[11px] py-0.5 ${c.ok ? 'text-slate-500' : 'text-red-600'}`}>
                                {c.ok ? <CheckCircle2 size={12} className="mt-0.5 flex-shrink-0 text-emerald-600" /> : <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />}
                                <span>
                                    {c.ok ? (c.missatge || c.expressio) : (c.error ? `Error a la condició «${c.expressio}»: ${c.error}` : c.missatge)}
                                    <span className="ml-1.5 font-mono text-[10px] text-slate-400">{c.expressio}</span>
                                </span>
                            </div>
                        ))}
                    </div>
                )}
                {grups.length === 0 && (
                    <p className="p-4 text-xs text-slate-500">Aquest sistema no té paràmetres: s&apos;insereix tal com és.</p>
                )}
                {grups.map(g => (
                    <fieldset key={g.nom || '—'} className="px-4 py-3 border-b border-slate-100">
                        <legend className="sr-only">{g.nom || 'General'}</legend>
                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">{g.nom || 'General'}</div>
                        <div className="space-y-2">
                            {g.ps.map(p => {
                                const r = respostes.get(p.nom);
                                const enllacat = !!r?.enllaca && !!p.existent;
                                const limits = resumLimits(p);
                                const incompliments = vista.limitsPerNom.get(p.nom);
                                const enCondicio = implicats.has(p.nom);
                                return (
                                    <div key={p.nom} className="flex items-start gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[11px] text-slate-700 leading-tight">
                                                <span className="font-mono font-bold text-violet-700 mr-1.5">{p.nom}</span>
                                                {p.descripcio}
                                                {limits && <span className="ml-1.5 text-[10px] font-mono text-slate-400 whitespace-nowrap">{limits}</span>}
                                            </div>
                                            {incompliments && incompliments.map(m => (
                                                <div key={m} className="flex items-center gap-1 mt-0.5 text-[10px] text-red-600">
                                                    <AlertCircle size={10} className="flex-shrink-0" />{m}
                                                </div>
                                            ))}
                                            {p.existent && (
                                                <label className="flex items-center gap-1.5 mt-1 text-[10px] text-blue-700 cursor-pointer select-none touch-manipulation">
                                                    <input
                                                        type="checkbox"
                                                        checked={enllacat}
                                                        onChange={e => canvia(p.nom, e.target.checked ? { enllaca: true } : null)}
                                                        className="w-3.5 h-3.5 accent-blue-600"
                                                    />
                                                    <LinkIcon size={10} />
                                                    Fes servir {p.existent.grup ? `el de «${p.existent.grup}»` : 'el del projecte'} ({p.existent.formula ? `= ${p.existent.formula}` : formatNumber(p.existent.valor, 2)} {p.existent.unitat || ''})
                                                </label>
                                            )}
                                        </div>
                                        {enllacat ? (
                                            <span className="w-24 text-right text-[11px] font-mono text-blue-700 py-1.5">{p.nom}</span>
                                        ) : (
                                            <FormulaInput
                                                value={r && 'valor' in r ? r.valor : p.valor}
                                                formula={r && 'formula' in r ? r.formula : undefined}
                                                teclatText={parametresProjecte.length > 0}
                                                onChange={(e) => canvia(p.nom, e)}
                                                className={`w-24 border px-2 py-1.5 text-xs font-mono text-right focus:border-blue-500 outline-none ${incompliments || enCondicio ? 'border-red-400' : 'border-slate-200'}`}
                                                aria-label={`Valor de ${p.nom}`}
                                            />
                                        )}
                                        <span className="w-6 pt-2 text-[10px] text-slate-400 font-mono">{p.unitat}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </fieldset>
                ))}
                {derivats.length > 0 && (
                    <div className="px-4 py-3 text-[10px] text-slate-500">
                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Calculats pel sistema</div>
                        {derivats.map(p => (
                            <div key={p.nom}><span className="font-mono text-violet-700">{p.nom} = {p.formula}</span> {p.descripcio && `· ${p.descripcio}`}</div>
                        ))}
                    </div>
                )}
            </div>

            <div className="border-t border-slate-200 p-3 md:p-4 flex flex-col sm:flex-row sm:items-center gap-3 flex-shrink-0 bg-white">
                <div className="flex-1 min-w-0 text-[11px] text-slate-500 leading-snug">
                    {vista.incomplertes > 0 ? (
                        <span className="flex items-center gap-1.5 text-red-600">
                            <AlertCircle size={13} className="flex-shrink-0" />
                            <span>
                                {primersAvisos.slice(0, 2).join(' · ')}
                                {primersAvisos.length > 2 && ` · i ${primersAvisos.length - 2} més`}
                            </span>
                        </span>
                    ) : vista.liniesAmbError > 0 || vista.errorsParametres.size > 0 ? (
                        <span className="flex items-center gap-1.5 text-red-600">
                            <AlertCircle size={13} className="flex-shrink-0" />
                            {vista.errorsParametres.size > 0 && `${vista.errorsParametres.size} paràmetres amb error. `}
                            {vista.liniesAmbError > 0 && `${vista.liniesAmbError} línies amb error de fórmula (comptaran 0).`}
                        </span>
                    ) : (
                        <>Els seus paràmetres aniran a la barra de l&apos;esquerra, al grup <span className="font-bold text-slate-700">{nomInstancia}</span>. Si alguna partida ja és al projecte, et preguntarà si hi afegeixes les línies.</>
                    )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                    {onDesa && (
                        <button onClick={onDesa} className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:bg-slate-100 touch-manipulation" title="Desa'l a la galeria d'aquest navegador">
                            <Save size={13} className="inline -mt-0.5 mr-1" />Galeria
                        </button>
                    )}
                    <button
                        onClick={insereix}
                        disabled={vista.incomplertes > 0}
                        className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest touch-manipulation"
                    >
                        Insereix · <span className="font-mono">{formatCurrency(vista.total)}</span>
                    </button>
                </div>
            </div>
        </>
    );
};

/** Desar el projecte (o una instància extreta) com a sistema. */
const VistaDesa = ({ budget, priceDatabase, docADesar, onExporta, onDesat, notify }) => {
    const origen = budget.sistemaGaleria || null;   // { id, nom } si s'ha obert un sistema per editar-lo
    const [nom, setNom] = useState(docADesar?.nom || origen?.nom || budget.name || 'Sistema');
    const [descripcio, setDescripcio] = useState(docADesar?.descripcio || budget.descripcioSistema || '');
    const [substitueix, setSubstitueix] = useState(!!origen && !docADesar);

    const doc = () => {
        if (docADesar) return { ...docADesar, nom: nom.trim() || docADesar.nom, descripcio: descripcio.trim() };
        return llegeixDocument({ budget: { ...budget, name: nom.trim() || budget.name, descripcioSistema: descripcio }, priceDatabase });
    };
    const nParams = docADesar ? docADesar.parametres.length : (budget.parametres || []).length;

    const desa = () => {
        const d = doc();
        const r = desaSistema(d, substitueix ? origen.id : null);
        if (!r.ok) { notify(r.error, 'error'); return; }
        onDesat(d.nom);
    };

    return (
        <>
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                <label className="block">
                    <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Nom</span>
                    <input value={nom} onChange={e => setNom(e.target.value)} className="w-full border border-slate-200 px-2 py-1.5 text-xs focus:border-blue-500 outline-none" />
                </label>
                <label className="block">
                    <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Descripció</span>
                    <textarea value={descripcio} onChange={e => setDescripcio(e.target.value)} rows={3} className="w-full border border-slate-200 px-2 py-1.5 text-xs focus:border-blue-500 outline-none resize-none" placeholder="Què és, què inclou i com s'han de prendre les mides" />
                </label>
                {origen && !docADesar && (
                    <label className="flex items-center gap-2 text-xs cursor-pointer touch-manipulation">
                        <input type="checkbox" checked={substitueix} onChange={e => setSubstitueix(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                        Substitueix «{origen.nom}» a la galeria (si no, se&apos;n desa un de nou)
                    </label>
                )}
                <div className={`text-[11px] leading-snug p-3 border ${nParams ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                    {nParams
                        ? `${docADesar ? 'La instància' : 'El projecte'} té ${nParams} paràmetres. En inserir el sistema es demanaran tots els que no són una fórmula d'altres.`
                        : 'No hi ha cap paràmetre: el sistema s\'inserirà sempre igual. Afegeix-ne a la barra de paràmetres i fes-los servir a les línies perquè es pugui adaptar a cada obra.'}
                </div>
            </div>
            <div className="border-t border-slate-200 p-3 md:p-4 flex flex-wrap justify-end gap-2 flex-shrink-0 bg-white">
                <button onClick={() => onExporta(doc())} className="flex items-center gap-2 border border-slate-200 hover:bg-slate-50 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-600 touch-manipulation">
                    <Download size={13} /> Exporta a fitxer
                </button>
                <button onClick={desa} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest touch-manipulation">
                    <Save size={13} /> Desa a la galeria
                </button>
            </div>
        </>
    );
};

export default SistemesModal;
