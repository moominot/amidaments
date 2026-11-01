import { useState, useMemo } from 'react';
import { X, Blocks, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import NumberInput from './NumberInput';
import { generaSistema, valorsPerDefecte } from '../utils/sistemes';
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
 */
const SistemaModal = ({ sistemes, priceDatabase = {}, codisProjecte, destiLabel, onInsereix, onClose }) => {
    const [sistemaId, setSistemaId] = useState(sistemes[0].id);
    const sistema = sistemes.find(s => s.id === sistemaId) || sistemes[0];
    const [valors, setValors] = useState(() => valorsPerDefecte(sistema));
    const [obertes, setObertes] = useState({});

    const canviaSistema = (id) => {
        const s = sistemes.find(x => x.id === id);
        setSistemaId(id);
        setValors(valorsPerDefecte(s));
    };

    const resultat = useMemo(
        () => generaSistema(sistema, valors, { codisOcupats: codisProjecte }),
        [sistema, valors, codisProjecte],
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

                        <button
                            onClick={() => setValors(valorsPerDefecte(sistema))}
                            className="text-[10px] uppercase font-bold tracking-widest text-slate-400 hover:text-slate-700 py-1 touch-manipulation"
                        >
                            Valors per defecte
                        </button>
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
                                        <th className="p-2 w-24">Codi</th>
                                        <th className="p-2">Descripció</th>
                                        <th className="p-2 w-10 text-center hidden sm:table-cell">Ud.</th>
                                        <th className="p-2 w-16 text-right">Quant.</th>
                                        <th className="p-2 w-20 text-right hidden sm:table-cell">Preu</th>
                                        <th className="p-2 w-24 text-right">Import</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="bg-slate-100 border-b border-slate-200">
                                        <td className="p-2 font-mono text-[11px] font-bold text-blue-700">{arrel.code}</td>
                                        <td colSpan={2} className="p-2 text-[11px] font-bold text-slate-800">{arrel.description}</td>
                                        <td className="hidden sm:table-cell" />
                                        <td className="hidden sm:table-cell" />
                                        <td className="p-2 text-right font-mono text-[11px] font-bold">{formatCurrency(total)}</td>
                                    </tr>
                                    {arrel.subChapters.map(cap => (
                                        <FilesCapitol key={cap.id} cap={cap} preus={preus} obertes={obertes} setObertes={setObertes} existents={existents} />
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                <div className="border-t border-slate-200 p-3 md:p-4 flex flex-col sm:flex-row sm:items-center gap-3 flex-shrink-0 bg-white">
                    <div className="flex-1 min-w-0 text-[11px] text-slate-500 leading-snug">
                        {existents.length > 0 ? (
                            <span className="text-amber-700">
                                {existents.length === 1 ? '1 partida ja és' : `${existents.length} partides ja són`} al projecte: en inserir et preguntarà
                                si la mantens (es descarta la generada, amb les seves línies) o l&apos;afegeixes com a nova.
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
        </div>
    );
};

const FilesCapitol = ({ cap, preus, obertes, setObertes, existents }) => (
    <>
        <tr className="border-b border-slate-100 bg-slate-50">
            <td className="p-2 font-mono text-[11px] font-bold text-slate-600">{cap.code}</td>
            <td colSpan={2} className="p-2 text-[11px] font-bold text-slate-700">{cap.description}</td>
            <td className="hidden sm:table-cell" />
            <td className="hidden sm:table-cell" />
            <td className="p-2 text-right font-mono text-[11px] font-bold text-slate-600">{formatCurrency(calcChapterTotal(cap, preus))}</td>
        </tr>
        {cap.items.map(p => {
            const oberta = !!obertes[p.code];
            const jaHiEs = existents.includes(p.code);
            return (
                <FilaPartida
                    key={p.id} p={p} preus={preus} oberta={oberta} jaHiEs={jaHiEs}
                    onToggle={() => setObertes(prev => ({ ...prev, [p.code]: !oberta }))}
                />
            );
        })}
    </>
);

const FilaPartida = ({ p, preus, oberta, jaHiEs, onToggle }) => (
    <>
        <tr className="border-b border-slate-100 hover:bg-blue-50/40 cursor-pointer" onClick={onToggle}>
            <td className="p-2 font-mono text-[10px] text-slate-500 whitespace-nowrap">
                <span className="inline-flex items-center gap-0.5">
                    {oberta ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    {p.code}
                </span>
                {jaHiEs && <span className="block text-[9px] text-amber-600 font-sans">ja al projecte</span>}
            </td>
            <td className="p-2 text-[11px] text-slate-700 leading-snug">{p.description}</td>
            <td className="p-2 text-center font-mono text-[10px] text-slate-400 hidden sm:table-cell">{p.unit}</td>
            <td className="p-2 text-right font-mono text-[11px]">{formatNumber(calcItemTotalQty(p))}</td>
            <td className="p-2 text-right font-mono text-[11px] text-slate-500 hidden sm:table-cell">{formatNumber(getItemUnitPrice(p, preus))}</td>
            <td className="p-2 text-right font-mono text-[11px]">{formatCurrency(calcItemTotalAmount(p, preus))}</td>
        </tr>
        {oberta && p.measurements.map(m => (
            <tr key={m.id} className="bg-slate-50/60 text-[10px] text-slate-500">
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

export default SistemaModal;
