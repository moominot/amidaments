import { useState, useMemo } from 'react';
import { X, Blocks, AlertCircle, AlertTriangle, ChevronDown, ChevronRight, ArrowLeftRight } from 'lucide-react';
import NumberInput from './NumberInput';
import TriaPartida from './TriaPartida';
import { generaSistema, valorsPerDefecte, papersDe, partidaPerDefecte } from '../utils/sistemes';
import { llegeixTria, desaTria } from '../utils/sistemes/triaDesada';
import {
    calcItemTotalQty, calcItemTotalAmount, calcChapterTotal, calcMeasureTotal,
    getItemUnitPrice, formatCurrency, formatNumber, normalizeCode,
} from '../utils/calculations';

/**
 * Generar un sistema constructiu (veure `utils/sistemes/`).
 *
 * A l'esquerra els paràmetres; a la dreta, en viu, les partides que sortiran amb la quantitat
 * i l'import. Els preus de la vista prèvia són els mateixos que quedaran un cop inserit: el
 * del projecte si el codi ja hi és, i si no el del sistema (la inserció es fa amb
 * `conservaPreus`).
 *
 * Cada fila de la vista prèvia és un **paper** del sistema (la llosa, el mur...), i amb el botó
 * de la fila s'hi pot posar una partida del projecte o del banc de preus, o deixar-lo buit. La
 * tria es recorda en aquest navegador (`utils/sistemes/triaDesada.js`).
 */
const SistemaModal = ({ sistemes, priceDatabase = {}, chapters = [], codisProjecte, destiLabel, onInsereix, onClose }) => {
    const [sistemaId, setSistemaId] = useState(sistemes[0].id);
    const sistema = sistemes.find(s => s.id === sistemaId) || sistemes[0];
    const [valors, setValors] = useState(() => valorsPerDefecte(sistema));
    const [tria, setTria] = useState(() => llegeixTria(sistema));
    const [obertes, setObertes] = useState({});
    const [triant, setTriant] = useState(null);   // paper que s'està triant

    const canviaSistema = (id) => {
        const s = sistemes.find(x => x.id === id);
        setSistemaId(id);
        setValors(valorsPerDefecte(s));
        setTria(llegeixTria(s));
    };

    /** `inst`: instantània, `null` per deixar-lo buit, `undefined` per tornar a la del sistema. */
    const canviaPartida = (paper, inst) => {
        const seguent = { ...tria };
        if (inst === undefined) delete seguent[paper];
        else seguent[paper] = inst;
        setTria(seguent);
        desaTria(sistema, seguent);
        setTriant(null);
    };

    const restableix = () => {
        setTria({});
        desaTria(sistema, {});
    };

    const resultat = useMemo(
        () => generaSistema(sistema, valors, { codisOcupats: codisProjecte, tria }),
        [sistema, valors, codisProjecte, tria],
    );
    const preus = useMemo(
        () => ({ ...(resultat.prices || {}), ...priceDatabase }),
        [resultat, priceDatabase],
    );

    const grups = useMemo(() => {
        const out = [];
        sistema.parametres.forEach(p => {
            let g = out.find(x => x.nom === p.grup);
            if (!g) { g = { nom: p.grup, parametres: [] }; out.push(g); }
            g.parametres.push(p);
        });
        return out;
    }, [sistema]);

    const arrel = resultat.nodes?.[0];
    const total = arrel ? calcChapterTotal(arrel, preus) : 0;
    const existents = useMemo(() => {
        if (!arrel) return [];
        const out = [];
        const recull = (n) => {
            if (n.unit && codisProjecte.has(normalizeCode(n.code))) out.push(n.code);
            [...(n.subChapters || []), ...(n.items || [])].forEach(recull);
        };
        recull(arrel);
        return out;
    }, [arrel, codisProjecte]);

    const hiHaErrors = resultat.errors.length > 0;
    const defsPerPaper = useMemo(() => new Map(papersDe(sistema).map(d => [d.paper, d])), [sistema]);
    const nTriades = Object.keys(tria).length;
    const avisosUnitat = (resultat.papers || []).filter(x => x.unitatDiferent).length;

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-md p-0 md:p-8">
            <div className="bg-white shadow-2xl border border-slate-300 w-full max-w-5xl h-full md:h-auto md:max-h-full flex flex-col animate-in zoom-in-95 duration-200">
                <div className="bg-slate-950 text-white p-4 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="bg-blue-600 p-1.5 flex-shrink-0"><Blocks size={16} /></div>
                        <div className="min-w-0">
                            <h3 className="font-bold uppercase tracking-widest text-xs truncate">Sistema constructiu</h3>
                            <p className="text-[10px] text-slate-400 mt-0.5 truncate">Un capítol sencer amidat a partir de les dimensions</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="hover:text-red-400 transition-colors p-2 -m-2 touch-manipulation flex-shrink-0" title="Tanca">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden flex flex-col md:flex-row">
                    {/* Paràmetres */}
                    <div className="md:w-72 flex-shrink-0 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50 md:overflow-y-auto p-4 space-y-4">
                        {sistemes.length > 1 && (
                            <select
                                value={sistemaId}
                                onChange={e => canviaSistema(e.target.value)}
                                className="w-full bg-white border border-slate-200 p-2 text-xs font-bold"
                            >
                                {sistemes.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
                            </select>
                        )}
                        <div>
                            <div className="text-xs font-bold text-slate-800">{sistema.nom}</div>
                            <p className="text-[11px] text-slate-500 leading-snug mt-0.5">{sistema.resum}</p>
                        </div>

                        {grups.map(g => (
                            <fieldset key={g.nom} className="space-y-1.5">
                                <legend className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">{g.nom}</legend>
                                {g.parametres.map(p => (
                                    <label key={p.id} className="flex items-center gap-2" title={p.ajuda || ''}>
                                        <span className="flex-1 min-w-0 text-[11px] text-slate-600 leading-tight">
                                            {p.nom}
                                            {p.ajuda && <span className="block text-[10px] text-slate-400">{p.ajuda}</span>}
                                        </span>
                                        <NumberInput
                                            value={valors[p.id]}
                                            onChange={(v) => setValors(prev => ({ ...prev, [p.id]: v }))}
                                            className="w-20 bg-white border border-slate-200 px-2 py-1.5 text-xs font-mono text-right focus:border-blue-500 outline-none"
                                        />
                                        <span className="w-5 text-[10px] text-slate-400 font-mono">{p.unitat}</span>
                                    </label>
                                ))}
                            </fieldset>
                        ))}

                        <div className="flex flex-col items-start">
                            <button
                                onClick={() => setValors(valorsPerDefecte(sistema))}
                                className="text-[10px] uppercase font-bold tracking-widest text-slate-400 hover:text-slate-700 py-1 touch-manipulation"
                            >
                                Valors per defecte
                            </button>
                            {nTriades > 0 && (
                                <button
                                    onClick={restableix}
                                    className="text-[10px] uppercase font-bold tracking-widest text-slate-400 hover:text-slate-700 py-1 touch-manipulation text-left"
                                    title="Torna a les partides del sistema a tots els papers"
                                >
                                    Partides del sistema ({nTriades} {nTriades === 1 ? 'canviada' : 'canviades'})
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Vista prèvia */}
                    <div className="flex-1 min-w-0 md:overflow-y-auto">
                        {hiHaErrors ? (
                            <div className="m-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs space-y-1">
                                {resultat.errors.map(e => (
                                    <div key={e} className="flex items-start gap-2"><AlertCircle size={13} className="mt-0.5 flex-shrink-0" />{e}</div>
                                ))}
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 bg-white z-10 border-b border-slate-200">
                                    <tr className="text-[9px] uppercase text-slate-400 font-black tracking-widest">
                                        <th className="p-2 w-24 hidden sm:table-cell">Codi</th>
                                        <th className="p-2">Descripció</th>
                                        <th className="p-2 w-10 text-center hidden sm:table-cell">Ud.</th>
                                        <th className="p-2 w-16 text-right">Quant.</th>
                                        <th className="p-2 w-20 text-right hidden sm:table-cell">Preu</th>
                                        <th className="p-2 w-24 text-right">Import</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="bg-slate-100 border-b border-slate-200">
                                        {/* Al mòbil el codi va dins de la descripció: amb una columna més no hi cap. */}
                                        <td className="p-2 font-mono text-[11px] font-bold text-blue-700 hidden sm:table-cell">{arrel.code}</td>
                                        <td colSpan={2} className="p-2 text-[11px] font-bold text-slate-800">
                                            <span className="sm:hidden font-mono text-blue-700 mr-1.5">{arrel.code}</span>
                                            {arrel.description}
                                        </td>
                                        <td className="hidden sm:table-cell" />
                                        <td className="hidden sm:table-cell" />
                                        <td className="p-2 text-right font-mono text-[11px] font-bold">{formatCurrency(total)}</td>
                                    </tr>
                                    {sistema.capitols.map(cap => (
                                        <FilesCapitol
                                            key={cap.sufix}
                                            cap={cap}
                                            node={arrel.subChapters.find(c => c.code === `${arrel.code}.${cap.sufix}`)}
                                            papers={resultat.papers.filter(x => x.capitol === cap.sufix)}
                                            preus={preus}
                                            obertes={obertes}
                                            setObertes={setObertes}
                                            existents={existents}
                                            onCanvia={setTriant}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                <div className="border-t border-slate-200 p-3 md:p-4 flex flex-col sm:flex-row sm:items-center gap-3 flex-shrink-0 bg-white">
                    <div className="flex-1 min-w-0 text-[11px] text-slate-500 leading-snug">
                        {avisosUnitat > 0 && (
                            <span className="block text-amber-700 mb-1">
                                {avisosUnitat === 1 ? '1 partida no és' : `${avisosUnitat} partides no són`} en la unitat del seu paper: revisa-ho abans d&apos;inserir.
                            </span>
                        )}
                        {existents.length > 0 ? (
                            <span className="text-amber-700">
                                {existents.length === 1 ? '1 partida ja és' : `${existents.length} partides ja són`} al projecte. En inserir et preguntarà què fer:
                                «afegir com a nova» en conserva les línies; «mantenir l&apos;existent» les descarta.
                            </span>
                        ) : (
                            <>Es crearà dins de <span className="font-bold text-slate-700">{destiLabel}</span>. Per canviar les dimensions, després, cal tornar-lo a generar.</>
                        )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                        <button onClick={onClose} className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:bg-slate-100 touch-manipulation">
                            Cancel·la
                        </button>
                        <button
                            disabled={hiHaErrors}
                            onClick={() => onInsereix(resultat)}
                            className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 text-white px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest touch-manipulation"
                        >
                            Insereix · <span className="font-mono">{formatCurrency(total)}</span>
                        </button>
                    </div>
                </div>
            </div>

            {triant && (
                <TriaPartida
                    paper={defsPerPaper.get(triant)}
                    actual={tria[triant] || null}
                    perDefecte={partidaPerDefecte(sistema, defsPerPaper.get(triant))}
                    chapters={chapters}
                    priceDatabase={priceDatabase}
                    onTria={(inst) => canviaPartida(triant, inst)}
                    onClose={() => setTriant(null)}
                />
            )}
        </div>
    );
};

const FilesCapitol = ({ cap, node, papers, preus, obertes, setObertes, existents, onCanvia }) => (
    <>
        <tr className="border-b border-slate-100 bg-slate-50">
            <td className="p-2 font-mono text-[11px] font-bold text-slate-600 hidden sm:table-cell">{node?.code || ''}</td>
            <td colSpan={2} className="p-2 text-[11px] font-bold text-slate-700">
                <span className="sm:hidden font-mono mr-1.5">{node?.code || ''}</span>
                {cap.description}
            </td>
            <td className="hidden sm:table-cell" />
            <td className="hidden sm:table-cell" />
            <td className="p-2 text-right font-mono text-[11px] font-bold text-slate-600">{formatCurrency(node ? calcChapterTotal(node, preus) : 0)}</td>
        </tr>
        {papers.map(x => (
            <FilaPaper
                key={x.paper} x={x} preus={preus} oberta={!!obertes[x.paper]}
                jaHiEs={!!x.partida && existents.includes(x.partida.code)}
                onToggle={() => setObertes(prev => ({ ...prev, [x.paper]: !prev[x.paper] }))}
                onCanvia={() => onCanvia(x.paper)}
            />
        ))}
    </>
);

/**
 * Un paper: la partida que hi va, amb la quantitat de les línies d'aquest paper. Si dos papers
 * comparteixen partida, cadascun en mostra la seva part; el total del capítol surt de l'arbre
 * generat.
 */
const FilaPaper = ({ x, preus, oberta, jaHiEs, onToggle, onCanvia }) => {
    const p = x.partida;
    const sensePartida = !p;
    const senseLinies = x.linies.length === 0;
    const amidada = p ? { ...p, measurements: x.linies } : null;
    const apagada = sensePartida || senseLinies;
    return (
        <>
            <tr
                className={`border-b border-slate-100 ${apagada ? 'text-slate-400' : 'hover:bg-blue-50/40 cursor-pointer'}`}
                onClick={apagada ? undefined : onToggle}
            >
                <td className="p-2 align-top font-mono text-[10px] text-slate-500 whitespace-nowrap hidden sm:table-cell">
                    <span className="inline-flex items-center gap-0.5">
                        {!apagada && (oberta ? <ChevronDown size={11} /> : <ChevronRight size={11} />)}
                        {p ? p.code : '—'}
                    </span>
                    {jaHiEs && <span className="block text-[9px] text-amber-600 font-sans">ja al projecte</span>}
                </td>
                <td className="p-2 align-top">
                    <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                            <span className="block text-[9px] font-black uppercase tracking-wide sm:tracking-widest text-slate-400 break-words">
                                {x.nom}
                                {x.origen === 'triada' && <span className="ml-1.5 text-blue-600">· triada</span>}
                                {jaHiEs && <span className="sm:hidden ml-1.5 text-amber-600">· ja al projecte</span>}
                            </span>
                            <span className={`block text-[11px] leading-snug ${apagada ? 'italic' : 'text-slate-700'}`}>
                                {p && <span className="sm:hidden font-mono text-[10px] text-slate-500 mr-1.5">{p.code}</span>}
                                {sensePartida ? 'Sense partida' : p.description}
                            </span>
                            {senseLinies && !sensePartida && (
                                <span className="block text-[10px] italic">No s&apos;amida amb aquests paràmetres</span>
                            )}
                            {x.unitatDiferent && (
                                <span className="flex items-center gap-1 text-[10px] text-amber-700 mt-0.5">
                                    <AlertTriangle size={10} className="flex-shrink-0" />
                                    La partida és en {p.unit} i el paper s&apos;amida en {x.unitat}
                                </span>
                            )}
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); onCanvia(); }}
                            className="flex-shrink-0 p-1.5 -m-0.5 text-slate-400 hover:text-blue-600 hover:bg-blue-100 touch-manipulation"
                            title={`Canvia la partida: ${x.nom}`}
                            aria-label={`Canvia la partida: ${x.nom}`}
                        >
                            <ArrowLeftRight size={14} />
                        </button>
                    </div>
                </td>
                <td className="p-2 align-top text-center font-mono text-[10px] text-slate-400 hidden sm:table-cell">{p?.unit || ''}</td>
                <td className="p-2 align-top text-right font-mono text-[11px]">{amidada && !senseLinies ? formatNumber(calcItemTotalQty(amidada)) : '—'}</td>
                <td className="p-2 align-top text-right font-mono text-[11px] text-slate-500 hidden sm:table-cell">{p ? formatNumber(getItemUnitPrice(p, preus)) : ''}</td>
                <td className="p-2 align-top text-right font-mono text-[11px]">{amidada && !senseLinies ? formatCurrency(calcItemTotalAmount(amidada, preus)) : '—'}</td>
            </tr>
            {oberta && !apagada && x.linies.map((m, i) => (
                <tr key={i} className="bg-slate-50/60 text-[10px] text-slate-500">
                    {/* Una sola cel·la: amb columnes amagades al mòbil, repartir-la en columnes
                        la desquadraria. */}
                    <td colSpan={6} className="pl-8 pr-2 py-1">
                        <div className="flex items-baseline gap-2">
                            <span className="flex-1 min-w-0">
                                {m.description}
                                <span className="font-mono text-slate-400 ml-2 whitespace-nowrap">
                                    {formatNumber(m.units, 0)} × {formatNumber(m.length, 3)}
                                    {m.width !== 1 && <> × {formatNumber(m.width, 3)}</>}
                                    {m.height !== 1 && <> × {formatNumber(m.height, 3)}</>}
                                </span>
                            </span>
                            <span className="font-mono">{formatNumber(calcMeasureTotal(m))}</span>
                        </div>
                    </td>
                </tr>
            ))}
        </>
    );
};

export default SistemaModal;
