import { useState, useMemo, useEffect } from 'react';
import { X, Blocks, RefreshCw, AlertCircle, AlertTriangle, CheckCircle2, Trash2, RotateCcw } from 'lucide-react';
import NumberInput from './NumberInput';
import Esquema from './Esquema';
import { formatCurrency, formatNumber } from '../utils/calculations';
import { llistaSistemes, llegeixSistema } from '../utils/galeriaSistemes';
import { previsualitza } from '../utils/sistemesDoc';
import { CAMPS_PLANTILLA, esPlantilla } from '../utils/plantilles';
import {
    FONTS, MODES, magnituds, agrupaEntitats, modePerDefecte, assignacioPerDefecte, valorsDeZona, respostesDeZona,
    muntaInstancies, actualitzaDesDeCad, entitatsLliures,
} from '../utils/cadSistemes';

/**
 * Entitats copiades de l'AutoCAD → un sistema per zona (veure `utils/cadSistemes.js`).
 *
 * S'obre en enganxar la sortida del LISP sense cap partida seleccionada. Primer, si alguna
 * entitat ja és d'una zona del projecte, proposa actualitzar-ne els paràmetres amb les mides
 * noves (el vincle amb el dibuix). Amb la resta: triar el sistema, com s'agrupen en zones (pel
 * rètol de dins, una per entitat, totes juntes o per capa), d'on surt cada paràmetre (àrea,
 * perímetre...) i, a la taula, el nom i els valors de cada zona abans d'inserir-les totes.
 */
const CLAU_SISTEMA = 'amidaments:cad-sistema';
const clauAssignacio = (id) => `amidaments:cad-assignacio:${id}`;
const llegeix = (clau) => { try { return localStorage.getItem(clau); } catch { return null; } };
const desa = (clau, v) => { try { localStorage.setItem(clau, v); } catch { /* res */ } };

const teVariables = (nodes = []) => nodes.some(n => CAMPS_PLANTILLA.some(c => esPlantilla(n[c]))
    || (n.breakdown || []).some(b => b.formulaRendiment)
    || teVariables([...(n.subChapters || []), ...(n.items || [])]));

const CadSistemaModal = ({ dades, budget, priceDatabase, onInsereix, onActualitza, onTanca }) => {
    const totes = dades.entities;
    // Primer, el vincle: les entitats que ja són d'una zona del projecte.
    const vincle = useMemo(() => actualitzaDesDeCad(budget, totes), [budget, totes]);
    const [actualitzat, setActualitzat] = useState(false);

    const galeria = useMemo(() => llistaSistemes(), []);
    const [idSistema, setIdSistema] = useState(() => {
        const desat = llegeix(CLAU_SISTEMA);
        return galeria.some(s => s.id === desat) ? desat : galeria[0]?.id || '';
    });
    const doc = useMemo(() => (idSistema ? llegeixSistema(idSistema) : null), [idSistema]);
    // Per a zones noves, les entitats que no són encara de cap zona d'aquest sistema: la mateixa
    // polilínia pot servir per a un altre sistema (paviment i fals sostre de la mateixa sala).
    const entitats = useMemo(
        () => (doc ? entitatsLliures(budget.sistemes || [], totes, { idGaleria: idSistema, nomSistema: doc.nom }) : totes),
        [doc, idSistema, budget.sistemes, totes],
    );
    const jaDelSistema = totes.length - entitats.length;
    const demanats = useMemo(() => (doc?.parametres || []).filter(p => !p.formula), [doc]);

    // Amb totes les enganxades: les lliures depenen del sistema triat i poden ser cap.
    const [mode, setMode] = useState(() => modePerDefecte(totes));
    const [assignacio, setAssignacio] = useState({});
    // Els paràmetres en m² entre els quals no s'ha sabut triar l'àrea, i els que s'han triat a mà
    // (només aquests es recorden per al sistema: la resta s'intueix cada vegada).
    const [ambiguA, setAmbiguA] = useState([]);
    const [tocats, setTocats] = useState({});
    const [comuns, setComuns] = useState({});
    useEffect(() => {
        if (!doc) return;
        let desada = {};
        try { desada = JSON.parse(llegeix(clauAssignacio(idSistema)) || '{}'); } catch { desada = {}; }
        const perDefecte = assignacioPerDefecte(demanats);
        setAssignacio(Object.fromEntries(demanats.map(p => [p.nom, desada[p.nom] || perDefecte.assignacio[p.nom]])));
        setAmbiguA(Object.values(desada).includes('area') ? [] : perDefecte.ambiguA);
        setTocats(Object.fromEntries(demanats.filter(p => desada[p.nom]).map(p => [p.nom, desada[p.nom]])));
        setComuns(Object.fromEntries(demanats.map(p => [p.nom, p.valor ?? 0])));
    }, [doc, demanats, idSistema]);

    // Zones i el que s'hi ha editat a mà (nom i valors), per posició.
    const zonesBase = useMemo(() => agrupaEntitats(entitats, mode), [entitats, mode]);
    const [edicions, setEdicions] = useState({});
    // Zones descartades (per la posició a `zonesBase`): no s'insereixen. Un canvi d'agrupació
    // torna a començar.
    const [descartades, setDescartades] = useState(() => new Set());
    useEffect(() => { setEdicions({}); setDescartades(new Set()); }, [zonesBase]);
    const zones = useMemo(() => zonesBase.map((z, i) => ({
        ...z,
        pos: i,
        nom: edicions[i]?.nom ?? z.nom,
        valors: { ...valorsDeZona(z, assignacio), ...(edicions[i]?.valors || {}) },
    })).filter(z => !descartades.has(z.pos)), [zonesBase, edicions, assignacio, descartades]);
    const descarta = (pos) => setDescartades(prev => new Set([...prev, pos]));
    const edita = (i, canvi) => setEdicions(prev => ({
        ...prev,
        [i]: { ...prev[i], ...canvi, valors: { ...(prev[i]?.valors || {}), ...(canvi.valors || {}) } },
    }));

    const delCad = demanats.filter(p => assignacio[p.nom] && assignacio[p.nom] !== 'sistema');
    const comunsActius = useMemo(
        () => Object.fromEntries(demanats.filter(p => (assignacio[p.nom] || 'sistema') === 'sistema').map(p => [p.nom, comuns[p.nom]])),
        [demanats, assignacio, comuns],
    );

    // Total i condicions de cada zona, com si s'inserís sola.
    const previs = useMemo(() => {
        if (!doc) return [];
        return zones.map(z => {
            try {
                return previsualitza(doc, {
                    respostes: respostesDeZona(z, assignacio, comunsActius),
                    nomInstancia: z.nom,
                    parametresProjecte: budget.parametres || [],
                    liniaZona: true,
                    id: 'previsualitzacio',
                }, priceDatabase);
            } catch {
                return null;
            }
        });
    }, [doc, zones, assignacio, comunsActius, budget.parametres, priceDatabase]);
    const total = previs.reduce((s, p) => s + (p?.total || 0), 0);
    const ambIncompliments = previs.filter(p => p?.incomplertes > 0).length;

    const insereix = () => {
        if (!doc || !zones.length) return;
        desa(CLAU_SISTEMA, idSistema);
        desa(clauAssignacio(idSistema), JSON.stringify(tocats));
        const r = muntaInstancies(doc, zones, {
            assignacio, comuns: comunsActius,
            parametresProjecte: budget.parametres || [],
            sistemesProjecte: budget.sistemes || [],
            idGaleria: idSistema, dibuix: dades.drawing,
        });
        onInsereix(r, `${zones.length} ${zones.length === 1 ? 'zona' : 'zones'} de «${doc.nom}» des del CAD`);
    };

    const nTancades = entitats.filter(e => e.closed).length;
    const nTrames = entitats.filter(e => e.type === 'HATCH').length;

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-md p-0 md:p-8">
            <div className="bg-white shadow-2xl border border-slate-300 w-full max-w-4xl h-full md:h-auto md:max-h-full flex flex-col animate-in zoom-in-95 duration-200">
                <div className="bg-slate-950 text-white p-4 flex items-center gap-3 flex-shrink-0">
                    <div className="bg-blue-600 p-1.5 flex-shrink-0"><Blocks size={16} /></div>
                    <div className="min-w-0 flex-1">
                        <h3 className="font-bold uppercase tracking-widest text-xs truncate">Del CAD a un sistema</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                            {totes.length} entitats{dades.drawing ? ` de ${dades.drawing}` : ''} · una instància del sistema per zona
                        </p>
                    </div>
                    <button onClick={onTanca} className="hover:text-red-400 transition-colors p-2 -m-2 touch-manipulation" title="Tanca">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto">
                    {/* El vincle: zones que ja surten d'aquestes entitats. */}
                    {vincle.vinculades.length > 0 && (
                        <div className="p-4 border-b border-slate-200 bg-violet-50/60 text-[11px] text-slate-700 space-y-2">
                            <p>
                                <b>{totes.length - vincle.noves.length}</b> d&apos;aquestes entitats ja són de {vincle.vinculades.length === 1 ? 'la zona' : 'les zones'}{' '}
                                <b>{vincle.vinculadesAmbSistema.map(v => (v.sistema ? `${v.nom} (${v.sistema})` : v.nom)).join(', ')}</b>.
                                {vincle.incompletes.length > 0 && <> Falten entitats de <b>{vincle.incompletes.join(', ')}</b>: es compta amb les que hi ha.</>}
                            </p>
                            {actualitzat ? (
                                <p className="flex items-center gap-1.5 text-emerald-700"><CheckCircle2 size={13} /> Actualitzades.</p>
                            ) : vincle.canvis.length === 0 ? (
                                <p className="flex items-center gap-1.5 text-slate-500"><CheckCircle2 size={13} /> Ja estan al dia amb el dibuix.</p>
                            ) : (
                                <>
                                    <ul className="font-mono text-[10px] space-y-0.5">
                                        {vincle.canvis.map((c, i) => (
                                            <li key={i}>{c.instancia} · {c.parametre}: {typeof c.abans === 'number' ? formatNumber(c.abans, 2) : c.abans} → <b>{formatNumber(c.despres, 2)}</b></li>
                                        ))}
                                    </ul>
                                    <button
                                        onClick={() => { onActualitza(vincle.budget, vincle.canvis); setActualitzat(true); }}
                                        className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white px-3 py-2 text-[10px] font-bold uppercase tracking-widest touch-manipulation"
                                    >
                                        <RefreshCw size={12} /> Actualitza-les amb les mides noves
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {galeria.length === 0 ? (
                        <p className="p-4 text-xs text-slate-500 leading-relaxed">
                            No hi ha cap sistema a la galeria. Desa&apos;n un (Sistema › Desa aquest projecte com a sistema) o, per afegir les
                            entitats com a línies, selecciona una partida i torna a enganxar.
                        </p>
                    ) : (
                        <>
                            <div className="p-4 grid md:grid-cols-2 gap-4 border-b border-slate-100">
                                <div className="space-y-3">
                                    <label className="block">
                                        <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Sistema</span>
                                        <select
                                            value={idSistema}
                                            onChange={e => setIdSistema(e.target.value)}
                                            className="w-full border border-slate-200 px-2 py-1.5 text-xs focus:border-blue-500 outline-none bg-white"
                                            aria-label="Sistema"
                                        >
                                            {galeria.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
                                        </select>
                                    </label>
                                    <p className="text-[10px] text-slate-400">
                                        {entitats.length} entitats per a aquest sistema: {nTancades} tancades{nTrames ? ` (${nTrames} ${nTrames === 1 ? 'trama' : 'trames'}, amb l'àrea neta de les illes)` : ''}, {entitats.length - nTancades} obertes.
                                        {jaDelSistema > 0 && ` ${jaDelSistema} ja són de zones d'aquest sistema i no es tornen a posar.`}
                                    </p>
                                    {doc?.esquema && <Esquema esquema={doc.esquema} className="max-h-40" titol={`Esquema de ${doc.nom}`} />}
                                </div>
                                <fieldset>
                                    <legend className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Com s&apos;agrupen en zones</legend>
                                    {MODES.map(m => (
                                        <label key={m.id} className="flex items-start gap-2 py-1 text-xs cursor-pointer touch-manipulation">
                                            <input type="radio" name="mode-cad" checked={mode === m.id} onChange={() => setMode(m.id)} className="mt-0.5 accent-blue-600" />
                                            <span>{m.nom}<span className="block text-[10px] text-slate-400">{m.descripcio}</span></span>
                                        </label>
                                    ))}
                                </fieldset>
                            </div>

                            {doc && (
                                <div className="p-4 border-b border-slate-100">
                                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">D&apos;on surt cada paràmetre</div>
                                    {/* Sense cap paràmetre del CAD, totes les zones serien iguals: es diu ben clar. */}
                                    {ambiguA.length > 1 && !Object.values(assignacio).includes('area') ? (
                                        <p className="mb-2 flex items-start gap-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1.5">
                                            <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                                            <span>Hi ha {ambiguA.length} paràmetres en m² (<span className="font-mono">{ambiguA.join(', ')}</span>): tria quin és l&apos;àrea de la zona.</span>
                                        </p>
                                    ) : delCad.length === 0 && demanats.length > 0 && (
                                        <p className="mb-2 flex items-start gap-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1.5">
                                            <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                                            <span>Cap paràmetre surt del CAD: totes les zones tindran els valors del sistema. Tria a quin paràmetre va l&apos;àrea (o el perímetre).</span>
                                        </p>
                                    )}
                                    <div className="space-y-1.5">
                                        {demanats.map(p => {
                                            const font = assignacio[p.nom] || 'sistema';
                                            return (
                                                // La descripció ocupa tot l'espai que queda i, si no hi cap, salta de línia:
                                                // retallada, «Superfície t…» no deia quin paràmetre era.
                                                <div key={p.nom} className="flex flex-col sm:flex-row sm:items-center gap-x-3 gap-y-1 py-0.5">
                                                    <span className="sm:flex-1 min-w-0 text-[11px] leading-snug">
                                                        <span className="font-mono font-bold text-violet-700">{p.nom}</span>{' '}
                                                        <span className="text-slate-500">{p.descripcio}</span>
                                                    </span>
                                                    <span className="flex items-center gap-2 flex-shrink-0">
                                                    <select
                                                        value={font}
                                                        onChange={e => {
                                                            const v = e.target.value;
                                                            setAssignacio(prev => ({ ...prev, [p.nom]: v }));
                                                            setTocats(prev => ({ ...prev, [p.nom]: v }));
                                                            if (v === 'area') setAmbiguA([]);
                                                        }}
                                                        className="w-40 border border-slate-200 px-1.5 py-1 text-[11px] outline-none focus:border-blue-500 bg-white"
                                                        aria-label={`D'on surt ${p.nom}`}
                                                    >
                                                        {FONTS.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                                                    </select>
                                                    {/* Amplada fixa, també buida: així les columnes queden alineades. */}
                                                    <span className="flex items-center gap-1 w-44">
                                                        {font === 'sistema' && (
                                                            <>
                                                                <NumberInput
                                                                    value={comuns[p.nom] ?? 0}
                                                                    onChange={v => setComuns(prev => ({ ...prev, [p.nom]: v }))}
                                                                    className="w-20 border border-slate-200 px-1.5 py-1 text-[11px] font-mono text-right outline-none focus:border-blue-500"
                                                                    aria-label={`Valor de ${p.nom} per a totes les zones`}
                                                                />
                                                                <span className="text-[10px] text-slate-400 font-mono">{p.unitat}</span>
                                                                <span className="text-[10px] text-slate-400 whitespace-nowrap">per a totes</span>
                                                            </>
                                                        )}
                                                    </span>
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {teVariables(doc.chapters) && (
                                        <p className="mt-2 flex items-start gap-1.5 text-[10px] text-amber-700">
                                            <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
                                            Alguna partida té el text o el preu variables: com que les zones la comparteixen, agafarà els de la primera zona.
                                        </p>
                                    )}
                                </div>
                            )}

                            {doc && (
                                <div className="p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Zones · {zones.length}</span>
                                        {descartades.size > 0 && (
                                            <button
                                                onClick={() => setDescartades(new Set())}
                                                className="ml-auto flex items-center gap-1 text-[10px] text-blue-600 hover:underline touch-manipulation py-1"
                                            >
                                                <RotateCcw size={11} /> {descartades.size} {descartades.size === 1 ? 'descartada' : 'descartades'}: recupera-les
                                            </button>
                                        )}
                                    </div>
                                    {zones.length === 0 && (
                                        <p className="text-[11px] text-slate-500">
                                            {entitats.length === 0
                                                ? 'Totes aquestes entitats ja són de zones d\'aquest sistema: tria\'n un altre, o actualitza-les a dalt si has canviat el dibuix.'
                                                : 'Les has descartades totes: no s\'inserirà res.'}
                                        </p>
                                    )}
                                    <div className="space-y-2">
                                        {zones.map((z, i) => {
                                            const pv = previs[i];
                                            const m = magnituds(z.entitats);
                                            return (
                                                <div key={z.pos} className={`border px-2 py-2 ${pv?.incomplertes ? 'border-red-300 bg-red-50/40' : 'border-slate-200'}`}>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            value={z.nom}
                                                            onChange={e => edita(z.pos, { nom: e.target.value })}
                                                            className="flex-1 min-w-0 border border-slate-200 px-2 py-1 text-xs font-bold outline-none focus:border-blue-500"
                                                            aria-label="Nom de la zona"
                                                        />
                                                        <span className="text-[11px] font-mono font-bold text-slate-700 whitespace-nowrap">{pv ? formatCurrency(pv.total) : '—'}</span>
                                                        <button
                                                            onClick={() => descarta(z.pos)}
                                                            className="text-slate-400 hover:text-red-600 p-1.5 -m-1 touch-manipulation flex-shrink-0"
                                                            title={`Descarta «${z.nom}»: no s'inserirà`}
                                                            aria-label={`Descarta ${z.nom}`}
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                                                        {delCad.map(p => (
                                                            <label key={p.nom} className="flex items-center gap-1 text-[10px]">
                                                                <span className="font-mono font-bold text-violet-700">{p.nom}</span>
                                                                <NumberInput
                                                                    value={z.valors[p.nom] ?? 0}
                                                                    onChange={v => edita(z.pos, { valors: { [p.nom]: v } })}
                                                                    className="w-20 border border-slate-200 px-1.5 py-0.5 text-[11px] font-mono text-right outline-none focus:border-blue-500"
                                                                    aria-label={`${p.nom} de ${z.nom}`}
                                                                />
                                                                <span className="text-slate-400 font-mono">{p.unitat}</span>
                                                            </label>
                                                        ))}
                                                        <span className="text-[10px] text-slate-400 font-mono ml-auto">
                                                            {z.entitats.length} ent. · {formatNumber(m.area, 2)} m² · {formatNumber(m.perimetre, 2)} m
                                                        </span>
                                                    </div>
                                                    {pv?.incomplertes > 0 && (
                                                        <p className="mt-1 flex items-center gap-1 text-[10px] text-red-600">
                                                            <AlertCircle size={10} />
                                                            {[...pv.condicions.filter(c => !c.ok).map(c => c.missatge || c.expressio), ...[...pv.limitsPerNom.entries()].map(([n, ms]) => `${n}: ${ms[0]}`)].join(' · ')}
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="border-t border-slate-200 p-3 md:p-4 flex flex-col sm:flex-row sm:items-center gap-3 flex-shrink-0 bg-white">
                    <div className="flex-1 min-w-0 text-[11px] text-slate-500 leading-snug">
                        {ambIncompliments > 0
                            ? <span className="text-red-600">{ambIncompliments} {ambIncompliments === 1 ? 'zona no compleix' : 'zones no compleixen'} les condicions del sistema.</span>
                            : doc && zones.length > 0
                                ? <>Cada zona tindrà els seus paràmetres i el seu nom a les línies de cada partida; recordarà de quines entitats surt per poder-la actualitzar.</>
                                : null}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                        <button onClick={onTanca} className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:bg-slate-100 touch-manipulation">
                            {actualitzat && !entitats.length ? 'Fet' : 'Tanca'}
                        </button>
                        {doc && zones.length > 0 && (
                            <button
                                onClick={insereix}
                                disabled={ambIncompliments > 0}
                                className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest touch-manipulation"
                            >
                                Insereix {zones.length} · <span className="font-mono">{formatCurrency(total)}</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CadSistemaModal;
