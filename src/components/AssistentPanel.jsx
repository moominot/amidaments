import { useState, useRef, useEffect } from 'react';
import { X, Sparkles, Send, Square, KeyRound, Wrench, RotateCcw, AlertCircle } from 'lucide-react';
import { executaEina } from '../utils/assistent/eines';
import * as xarxa from '../utils/assistent/cype';

/**
 * Xat amb l'assistent (veure `docs/assistent.md`).
 *
 * Treballa sobre el projecte d'aquesta finestra: `getEstat()` en dona l'estat d'ara mateix i
 * `aplicaEstat(estat)` el desa (i passa per l'historial de desfer, com qualsevol canvi). El
 * SDK d'Anthropic i el bucle es carreguen només quan s'envia el primer missatge, perquè no
 * engreixin l'aplicació per a qui no fa servir l'assistent.
 *
 * La clau de l'API és de l'usuari i es desa en aquest navegador (`localStorage`). No passa
 * per cap servidor nostre: va directament a Anthropic.
 */
const CLAU = 'amidaments:clau-anthropic';

const llegeixClau = () => { try { return localStorage.getItem(CLAU) || ''; } catch { return ''; } };
const desaClau = (v) => { try { if (v) localStorage.setItem(CLAU, v); else localStorage.removeItem(CLAU); } catch { /* res */ } };

const SUGGERIMENTS = [
    'Fes un sistema d\'envà de placa de guix de 15+48+15 amb la llargària i l\'alçada com a paràmetres.',
    'Crea una partida de vorada de formigó aprofitant la mà d\'obra i els materials que ja tenim.',
    'Revisa el projecte i digues-me quines partides no tenen amidament.',
];

const NOMS_EINES = {
    llegeix_projecte: 'Llegeix el projecte', llegeix_partida: 'Llegeix una partida', consulta_preus: 'Consulta la base de preus',
    cype_navega: 'Generador de Preus', cype_fitxa: 'Fitxa de CYPE', cype_importa: 'Importa de CYPE',
    crea_capitol: 'Crea un capítol', crea_partida: 'Crea una partida', modifica_partida: 'Modifica una partida',
    posa_linies: 'Línies d\'amidament', posa_parametre: 'Paràmetre', posa_condicio: 'Condició', esborra: 'Esborra',
};

const FormulariClau = ({ onDesa }) => {
    const [valor, setValor] = useState('');
    return (
        <div className="p-4 space-y-3 text-[11px] text-slate-600 leading-relaxed">
            <p>
                L&apos;assistent fa servir l&apos;API de Claude amb <b>la teva clau</b>. Pots crear-ne una al teu compte de la
                plataforma de Claude (<span className="font-mono">platform.claude.com</span>). Cada conversa té un cost que va
                al teu compte; aquí en veuràs una estimació.
            </p>
            <p className="text-slate-500">
                La clau es desa només en aquest navegador i s&apos;envia només a Anthropic. Fes-ne servir una amb un límit de
                despesa, i esborra-la d&apos;aquí si deixes l&apos;ordinador a algú.
            </p>
            <form onSubmit={(e) => { e.preventDefault(); if (valor.trim()) onDesa(valor.trim()); }} className="flex gap-2">
                <input
                    type="password"
                    value={valor}
                    onChange={e => setValor(e.target.value)}
                    placeholder="sk-ant-..."
                    autoComplete="off"
                    className="flex-1 min-w-0 border border-slate-200 px-2 py-1.5 text-xs font-mono focus:border-violet-500 outline-none"
                    aria-label="Clau de l'API d'Anthropic"
                />
                <button type="submit" className="bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest touch-manipulation">
                    Desa
                </button>
            </form>
        </div>
    );
};

const Element = ({ e }) => {
    if (e.tipus === 'usuari') {
        return <div className="ml-6 bg-violet-600 text-white px-3 py-2 text-[12px] leading-snug whitespace-pre-wrap break-words">{e.text}</div>;
    }
    if (e.tipus === 'assistent') {
        return <div className="mr-2 text-[12px] text-slate-800 leading-relaxed whitespace-pre-wrap break-words">{e.text}</div>;
    }
    if (e.tipus === 'eina') {
        return (
            <div className={`flex items-start gap-1.5 text-[10px] font-mono leading-snug ${e.error ? 'text-red-600' : 'text-slate-400'}`}>
                <Wrench size={10} className={`flex-shrink-0 mt-0.5 ${e.enCurs ? 'animate-pulse' : ''}`} />
                <span className="break-words min-w-0">{e.error ? `${NOMS_EINES[e.nom] || e.nom}: ${e.error}` : (e.resum || `${NOMS_EINES[e.nom] || e.nom}…`)}</span>
            </div>
        );
    }
    return (
        <div className="flex items-start gap-1.5 text-[11px] text-red-700 bg-red-50 border border-red-200 px-2 py-1.5">
            <AlertCircle size={12} className="flex-shrink-0 mt-0.5" /><span className="break-words min-w-0">{e.text}</span>
        </div>
    );
};

const AssistentPanel = ({ getEstat, aplicaEstat, onTanca }) => {
    const [clau, setClau] = useState(llegeixClau);
    const [elements, setElements] = useState([]);
    const [entrada, setEntrada] = useState('');
    const [treballant, setTreballant] = useState(false);
    const [cost, setCost] = useState({ dolars: 0, cerques: 0 });
    const historial = useRef([]);
    const control = useRef(null);
    const caixa = useRef(null);
    // La bombolla on va arribant el text i la línia de l'eina en curs. Els ids es fan fora de
    // les funcions d'actualització de l'estat: React les pot cridar dues vegades.
    const textObert = useRef(null);
    const einaOberta = useRef(null);

    // Seguir el final de la conversa sense arrossegar la pàgina (scrollIntoView ho faria).
    useEffect(() => {
        const c = caixa.current;
        if (c) c.scrollTop = c.scrollHeight;
    }, [elements]);

    const afegeix = (e) => setElements(prev => [...prev, { id: crypto.randomUUID(), ...e }]);

    const envia = async (text) => {
        const t = (text ?? entrada).trim();
        if (!t || treballant) return;
        setEntrada('');
        afegeix({ tipus: 'usuari', text: t });
        historial.current.push({ role: 'user', content: t });
        setTreballant(true);
        const ctrl = new AbortController();
        control.current = ctrl;
        let agent;
        try {
            agent = await import('../utils/assistent/agent');
            const client = agent.creaClient(clau);
            textObert.current = null;
            await agent.avanca({
                client,
                historial: historial.current,
                signal: ctrl.signal,
                executa: async (nom, input) => {
                    const r = await executaEina(nom, input, getEstat, { xarxa });
                    if (r.estat !== getEstat()) aplicaEstat(r.estat);
                    return r;
                },
                onVolta: () => { textObert.current = null; },
                onText: (delta) => {
                    const id = textObert.current;
                    if (id) {
                        setElements(prev => prev.map(e => (e.id === id ? { ...e, text: e.text + delta } : e)));
                    } else {
                        const nou = crypto.randomUUID();
                        textObert.current = nou;
                        setElements(prev => [...prev, { id: nou, tipus: 'assistent', text: delta }]);
                    }
                },
                onEina: ({ nom, input, enCurs, resum, error }) => {
                    textObert.current = null;
                    const oberta = einaOberta.current;
                    if (!enCurs && oberta) {
                        einaOberta.current = null;
                        setElements(prev => prev.map(e => (e.id === oberta ? { ...e, enCurs: false, resum, error } : e)));
                        return;
                    }
                    const id = crypto.randomUUID();
                    if (enCurs) einaOberta.current = id;
                    setElements(prev => [...prev, { id, tipus: 'eina', nom, input, enCurs, resum, error }]);
                },
                onUs: (usage) => setCost(prev => ({
                    dolars: prev.dolars + agent.costUs(usage),
                    cerques: prev.cerques + (usage?.server_tool_use?.web_search_requests || 0),
                })),
            });
        } catch (err) {
            const A = agent?.Anthropic;
            let missatge = err?.message || String(err);
            if (A && err instanceof A.APIUserAbortError) missatge = 'Aturat.';
            else if (A && err instanceof A.AuthenticationError) missatge = 'La clau no és vàlida. Torna-la a posar.';
            else if (A && err instanceof A.RateLimitError) missatge = 'Massa peticions seguides: espera una mica i torna-ho a provar.';
            else if (A && err instanceof A.APIConnectionError) missatge = 'No s\'ha pogut connectar amb Anthropic. Mira la connexió.';
            else if (agent && err instanceof agent.Refus) missatge = `El model ha declinat la petició: ${err.message}`;
            afegeix({ tipus: 'error', text: missatge });
            if (A && err instanceof A.AuthenticationError) { desaClau(''); setClau(''); }
        } finally {
            setTreballant(false);
            control.current = null;
        }
    };

    const nova = () => {
        if (treballant) return;
        historial.current = [];
        setElements([]);
        setCost({ dolars: 0, cerques: 0 });
    };

    return (
        <div className="h-full flex flex-col bg-white">
            <div className="bg-slate-950 text-white px-3 py-2.5 flex items-center gap-2 flex-shrink-0">
                <Sparkles size={14} className="text-violet-400" />
                <h3 className="flex-1 text-[11px] font-bold uppercase tracking-widest">Assistent</h3>
                {clau && (
                    <>
                        <button onClick={nova} disabled={treballant} className="p-1.5 -m-1 hover:text-violet-300 disabled:opacity-40 touch-manipulation" title="Conversa nova">
                            <RotateCcw size={14} />
                        </button>
                        <button
                            onClick={() => { if (confirm('Esborrar la clau de l\'API d\'aquest navegador?')) { desaClau(''); setClau(''); } }}
                            className="p-1.5 -m-1 hover:text-violet-300 touch-manipulation" title="Esborra la clau d'aquest navegador"
                        >
                            <KeyRound size={14} />
                        </button>
                    </>
                )}
                <button onClick={onTanca} className="p-1.5 -m-1 hover:text-red-400 touch-manipulation" title="Amaga l'assistent">
                    <X size={15} />
                </button>
            </div>

            {!clau ? (
                <FormulariClau onDesa={(v) => { desaClau(v); setClau(v); }} />
            ) : (
                <>
                    <div ref={caixa} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
                        {elements.length === 0 && (
                            <div className="text-[11px] text-slate-500 leading-relaxed space-y-2">
                                <p>
                                    Demana-li que munti un sistema, que amidi una part de l&apos;obra o que creï partides. Treballa sobre el
                                    projecte d&apos;aquesta finestra: veuràs els canvis a l&apos;arbre i els pots corregir a mà.
                                </p>
                                <p className="text-slate-400">
                                    Busca partides al Generador de Preus de CYPE (amb la configuració per defecte: per a una altra, et
                                    demanarà l&apos;enllaç del BC3) i, si cal, preus a internet amb la font.
                                </p>
                                <div className="space-y-1.5 pt-1">
                                    {SUGGERIMENTS.map(s => (
                                        <button key={s} onClick={() => setEntrada(s)} className="block w-full text-left border border-slate-200 hover:border-violet-400 hover:bg-violet-50 px-2 py-1.5 text-[11px] text-slate-600 touch-manipulation">
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {elements.map(e => <Element key={e.id} e={e} />)}
                        {treballant && <div className="text-[10px] text-violet-500 animate-pulse">Treballant…</div>}
                    </div>

                    <div className="border-t border-slate-200 p-2 flex-shrink-0">
                        <div className="flex items-end gap-2">
                            <textarea
                                value={entrada}
                                onChange={e => setEntrada(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envia(); } }}
                                rows={3}
                                placeholder="Què vols que faci?"
                                className="flex-1 min-w-0 resize-none border border-slate-200 px-2 py-1.5 text-[12px] focus:border-violet-500 outline-none"
                                aria-label="Missatge per a l'assistent"
                            />
                            {treballant ? (
                                <button onClick={() => control.current?.abort()} className="bg-slate-800 hover:bg-slate-700 text-white p-2.5 touch-manipulation" title="Atura">
                                    <Square size={14} />
                                </button>
                            ) : (
                                <button onClick={() => envia()} disabled={!entrada.trim()} className="bg-violet-600 hover:bg-violet-500 disabled:bg-slate-300 text-white p-2.5 touch-manipulation" title="Envia (Enter)">
                                    <Send size={14} />
                                </button>
                            )}
                        </div>
                        <div className="flex justify-between mt-1 text-[9px] text-slate-400 font-mono">
                            <span>Claude Opus 5.5</span>
                            <span title="Estimació a partir dels tòquens; les cerques web es facturen a part">
                                ≈ {cost.dolars.toLocaleString('ca-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $
                                {cost.cerques ? ` · ${cost.cerques} cerques` : ''}
                            </span>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default AssistentPanel;
