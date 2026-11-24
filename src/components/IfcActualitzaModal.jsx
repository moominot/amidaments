import { useState, useMemo } from 'react';
import { X, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatNumber } from '../utils/calculations';
import { resumActualitzacio, planificaActualitzacio } from '../utils/ifc/actualitza';

/**
 * Reimportació d'un IFC sobre un projecte que ja en té línies (veure `utils/ifc/actualitza.js`).
 *
 * Ensenya què canviaria abans de tocar res. Els canvis sense conflicte s'apliquen sempre; els
 * conflictes (línia editada a mà o amb fórmula), les eliminades i les partides noves són una tria.
 */
const Titol = ({ children }) => <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">{children}</div>;

const Fila = ({ codi, text, abans, despres, unitat }) => (
    <div className="flex items-baseline gap-2 px-2 py-1 text-[11px]">
        <span className="font-mono text-slate-400 w-20 flex-shrink-0 truncate">{codi}</span>
        <span className="flex-1 min-w-0 truncate">{text}</span>
        {abans != null && <span className="font-mono text-slate-400 line-through">{formatNumber(abans)}</span>}
        {despres != null && <span className="font-mono font-bold">{formatNumber(despres)}</span>}
        {unitat && <span className="font-mono text-slate-400 w-6">{unitat}</span>}
    </div>
);

const IfcActualitzaModal = ({ nom, chapters, model, memoria, onAplica, onComNou, onTanca }) => {
    // Què es torna a marcar ara: elements exclosos abans i classes que no es van importar.
    const [reinclou, setReinclou] = useState(() => new Set());
    const [classesInc, setClassesInc] = useState(() => new Set());
    const pla = useMemo(() => planificaActualitzacio(
        chapters, model,
        { reinclou: [...reinclou], classes: Object.fromEntries([...classesInc].map(c => [c, { inclou: true }])) },
        memoria,
    ), [chapters, model, memoria, reinclou, classesInc]);
    const alterna = (set, setter, valor) => setter(prev => { const n = new Set(prev); if (n.has(valor)) n.delete(valor); else n.add(valor); return n; });
    const [treu, setTreu] = useState(false);
    const [sobreescriu, setSobreescriu] = useState(false);
    const [inserirNoves, setInserirNoves] = useState(true);

    const nNoves = pla.noves.chapters.reduce((s, c) => s + c.items.length, 0);
    const res = resumActualitzacio(pla, { treu, sobreescriu });
    const res2 = { ...res, noves: inserirNoves ? res.noves : 0 };
    const canviaMemoria = reinclou.size > 0 || classesInc.size > 0;
    const hiHaRes = res2.actualitzades + res2.afegides + res2.noves + res2.eliminades > 0 || canviaMemoria;

    const Opcio = ({ checked, onChange, children }) => (
        <label className="flex items-start gap-2 py-1 text-xs cursor-pointer touch-manipulation">
            <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="mt-0.5 accent-blue-600" />
            <span>{children}</span>
        </label>
    );

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-md p-0 md:p-8">
            <div role="dialog" aria-label="Actualitza des de l'IFC" className="bg-white w-full h-full md:h-auto md:max-h-full md:max-w-2xl flex flex-col shadow-2xl">
                <div className="flex items-center gap-2 px-4 py-3 bg-slate-950 text-white flex-shrink-0">
                    <RefreshCw size={16} className="text-blue-400" />
                    <div className="min-w-0 flex-1">
                        <div className="text-xs font-black uppercase tracking-widest">Actualitza des de l&apos;IFC</div>
                        <div className="text-[10px] text-slate-400 truncate">{nom} · el projecte ja en porta línies</div>
                    </div>
                    <button onClick={onTanca} className="p-2 -m-1 text-slate-400 hover:text-white touch-manipulation" aria-label="Tanca"><X size={16} /></button>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
                    <p className="text-[11px] text-slate-500">
                        Les línies es reconeixen pel <span className="font-mono">GlobalId</span> de cada element. No es toca cap preu, descomposat ni descripció:
                        només les xifres d&apos;amidament.
                    </p>

                    <div className="grid grid-cols-4 gap-2 text-center">
                        {[['Canvien', pla.canvis.length], ['Igual', pla.iguals], ['Nous', pla.afegides.length + nNoves], ['Ja no hi són', pla.eliminades.length]].map(([t, n]) => (
                            <div key={t} className="border border-slate-100 py-2">
                                <div className="font-mono font-black text-lg leading-none">{n}</div>
                                <div className="text-[9px] uppercase tracking-wide text-slate-400 mt-1">{t}</div>
                            </div>
                        ))}
                    </div>

                    {pla.canvis.length > 0 && (
                        <div>
                            <Titol>Quantitats que canvien</Titol>
                            <div className="border border-slate-100 divide-y divide-slate-100">
                                {pla.canvis.map(c => <Fila key={c.liniaId} codi={c.partida} text={c.descripcio} abans={c.abans} despres={c.despres} unitat={c.unitat} />)}
                            </div>
                        </div>
                    )}

                    {pla.conflictes.length > 0 && (
                        <div>
                            <Titol>Conflictes ({pla.conflictes.length})</Titol>
                            <div className="border border-amber-200 bg-amber-50 divide-y divide-amber-100">
                                {pla.conflictes.map(c => (
                                    <div key={c.liniaId}>
                                        <Fila codi={c.partida} text={c.descripcio} abans={c.abans} despres={c.despres} unitat={c.unitat} />
                                        <div className="px-2 pb-1 text-[10px] text-amber-800 flex items-center gap-1"><AlertTriangle size={10} />{c.motiu}</div>
                                    </div>
                                ))}
                            </div>
                            <Opcio checked={sobreescriu} onChange={setSobreescriu}>Sobreescriu també aquestes línies (es perd el que s&apos;hi havia posat)</Opcio>
                        </div>
                    )}

                    {(pla.afegides.length > 0 || nNoves > 0) && (
                        <div>
                            <Titol>Elements nous</Titol>
                            {pla.afegides.length > 0 && (
                                <div className="border border-slate-100 divide-y divide-slate-100 mb-1.5">
                                    {pla.afegides.map(a => <Fila key={a.guid} codi={a.partida} text={`+ ${a.descripcio}`} despres={a.linia.units * (a.linia.length || 1)} />)}
                                </div>
                            )}
                            {nNoves > 0 && (
                                <Opcio checked={inserirNoves} onChange={setInserirNoves}>
                                    Insereix {nNoves} {nNoves === 1 ? 'partida nova' : 'partides noves'} (d&apos;un tipus que el projecte no tenia):{' '}
                                    <span className="text-slate-400">{pla.noves.chapters.flatMap(c => c.items).map(p => p.description).join(', ')}</span>
                                </Opcio>
                            )}
                        </div>
                    )}

                    {(pla.exclosos.length > 0 || pla.classesFora.length > 0) && (
                        <div>
                            <Titol>Exclosos en la importació anterior</Titol>
                            {pla.exclosos.length > 0 && (
                                <div className="border border-slate-100 divide-y divide-slate-50 mb-1.5 max-h-48 overflow-y-auto">
                                    {pla.exclosos.map(x => (
                                        <label key={x.guid} className="flex items-center gap-2 px-2 py-1 text-[11px] cursor-pointer touch-manipulation">
                                            <input type="checkbox" checked={reinclou.has(x.guid)} onChange={() => alterna(reinclou, setReinclou, x.guid)} className="accent-blue-600" />
                                            <span className="flex-1 min-w-0 truncate">{x.nom || x.tipus || x.classe}</span>
                                            <span className="font-mono text-slate-400">{x.classe.replace(/^IFC/, '')}</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                            {pla.classesFora.map(c => (
                                <Opcio key={c.classe} checked={classesInc.has(c.classe)} onChange={() => alterna(classesInc, setClassesInc, c.classe)}>
                                    Importa també els {c.n} de la classe <span className="font-mono">{c.classe.replace(/^IFC/, '')}</span> <span className="text-slate-400">(no s&apos;havia triat)</span>
                                </Opcio>
                            ))}
                            <p className="text-[10px] text-slate-400">Els que marquis entren com a elements nous.</p>
                        </div>
                    )}

                    {pla.eliminades.length > 0 && (
                        <div>
                            <Titol>Ja no són al model ({pla.eliminades.length})</Titol>
                            <div className="border border-slate-100 divide-y divide-slate-100">
                                {pla.eliminades.map(e => <Fila key={e.liniaId} codi={e.partida} text={e.descripcio} />)}
                            </div>
                            <Opcio checked={treu} onChange={setTreu}>Treu aquestes línies del projecte</Opcio>
                        </div>
                    )}

                    {pla.avisos.length > 0 && (
                        <ul className="space-y-1">
                            {pla.avisos.map((a, i) => (
                                <li key={i} className="flex items-start gap-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1.5">
                                    <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" /><span>{a}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 border-t border-slate-200 flex-shrink-0">
                    <button onClick={onComNou} className="flex-1 text-left text-[10px] text-slate-400 hover:text-slate-700 underline touch-manipulation">Importa-ho com a nou, sense actualitzar</button>
                    <button onClick={onTanca} className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 touch-manipulation">Cancel·la</button>
                    <button
                        onClick={() => onAplica({ treu, sobreescriu, inserirNoves }, res2, pla)} disabled={!hiHaRes}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-bold disabled:opacity-40 hover:bg-blue-700 touch-manipulation"
                    >
                        <CheckCircle2 size={14} /> {hiHaRes ? 'Actualitza' : 'Res a actualitzar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default IfcActualitzaModal;
