import { useState, useEffect, useMemo, useRef } from 'react';
import { X, Plus, Variable, Trash2, AlertCircle, AlertTriangle, CheckCircle2, SlidersHorizontal, ChevronDown, ChevronRight, Image as ImageIcon, Pencil } from 'lucide-react';
import FormulaInput from './FormulaInput';
import Esquema from './Esquema';
import { preparaEsquema, ACCEPTA_ESQUEMA } from '../utils/esquema';
import { esNomValid } from '../utils/formules';
import { resumLimits } from '../utils/parametres';
import { parseDecimal } from '../utils/decimal';

/**
 * Gestor de paràmetres del projecte (`budget.parametres`, veure `utils/parametres.js`).
 *
 * Els del projecte s'agrupen per `grup`. Els que entren amb un sistema (`p.sistema`) van a part,
 * en un bloc plegable per instància, amb l'esquema del sistema i les seves condicions (veure
 * `utils/sistemesDoc.js`). Al bloc del projecte hi ha l'esquema que s'emportarà el projecte si es
 * desa com a sistema. El valor pot
 * ser un número o una fórmula d'altres paràmetres. Canviar el nom reescriu totes les fórmules
 * que el fan servir; això ho fa qui crida `onReanomena`.
 *
 * A sota hi ha les **condicions**: els límits de cada paràmetre (mínim, màxim, enter) i les
 * condicions entre paràmetres (`P2>=P1`). Al projecte són avisos; en inserir un sistema, no
 * deixen inserir-lo fins que es compleixen.
 */
const NomInput = ({ p, ocupats, onReanomena, nou }) => {
    const [draft, setDraft] = useState(p.nom);
    const [error, setError] = useState(null);
    const camp = useRef(null);
    useEffect(() => { setDraft(p.nom); setError(null); }, [p.nom]);
    // Un paràmetre acabat d'afegir pot anar a parar a qualsevol grup: el focus diu on és.
    useEffect(() => { if (nou) { camp.current?.focus(); camp.current?.select(); } }, [nou]);

    const confirma = () => {
        const nou = draft.trim();
        if (nou === p.nom) { setError(null); return; }
        if (!esNomValid(nou)) { setError('Lletres, xifres i _; comença per lletra'); return; }
        if (ocupats.has(nou)) { setError('Ja hi ha un paràmetre amb aquest nom'); return; }
        setError(null);
        onReanomena(p.id, nou);
    };

    return (
        <div className="w-20 flex-shrink-0">
            <input
                ref={camp}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={confirma}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(p.nom); setError(null); } }}
                autoCapitalize="off"
                spellCheck={false}
                className={`w-full px-1.5 py-1 text-[11px] font-mono font-bold border outline-none focus:border-blue-500 ${error ? 'border-red-400 text-red-700' : 'border-slate-200 text-slate-800'}`}
                title={error || 'Nom per fer-lo servir a les fórmules'}
                aria-label="Nom del paràmetre"
            />
            {error && <div className="text-[9px] text-red-600 leading-tight mt-0.5">{error}</div>}
        </div>
    );
};

/**
 * Un límit (mínim o màxim) que es pot deixar buit. `NumberInput` no serveix: en buidar-lo torna
 * al darrer valor, i aquí buit vol dir «sense límit».
 */
const LimitInput = ({ valor, onCanvia, etiqueta }) => {
    const aText = (v) => (v === '' || v === null || v === undefined ? '' : String(v).replace('.', ','));
    const [draft, setDraft] = useState(aText(valor));
    useEffect(() => { setDraft(aText(valor)); }, [valor]);
    return (
        <label className="flex items-center gap-1 text-[10px] text-slate-500">
            {etiqueta}
            <input
                value={draft}
                inputMode="decimal"
                onChange={e => setDraft(e.target.value)}
                onBlur={() => {
                    const n = parseDecimal(draft);
                    if (draft.trim() === '' || n === null) { setDraft(''); onCanvia(''); } else onCanvia(n);
                }}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                placeholder="—"
                className="w-14 px-1.5 py-1 text-[11px] font-mono text-right border border-slate-200 outline-none focus:border-blue-500 bg-white"
                aria-label={etiqueta}
            />
        </label>
    );
};

const FilaParametre = ({ p, valor, error, avisos, usos, ocupats, nou, onCanvia, onReanomena, onEsborra }) => {
    const resum = resumLimits(p);
    const [obreLimits, setObreLimits] = useState(false);
    return (
        <div className={`px-3 py-2 border-b border-slate-100 group ${avisos ? 'bg-amber-50/60' : ''}`}>
            <div className="flex items-start gap-1.5">
                <NomInput p={p} ocupats={ocupats} onReanomena={onReanomena} nou={nou} />
                <span className="text-slate-300 text-[11px] py-1">=</span>
                <FormulaInput
                    value={p.formula ? valor : p.valor}
                    formula={p.formula || undefined}
                    error={error && p.formula ? error : undefined}
                    teclatText
                    onChange={(e) => onCanvia(p.id, 'valor' in e ? { valor: e.valor, formula: '' } : { formula: e.formula })}
                    className={`flex-1 min-w-0 px-1.5 py-1 text-[11px] font-mono text-right border outline-none focus:border-blue-500 bg-white ${avisos ? 'border-amber-400' : 'border-slate-200'}`}
                    aria-label={`Valor de ${p.nom}`}
                />
                <input
                    value={p.unitat || ''}
                    onChange={e => onCanvia(p.id, { unitat: e.target.value })}
                    placeholder="ut."
                    className="w-10 flex-shrink-0 px-1 py-1 text-[10px] font-mono text-slate-500 border border-transparent hover:border-slate-200 focus:border-blue-500 outline-none bg-transparent"
                    aria-label={`Unitat de ${p.nom}`}
                />
                <button
                    onClick={() => onEsborra(p.id)}
                    className="opacity-60 md:opacity-0 md:group-hover:opacity-100 text-slate-400 hover:text-red-500 p-1.5 -m-0.5 touch-manipulation flex-shrink-0"
                    title={`Esborra ${p.nom}`}
                >
                    <Trash2 size={12} />
                </button>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
                <input
                    value={p.descripcio || ''}
                    onChange={e => onCanvia(p.id, { descripcio: e.target.value })}
                    placeholder="Descripció"
                    className="flex-1 min-w-0 px-1.5 py-0.5 text-[10px] text-slate-500 border border-transparent hover:border-slate-200 focus:border-blue-500 outline-none bg-transparent"
                    aria-label={`Descripció de ${p.nom}`}
                />
                <input
                    value={p.grup || ''}
                    onChange={e => onCanvia(p.id, { grup: e.target.value })}
                    placeholder="Grup"
                    className="w-20 flex-shrink-0 px-1.5 py-0.5 text-[10px] text-slate-400 border border-transparent hover:border-slate-200 focus:border-blue-500 outline-none bg-transparent"
                    aria-label={`Grup de ${p.nom}`}
                />
            </div>
            {obreLimits && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 px-1.5 py-1.5 bg-slate-50 border border-slate-200">
                    <LimitInput etiqueta="Mín." valor={p.min} onCanvia={(v) => onCanvia(p.id, { min: v })} />
                    <LimitInput etiqueta="Màx." valor={p.max} onCanvia={(v) => onCanvia(p.id, { max: v })} />
                    <label className="flex items-center gap-1 text-[10px] text-slate-500 cursor-pointer select-none touch-manipulation py-1">
                        <input type="checkbox" checked={!!p.enter} onChange={e => onCanvia(p.id, { enter: e.target.checked })} className="w-3.5 h-3.5 accent-violet-600" />
                        Enter
                    </label>
                </div>
            )}
            {avisos && avisos.map(a => (
                <div key={a} className="flex items-center gap-1 mt-1 px-1.5 text-[10px] text-amber-700">
                    <AlertTriangle size={10} className="flex-shrink-0" />{a}
                </div>
            ))}
            <div className="flex items-center gap-2 mt-0.5 px-1.5 text-[9px]">
                {p.formula && !error && <span className="font-mono text-violet-600 truncate" title={p.formula}>= {p.formula}</span>}
                {error && <span className="flex items-center gap-1 text-red-600"><AlertCircle size={9} />{error}</span>}
                <button
                    onClick={() => setObreLimits(!obreLimits)}
                    className={`flex items-center gap-1 font-mono touch-manipulation py-0.5 ${resum ? 'text-violet-600' : 'text-slate-400 hover:text-violet-600'}`}
                    title="Límits del valor: mínim, màxim i si ha de ser enter"
                    aria-expanded={obreLimits}
                >
                    <SlidersHorizontal size={9} /> {resum || 'límits'}
                </button>
                <span className="ml-auto text-slate-400">{usos ? `${usos} ${usos === 1 ? 'ús' : 'usos'}` : 'sense ús'}</span>
            </div>
        </div>
    );
};

/** Una condició entre paràmetres: una fórmula que ha de donar cert i el missatge si no. */
const FilaCondicio = ({ c, estat, onCanvia, onEsborra }) => {
    const [expr, setExpr] = useState(c.expressio || '');
    useEffect(() => { setExpr(c.expressio || ''); }, [c.expressio]);
    const ok = estat?.ok;
    return (
        <div className={`px-3 py-2 border-b border-slate-100 group ${ok ? '' : 'bg-amber-50/60'}`}>
            <div className="flex items-start gap-1.5">
                <span className={`pt-1 flex-shrink-0 ${ok ? 'text-emerald-600' : 'text-amber-600'}`} title={ok ? 'Es compleix' : 'No es compleix'}>
                    {ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                </span>
                <input
                    value={expr}
                    onChange={e => setExpr(e.target.value)}
                    onBlur={() => { if (expr !== c.expressio) onCanvia(c.id, { expressio: expr.trim() }); }}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    autoCapitalize="off"
                    spellCheck={false}
                    placeholder="P2>=P1"
                    className="flex-1 min-w-0 px-1.5 py-1 text-[11px] font-mono border border-slate-200 outline-none focus:border-blue-500 bg-white"
                    aria-label="Condició"
                />
                <button
                    onClick={() => onEsborra(c.id)}
                    className="opacity-60 md:opacity-0 md:group-hover:opacity-100 text-slate-400 hover:text-red-500 p-1.5 -m-0.5 touch-manipulation flex-shrink-0"
                    title="Esborra la condició"
                >
                    <Trash2 size={12} />
                </button>
            </div>
            <input
                value={c.missatge || ''}
                onChange={e => onCanvia(c.id, { missatge: e.target.value })}
                placeholder="Missatge quan no es compleix"
                className="w-full mt-1 px-1.5 py-0.5 text-[10px] text-slate-500 border border-transparent hover:border-slate-200 focus:border-blue-500 outline-none bg-transparent"
                aria-label="Missatge de la condició"
            />
            {!ok && estat && (
                <div className="mt-0.5 px-1.5 text-[10px] text-amber-700">{estat.error ? `Error a la condició: ${estat.error}` : estat.missatge}</div>
            )}
            {c.grup && <div className="mt-0.5 px-1.5 text-[9px] text-slate-400">{c.grup}</div>}
        </div>
    );
};

/** Paràmetres agrupats per `grup`, en l'ordre en què surten; els que no en tenen, al davant. */
const agrupa = (parametres, nomGrup = (p) => p.grup || '') => {
    const out = [];
    parametres.forEach(p => {
        const nom = nomGrup(p);
        let g = out.find(x => x.nom === nom);
        if (!g) { g = { nom, parametres: [] }; out.push(g); }
        g.parametres.push(p);
    });
    return out.sort((a, b) => (a.nom === '' ? -1 : b.nom === '' ? 1 : 0));
};

/** El nom d'una zona (instància) mentre s'edita: Enter o sortir el desa, Esc el descarta. */
const NomZonaInput = ({ nom, onDesa, onCancela }) => {
    const [draft, setDraft] = useState(nom);
    const cancelat = useRef(false);
    return (
        <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onFocus={e => e.currentTarget.select()}
            onBlur={() => { if (!cancelat.current) onDesa(draft); }}
            onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') { cancelat.current = true; onCancela(); }
            }}
            className="flex-1 min-w-0 m-1.5 px-2 py-1 text-[11px] font-bold text-violet-900 border border-violet-400 outline-none bg-white"
            aria-label="Nom de la zona"
        />
    );
};

/** L'esquema del projecte: el que s'emportarà si es desa com a sistema. */
const EditorEsquema = ({ esquema, onCanvia, notify }) => {
    const fitxer = useRef(null);
    const [treballant, setTreballant] = useState(false);
    const tria = async (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        setTreballant(true);
        try {
            onCanvia(await preparaEsquema(f));
        } catch (err) {
            notify?.(err.message || String(err), 'error');
        } finally {
            setTreballant(false);
        }
    };
    return (
        <div className="px-3 py-2 border-b border-slate-100">
            <input ref={fitxer} type="file" accept={ACCEPTA_ESQUEMA} className="hidden" onChange={tria} />
            {esquema ? (
                <>
                    <Esquema esquema={esquema} className="max-h-40" />
                    <div className="flex items-center gap-3 mt-1 text-[10px]">
                        <button onClick={() => fitxer.current?.click()} className="text-violet-600 hover:underline touch-manipulation py-1">Canvia l&apos;esquema</button>
                        <button onClick={() => onCanvia(null)} className="text-slate-400 hover:text-red-600 touch-manipulation py-1">Treu-lo</button>
                    </div>
                </>
            ) : (
                <button
                    onClick={() => fitxer.current?.click()}
                    disabled={treballant}
                    className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-violet-600 touch-manipulation py-1"
                    title="Una imatge o un SVG amb les cotes dels paràmetres: es veurà en inserir el sistema"
                >
                    <ImageIcon size={12} /> {treballant ? 'Preparant…' : 'Afegeix un esquema (imatge o SVG)'}
                </button>
            )}
        </div>
    );
};

const ParametresPanel = ({
    parametres = [], condicions = [], sistemes = [], esquema = null, resolts, comprovacio, usos,
    onAfegeix, onCanvia, onReanomena, onEsborra, onCanviaEsquema, onReanomenaInstancia, notify,
    onAfegeixCondicio, onCanviaCondicio, onEsborraCondicio, onTanca,
}) => {
    const [nouId, setNouId] = useState(null);
    const [editantNom, setEditantNom] = useState(null);
    const afegeix = (grup) => setNouId(onAfegeix(grup));

    // Els d'una instància que ja no hi és (o d'una instància sense entrada) es queden al projecte.
    const idsInstancies = useMemo(() => new Set(sistemes.map(i => i.id)), [sistemes]);
    const deInstancia = (x) => !!x.sistema && idsInstancies.has(x.sistema);
    const propis = useMemo(() => parametres.filter(p => !deInstancia(p)), [parametres, idsInstancies]); // eslint-disable-line react-hooks/exhaustive-deps
    const grups = useMemo(() => agrupa(propis), [propis]);
    const instancies = useMemo(() => sistemes.map(inst => {
        const prefix = `${inst.nom} · `;
        const ps = parametres.filter(p => p.sistema === inst.id);
        return {
            ...inst,
            // Dins del bloc de la instància, el grup sense el nom de la instància al davant.
            grups: agrupa(ps, p => (p.grup === inst.nom ? '' : (p.grup || '').startsWith(prefix) ? p.grup.slice(prefix.length) : (p.grup || ''))),
            nParametres: ps.length,
            avisos: ps.filter(p => comprovacio.perParametre.has(p.id)).length,
            condicions: condicions.filter(c => c.sistema === inst.id),
        };
    }), [sistemes, parametres, condicions, comprovacio]);
    const condicionsPropies = condicions.filter(c => !deInstancia(c));

    // Oberta per defecte, la darrera instància inserida; la resta, plegades.
    const [obertes, setObertes] = useState(() => new Set(sistemes.length ? [sistemes[sistemes.length - 1].id] : []));
    const darrera = sistemes[sistemes.length - 1]?.id;
    useEffect(() => {
        // Una instància nova s'obre i plega les altres: és la que s'acaba de demanar.
        if (darrera) setObertes(prev => (prev.has(darrera) ? prev : new Set([darrera])));
    }, [darrera]);
    const commuta = (id) => setObertes(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

    const ocupats = useMemo(() => new Set(parametres.map(p => p.nom)), [parametres]);
    const estatDe = useMemo(() => new Map(comprovacio.generals.map(g => [g.id, g])), [comprovacio]);
    const incomplerta = (c) => estatDe.get(c.id) && !estatDe.get(c.id).ok;

    const fila = (p) => (
        <FilaParametre
            key={p.id}
            p={p}
            valor={resolts.valors.get(p.nom)}
            error={resolts.errors.get(p.id)}
            avisos={comprovacio.perParametre.get(p.id)}
            usos={usos.get(p.nom) || 0}
            ocupats={ocupats}
            nou={p.id === nouId}
            onCanvia={onCanvia}
            onReanomena={onReanomena}
            onEsborra={onEsborra}
        />
    );
    const capGrup = (nom, n, onMes) => (
        <div className="bg-slate-50 border-b border-slate-200 px-3 py-1 flex items-center gap-2">
            <span className="flex-1 text-[9px] font-black uppercase tracking-widest text-slate-400 truncate">{nom}</span>
            <span className="text-[9px] font-mono text-slate-400">{n}</span>
            {onMes && (
                <button onClick={onMes} className="text-slate-400 hover:text-violet-600 p-1 -m-1 touch-manipulation" title={`Afegeix un paràmetre a ${nom}`}>
                    <Plus size={11} />
                </button>
            )}
        </div>
    );

    return (
        <div className="h-full flex flex-col bg-white">
            <div className="bg-slate-950 text-white px-3 py-2.5 flex items-center gap-2 flex-shrink-0">
                <Variable size={14} className="text-violet-400" />
                <h3 className="flex-1 text-[11px] font-bold uppercase tracking-widest">Paràmetres</h3>
                {comprovacio.incomplertes > 0 && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400" title="Condicions que no es compleixen">
                        <AlertTriangle size={11} />{comprovacio.incomplertes}
                    </span>
                )}
                <button
                    onClick={() => afegeix('')}
                    className="flex items-center gap-1 bg-violet-600 hover:bg-violet-500 px-2 py-1 text-[10px] font-bold uppercase tracking-widest touch-manipulation"
                >
                    <Plus size={11} /> Afegeix
                </button>
                <button onClick={onTanca} className="p-1.5 -m-1 hover:text-red-400 touch-manipulation" title="Amaga els paràmetres">
                    <X size={15} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                {/* Projecte: els seus paràmetres, l'esquema i les condicions pròpies. */}
                <div className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 px-3 py-1.5 flex items-center gap-2">
                    <span className="flex-1 text-[9px] font-black uppercase tracking-widest text-slate-500">Projecte</span>
                    <span className="text-[9px] font-mono text-slate-400">{propis.length}</span>
                    <button onClick={() => afegeix('')} className="text-slate-400 hover:text-violet-600 p-1 -m-1 touch-manipulation" title="Afegeix un paràmetre al projecte">
                        <Plus size={11} />
                    </button>
                </div>
                {/* L'esquema és per a qui fa un sistema: surt si el projecte té paràmetres propis. */}
                {onCanviaEsquema && (esquema || propis.length > 0) && <EditorEsquema esquema={esquema} onCanvia={onCanviaEsquema} notify={notify} />}
                {parametres.length === 0 && (
                    <div className="p-4 text-[11px] text-slate-500 leading-relaxed space-y-2">
                        <p>Aquest projecte no té cap paràmetre.</p>
                        <p>
                            Afegeix-ne un (per exemple <span className="font-mono font-bold">L</span> = 8) i fes-lo servir a qualsevol
                            camp de les línies d&apos;amidament: <span className="font-mono">L</span>, <span className="font-mono">L+2*e</span>,{' '}
                            <span className="font-mono">(P1+P2)/2</span>. Quan canviïs el valor, es recalcula tot.
                        </p>
                        <p className="text-slate-400">
                            Decimals amb coma o punt; els arguments de les funcions, amb punt i coma: <span className="font-mono">max(2,5;A)</span>.
                        </p>
                    </div>
                )}
                {grups.map(g => (
                    <div key={g.nom || '—'}>
                        {(g.nom || grups.length > 1) && capGrup(g.nom || 'Sense grup', g.parametres.length, () => afegeix(g.nom))}
                        {g.parametres.map(fila)}
                    </div>
                ))}

                {/* Una instància de sistema per bloc, plegable. */}
                {instancies.map(inst => {
                    const oberta = obertes.has(inst.id);
                    const pendents = inst.avisos + inst.condicions.filter(incomplerta).length;
                    return (
                        <div key={inst.id} className="border-t-2 border-violet-200">
                            <div className="sticky top-0 z-10 bg-violet-50 border-b border-violet-200 flex items-stretch">
                                {editantNom === inst.id ? (
                                    <NomZonaInput
                                        nom={inst.nom}
                                        onDesa={(nou) => { setEditantNom(null); onReanomenaInstancia?.(inst.id, nou); }}
                                        onCancela={() => setEditantNom(null)}
                                    />
                                ) : (
                                    <button
                                        onClick={() => commuta(inst.id)}
                                        className="flex-1 min-w-0 hover:bg-violet-100 px-3 py-2 flex items-center gap-2 text-left touch-manipulation"
                                        aria-expanded={oberta}
                                    >
                                        {oberta ? <ChevronDown size={13} className="text-violet-500 flex-shrink-0" /> : <ChevronRight size={13} className="text-violet-500 flex-shrink-0" />}
                                        <span className="flex-1 min-w-0">
                                            <span className="block text-[11px] font-bold text-violet-900 truncate">{inst.nom}</span>
                                            {inst.sistema && inst.sistema !== inst.nom && <span className="block text-[9px] text-violet-500 truncate">{inst.sistema}</span>}
                                        </span>
                                        {inst.esquema && <ImageIcon size={12} className="text-violet-400 flex-shrink-0" aria-label="Té esquema" />}
                                        {pendents > 0 && <AlertTriangle size={12} className="text-amber-500 flex-shrink-0" aria-label="Té condicions que no es compleixen" />}
                                        <span className="text-[9px] font-mono text-violet-500 flex-shrink-0">{inst.nParametres}</span>
                                    </button>
                                )}
                                {onReanomenaInstancia && editantNom !== inst.id && (
                                    <button
                                        onClick={() => setEditantNom(inst.id)}
                                        className="px-2.5 text-violet-400 hover:text-violet-700 hover:bg-violet-100 touch-manipulation"
                                        title="Canvia el nom de la zona (també a les línies d'amidament)"
                                        aria-label={`Canvia el nom de ${inst.nom}`}
                                    >
                                        <Pencil size={12} />
                                    </button>
                                )}
                            </div>
                            {oberta && (
                                <div>
                                    {inst.esquema && <div className="px-3 py-2 border-b border-slate-100"><Esquema esquema={inst.esquema} className="max-h-40" titol={`Esquema de ${inst.nom}`} /></div>}
                                    {inst.nParametres === 0 && (
                                        <p className="px-3 py-2 text-[10px] text-slate-400 leading-snug">Fa servir els paràmetres del projecte: no en té cap de propi.</p>
                                    )}
                                    {inst.grups.map(g => (
                                        <div key={g.nom || '—'}>
                                            {(g.nom || inst.grups.length > 1) && capGrup(g.nom || 'Sense grup', g.parametres.length)}
                                            {g.parametres.map(fila)}
                                        </div>
                                    ))}
                                    {inst.condicions.length > 0 && (
                                        <>
                                            {capGrup('Condicions', inst.condicions.length)}
                                            {inst.condicions.map(c => (
                                                <FilaCondicio key={c.id} c={{ ...c, grup: '' }} estat={estatDe.get(c.id)} onCanvia={onCanviaCondicio} onEsborra={onEsborraCondicio} />
                                            ))}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}

                {(parametres.length > 0 || condicionsPropies.length > 0) && (
                    <div>
                        <div className="sticky top-0 z-10 bg-slate-100 border-y border-slate-200 px-3 py-1.5 flex items-center gap-2 mt-2">
                            <span className="flex-1 text-[9px] font-black uppercase tracking-widest text-slate-500">Condicions entre paràmetres</span>
                            <button
                                onClick={onAfegeixCondicio}
                                className="text-slate-400 hover:text-violet-600 p-1 -m-1 touch-manipulation"
                                title="Afegeix una condició"
                            >
                                <Plus size={11} />
                            </button>
                        </div>
                        {condicionsPropies.length === 0 ? (
                            <p className="px-3 py-2 text-[10px] text-slate-400 leading-relaxed">
                                Una fórmula que s&apos;ha de complir, com <span className="font-mono">P2&gt;=P1</span> o{' '}
                                <span className="font-mono">i(A&gt;0; A&lt;=L)</span>. Si el projecte es desa com a sistema, no es podrà
                                inserir fins que es compleixin.
                            </p>
                        ) : condicionsPropies.map(c => (
                            <FilaCondicio key={c.id} c={c} estat={estatDe.get(c.id)} onCanvia={onCanviaCondicio} onEsborra={onEsborraCondicio} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ParametresPanel;
