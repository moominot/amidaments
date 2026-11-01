import { useState, useEffect, useMemo, useRef } from 'react';
import { X, Plus, Variable, Trash2, AlertCircle } from 'lucide-react';
import FormulaInput from './FormulaInput';
import { esNomValid } from '../utils/formules';

/**
 * Gestor de paràmetres del projecte (`budget.parametres`, veure `utils/parametres.js`).
 *
 * Els paràmetres s'agrupen per `grup`: els que entren amb un sistema hi arriben amb el nom de
 * la instància (veure `utils/sistemesDoc.js`), i l'usuari pot posar-ne els seus. El valor pot
 * ser un número o una fórmula d'altres paràmetres. Canviar el nom reescriu totes les fórmules
 * que el fan servir; això ho fa qui crida `onReanomena`.
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

const FilaParametre = ({ p, valor, error, usos, ocupats, nou, onCanvia, onReanomena, onEsborra }) => (
    <div className="px-3 py-2 border-b border-slate-100 group">
        <div className="flex items-start gap-1.5">
            <NomInput p={p} ocupats={ocupats} onReanomena={onReanomena} nou={nou} />
            <span className="text-slate-300 text-[11px] py-1">=</span>
            <FormulaInput
                value={p.formula ? valor : p.valor}
                formula={p.formula || undefined}
                error={error && p.formula ? error : undefined}
                teclatText
                onChange={(e) => onCanvia(p.id, 'valor' in e ? { valor: e.valor, formula: '' } : { formula: e.formula })}
                className="flex-1 min-w-0 px-1.5 py-1 text-[11px] font-mono text-right border border-slate-200 outline-none focus:border-blue-500 bg-white"
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
        <div className="flex items-center gap-2 mt-0.5 px-1.5 text-[9px]">
            {p.formula && !error && <span className="font-mono text-violet-600 truncate" title={p.formula}>= {p.formula}</span>}
            {error && <span className="flex items-center gap-1 text-red-600"><AlertCircle size={9} />{error}</span>}
            <span className="ml-auto text-slate-400">{usos ? `${usos} ${usos === 1 ? 'ús' : 'usos'}` : 'sense ús'}</span>
        </div>
    </div>
);

const ParametresPanel = ({ parametres = [], resolts, usos, onAfegeix, onCanvia, onReanomena, onEsborra, onTanca }) => {
    const [nouId, setNouId] = useState(null);
    const afegeix = (grup) => setNouId(onAfegeix(grup));
    const grups = useMemo(() => {
        const out = [];
        parametres.forEach(p => {
            const nom = p.grup || '';
            let g = out.find(x => x.nom === nom);
            if (!g) { g = { nom, parametres: [] }; out.push(g); }
            g.parametres.push(p);
        });
        // Els que no tenen grup, al davant.
        return out.sort((a, b) => (a.nom === '' ? -1 : b.nom === '' ? 1 : 0));
    }, [parametres]);

    const ocupats = useMemo(() => new Set(parametres.map(p => p.nom)), [parametres]);

    return (
        <div className="h-full flex flex-col bg-white">
            <div className="bg-slate-950 text-white px-3 py-2.5 flex items-center gap-2 flex-shrink-0">
                <Variable size={14} className="text-violet-400" />
                <h3 className="flex-1 text-[11px] font-bold uppercase tracking-widest">Paràmetres</h3>
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
                {parametres.length === 0 ? (
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
                ) : grups.map(g => (
                    <div key={g.nom || '—'}>
                        <div className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 px-3 py-1.5 flex items-center gap-2">
                            <span className="flex-1 text-[9px] font-black uppercase tracking-widest text-slate-500 truncate">
                                {g.nom || 'Projecte'}
                            </span>
                            <span className="text-[9px] font-mono text-slate-400">{g.parametres.length}</span>
                            <button
                                onClick={() => afegeix(g.nom)}
                                className="text-slate-400 hover:text-violet-600 p-1 -m-1 touch-manipulation"
                                title={`Afegeix un paràmetre a ${g.nom || 'Projecte'}`}
                            >
                                <Plus size={11} />
                            </button>
                        </div>
                        {g.parametres.map(p => (
                            <FilaParametre
                                key={p.id}
                                p={p}
                                valor={resolts.valors.get(p.nom)}
                                error={resolts.errors.get(p.id)}
                                usos={usos.get(p.nom) || 0}
                                ocupats={ocupats}
                                nou={p.id === nouId}
                                onCanvia={onCanvia}
                                onReanomena={onReanomena}
                                onEsborra={onEsborra}
                            />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ParametresPanel;
