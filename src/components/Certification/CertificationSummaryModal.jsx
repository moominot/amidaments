import { X, BarChart3, Lock } from 'lucide-react';
import { formatCurrency, formatNumber } from '../../utils/calculations';

/**
 * Detall de la certificació capítol per capítol.
 *
 * Amb 20-30 capítols un gràfic no aporta res: la forma correcta és una taula amb
 * els percentatges, més una barra fina per fila que permet comparar l'avenç d'un
 * cop d'ull sense haver de llegir totes les xifres.
 */

const TRAM_ANTERIOR = '#047857'; // emerald-700
const TRAM_PERIODE = '#10b981';  // emerald-500

const MiniMeter = ({ previousPct, periodPct }) => {
    const previous = Math.max(0, Math.min(100, previousPct));
    const period = Math.max(0, Math.min(100 - previous, periodPct));
    return (
        <div className="h-1.5 w-full bg-slate-100 rounded-sm overflow-hidden flex">
            <div style={{ width: `${previous}%`, backgroundColor: TRAM_ANTERIOR }} />
            {period > 0 && (
                <>
                    {previous > 0 && <div className="w-[2px] bg-white flex-shrink-0" />}
                    <div style={{ width: `${period}%`, backgroundColor: TRAM_PERIODE }} />
                </>
            )}
        </div>
    );
};

const CertificationSummaryModal = ({ summary, cert, previousCert, onClose }) => {
    const { rows, totals } = summary;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-md p-2 md:p-8">
            <div className="bg-white shadow-2xl border border-slate-300 w-full max-w-5xl max-h-full flex flex-col animate-in zoom-in-95 duration-200">
                <div className="bg-slate-900 text-white p-4 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="bg-emerald-600 p-1.5 flex-shrink-0">
                            <BarChart3 size={16} />
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-bold uppercase tracking-widest text-xs truncate">
                                Resum de certificació
                            </h3>
                            <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                                {cert?.name}
                                {cert?.approved && <span className="text-emerald-400"> · aprovada</span>}
                                <span className="text-slate-600"> · </span>
                                {cert?.method === 'partial' ? 'mesurament PARCIAL' : 'mesurament A ORIGEN'}
                                {previousCert && (
                                    <>
                                        <span className="text-slate-600"> · </span>
                                        anterior: {previousCert.name}
                                    </>
                                )}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                        {cert?.approved && <Lock size={14} className="text-emerald-400" />}
                        <button onClick={onClose} className="hover:text-red-400 transition-colors">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Totals destacats */}
                <div className="grid grid-cols-2 md:grid-cols-5 border-b border-slate-200 bg-slate-50 flex-shrink-0">
                    {[
                        { label: 'Pressupost', value: formatCurrency(totals.budget), hint: '100%' },
                        { label: 'Anterior', value: formatCurrency(totals.previous), hint: `${formatNumber(totals.previousPct, 1)}%`, swatch: TRAM_ANTERIOR },
                        { label: 'Període', value: formatCurrency(totals.period), hint: `${formatNumber(totals.periodPct, 1)}%`, swatch: TRAM_PERIODE },
                        { label: 'Origen', value: formatCurrency(totals.origin), hint: `${formatNumber(totals.originPct, 1)}%`, strong: true },
                        { label: 'Pendent', value: formatCurrency(totals.pending), hint: `${formatNumber(100 - totals.originPct, 1)}%` },
                    ].map(t => (
                        <div key={t.label} className="p-3 border-r last:border-r-0 border-slate-200 min-w-0">
                            <div className="flex items-center gap-1.5">
                                {t.swatch && (
                                    <span className="w-2 h-2 rounded-[2px] flex-shrink-0" style={{ backgroundColor: t.swatch }} aria-hidden="true" />
                                )}
                                <span className="text-[9px] uppercase font-bold tracking-widest text-slate-400 leading-none truncate">
                                    {t.label}
                                </span>
                            </div>
                            <div className={`font-mono mt-1 truncate ${t.strong ? 'text-sm font-bold text-emerald-700' : 'text-xs font-semibold text-slate-700'}`}>
                                {t.value}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400 leading-none mt-0.5">{t.hint}</div>
                        </div>
                    ))}
                </div>

                {/* Taula per capítols */}
                <div className="overflow-auto flex-1">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-white shadow-sm border-b border-slate-200 text-[9px] uppercase text-slate-400 font-black tracking-widest z-10">
                            <tr>
                                <th className="p-2 md:p-3 text-left w-20">Capítol</th>
                                <th className="p-2 md:p-3 text-left">Descripció</th>
                                <th className="hidden md:table-cell p-3 w-32 text-right">Pressupost</th>
                                <th className="hidden lg:table-cell p-3 w-28 text-right">Anterior</th>
                                <th className="p-2 md:p-3 w-28 text-right">Període</th>
                                <th className="p-2 md:p-3 w-32 text-right bg-emerald-50/60">Origen</th>
                                <th className="p-2 md:p-3 w-16 text-right bg-emerald-50/60">%</th>
                                <th className="hidden md:table-cell p-3 w-32 text-right">Pendent</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.map(row => (
                                <tr key={row.id} className="hover:bg-slate-50">
                                    <td className="p-2 md:p-3 font-mono text-[10px] text-slate-400 align-top">{row.code}</td>
                                    <td className="p-2 md:p-3 align-top min-w-0">
                                        <div className="text-[11px] font-medium text-slate-700 uppercase tracking-tight break-words">
                                            {row.description}
                                        </div>
                                        <div className="mt-1.5 max-w-[220px]">
                                            <MiniMeter previousPct={row.previousPct} periodPct={row.periodPct} />
                                        </div>
                                    </td>
                                    <td className="hidden md:table-cell p-3 text-right font-mono text-[11px] text-slate-500 align-top">
                                        {formatNumber(row.budget, 2)}
                                    </td>
                                    <td className="hidden lg:table-cell p-3 text-right font-mono text-[11px] text-slate-400 align-top">
                                        {row.previous ? formatNumber(row.previous, 2) : '—'}
                                    </td>
                                    <td className={`p-2 md:p-3 text-right font-mono text-[11px] align-top ${row.period ? 'text-slate-700 font-semibold' : 'text-slate-300'}`}>
                                        {row.period ? formatNumber(row.period, 2) : '—'}
                                    </td>
                                    <td className="p-2 md:p-3 text-right font-mono text-[11px] font-bold text-slate-800 bg-emerald-50/40 align-top">
                                        {formatNumber(row.origin, 2)}
                                    </td>
                                    <td className="p-2 md:p-3 text-right font-mono text-[11px] font-bold text-emerald-700 bg-emerald-50/40 align-top">
                                        {formatNumber(row.originPct, 1)}
                                    </td>
                                    <td className="hidden md:table-cell p-3 text-right font-mono text-[11px] text-slate-500 align-top">
                                        {formatNumber(row.pending, 2)}
                                    </td>
                                </tr>
                            ))}
                            {rows.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="p-12 text-center text-xs text-slate-400 italic">
                                        Aquest projecte encara no té capítols.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot className="sticky bottom-0 bg-slate-900 text-white font-bold">
                            <tr className="text-[11px]">
                                <td colSpan={2} className="p-3 text-right uppercase tracking-widest text-[10px]">
                                    Total certificació
                                </td>
                                <td className="hidden md:table-cell p-3 text-right font-mono">{formatNumber(totals.budget, 2)}</td>
                                <td className="hidden lg:table-cell p-3 text-right font-mono text-slate-400">{formatNumber(totals.previous, 2)}</td>
                                <td className="p-3 text-right font-mono">{formatNumber(totals.period, 2)}</td>
                                <td className="p-3 text-right font-mono text-emerald-400">{formatNumber(totals.origin, 2)}</td>
                                <td className="p-3 text-right font-mono text-emerald-400">{formatNumber(totals.originPct, 1)}</td>
                                <td className="hidden md:table-cell p-3 text-right font-mono text-slate-400">{formatNumber(totals.pending, 2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center flex-shrink-0">
                    <p className="text-[10px] text-slate-400 italic">
                        Els imports són PEM, sense despeses generals ni benefici industrial.
                    </p>
                    <button
                        onClick={onClose}
                        className="bg-slate-800 text-white hover:bg-slate-700 px-6 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors"
                    >
                        Tancar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CertificationSummaryModal;
