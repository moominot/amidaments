import { useState, useEffect } from 'react';
import { Layers, ChevronDown, ChevronRight, Calculator, Plus, X, Percent, Save } from 'lucide-react';
import {
    formatCurrency,
    formatNumber,
    round2,
    calcItemTotalQty,
    calcItemCertifiedQty,
    calcItemCertifiedAmount,
    getPreviousCertId
} from '../../utils/calculations';

/**
 * Detall de certificació en el sidebar
 */
const CertificationSidebar = ({
    node,
    activeCertId,
    certifications,
    priceDatabase = {},
    expanded,
    onToggle,
    actions
}) => {
    const [localPercentage, setLocalPercentage] = useState('');

    const activeCert = certifications.find(c => c.id === activeCertId);
    const isApproved = activeCert?.approved;

    const method = activeCert?.method || 'origin';
    const isOriginMethod = method === 'origin';

    const originQty = calcItemCertifiedQty(node, activeCertId, certifications);
    const prevCertId = getPreviousCertId(certifications, activeCertId);
    const prevQty = prevCertId ? calcItemCertifiedQty(node, prevCertId, certifications) : 0;
    const actQty = round2(originQty - prevQty);
    const totalQty = calcItemTotalQty(node) || 1;

    const originAmount = calcItemCertifiedAmount(node, activeCertId, priceDatabase, certifications);
    const prevAmount = prevCertId ? calcItemCertifiedAmount(node, prevCertId, priceDatabase, certifications) : 0;
    const actAmount = round2(originAmount - prevAmount);

    useEffect(() => {
        if (node && activeCertId) {
            const currentPerc = (originQty / totalQty) * 100;
            setLocalPercentage(currentPerc.toFixed(2));
        }
    }, [node, activeCertId, originQty, totalQty]);

    if (!node.unit) return null;

    return (
        <div className={`bg-white border-2 ${isApproved ? 'border-slate-300' : 'border-emerald-500'} rounded shadow-sm overflow-hidden animate-in zoom-in-95 duration-200`}>
            <button
                onClick={onToggle}
                className={`w-full px-3 py-2 ${isApproved ? 'bg-slate-600' : 'bg-emerald-600'} text-white flex items-center justify-between hover:opacity-90 transition-colors`}
            >
                <div className="flex items-center gap-2">
                    <Layers size={12} />
                    <span className="text-[11px] md:text-[10px] font-bold uppercase tracking-wider">
                        Estat d'Execució {isApproved && '(BLOQUEJAT)'}
                    </span>
                </div>
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>

            {expanded && (
                <div className="p-4 space-y-4">
                    {/* Summary of Correlation */}
                    <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2 rounded border border-slate-100">
                        <div className="text-center">
                            <div className="text-[8px] uppercase font-bold text-slate-400">Anterior</div>
                            <div className="text-[10px] font-mono text-slate-600">{formatNumber(prevQty, 2)}</div>
                            <div className="text-[9px] text-slate-400">{formatNumber((prevQty / totalQty) * 100, 1)}%</div>
                        </div>
                        <div className="text-center border-x border-slate-200">
                            <div className="text-[8px] uppercase font-bold text-slate-400">Actual</div>
                            <div className="text-[10px] font-mono text-blue-600 font-bold">{formatNumber(actQty, 2)}</div>
                            <div className="text-[9px] text-slate-400">{formatNumber((actQty / totalQty) * 100, 1)}%</div>
                        </div>
                        <div className="text-center">
                            <div className="text-[8px] uppercase font-bold text-emerald-500">Origen</div>
                            <div className="text-[10px] font-mono text-emerald-700 font-bold">{formatNumber(originQty, 2)}</div>
                            <div className="text-[9px] text-emerald-500">{formatNumber((originQty / totalQty) * 100, 1)}%</div>
                        </div>
                    </div>

                    {/* Total Amount Summary */}
                    <div className={`flex justify-between items-center text-[10px] ${isApproved ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'} p-2 rounded border border-current opacity-80`}>
                        <span className="font-bold uppercase tracking-tighter">Import Certificat {isOriginMethod ? "a l'Origen" : "del Període"}</span>
                        <span className="font-mono font-black">{isOriginMethod ? formatCurrency(originAmount) : formatCurrency(actAmount)}</span>
                    </div>

                    {!isApproved && (
                        <>
                            {/* Quick Actions */}
                            <div className="flex flex-col gap-2">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Accions Ràpides</label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => actions.updateCertificationPercentage(node.id, activeCertId, 25, node)}
                                        className="flex-1 bg-slate-100 hover:bg-emerald-100 text-[10px] font-bold p-2 transition-colors border border-slate-200"
                                    >25%</button>
                                    <button
                                        onClick={() => actions.updateCertificationPercentage(node.id, activeCertId, 50, node)}
                                        className="flex-1 bg-slate-100 hover:bg-emerald-100 text-[10px] font-bold p-2 transition-colors border border-slate-200"
                                    >50%</button>
                                    <button
                                        onClick={() => actions.updateCertificationPercentage(node.id, activeCertId, 100, node)}
                                        className="flex-1 bg-emerald-600 text-white text-[10px] font-bold p-2 transition-colors shadow-lg shadow-emerald-900/40"
                                    >100%</button>
                                </div>
                                <button
                                    onClick={() => actions.copyBudgetToCertification(node.id, activeCertId)}
                                    className="w-full mt-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-bold p-2 transition-colors border border-blue-200 flex items-center justify-center gap-2"
                                >
                                    <Calculator size={12} /> Copiar Amidament Pressupost
                                </button>
                            </div>

                            {/* Percentage Certification (Presto Style) */}
                            <div className="pt-2 border-t border-slate-100">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Certificar per Percentatge (%)</label>
                                <div className="flex items-center gap-3">
                                    <div className="relative flex-1">
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="w-full bg-blue-50 border border-blue-200 p-3 text-lg font-mono font-bold text-blue-700 focus:border-blue-500 outline-none pr-8"
                                            value={localPercentage}
                                            onChange={(e) => setLocalPercentage(e.target.value)}
                                            onBlur={() => actions.updateCertificationPercentage(node.id, activeCertId, localPercentage, node)}
                                            onKeyDown={(e) => e.key === 'Enter' && actions.updateCertificationPercentage(node.id, activeCertId, localPercentage, node)}
                                        />
                                        <Percent size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-300" />
                                    </div>
                                    <button
                                        onClick={() => actions.updateCertificationPercentage(node.id, activeCertId, localPercentage, node)}
                                        className="bg-blue-600 text-white px-3 py-3 rounded hover:bg-blue-500 transition-colors"
                                    >
                                        <Save size={16} />
                                    </button>
                                </div>
                            </div>

                            {/* Manual Quantity Input */}
                            <div className="pt-2 border-t border-slate-100">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">
                                    Quantitat Certificada {isOriginMethod ? "(a Origen)" : "(Parcial Period)"}
                                </label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="number"
                                        className={`flex-1 ${isOriginMethod ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'} p-3 text-lg font-mono font-bold focus:ring-1 outline-none`}
                                        value={isOriginMethod ? originQty : actQty}
                                        onChange={(e) => actions.updateCertificationQty(node.id, activeCertId, e.target.value)}
                                    />
                                    <span className="text-sm font-bold text-slate-400 uppercase">{node.unit}</span>
                                </div>
                                <p className="text-[9px] text-slate-400 mt-2 italic leading-tight">* El valor manual preval sobre el detall d'amidament.</p>
                            </div>

                            {/* Measurement Detail */}
                            <div className="pt-4 border-t border-slate-100">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Detall d'Amidament de Certificació</label>
                                    <button
                                        onClick={() => actions.addCertificationLine(node.id, activeCertId)}
                                        className="bg-emerald-600 text-white p-1 rounded-full hover:bg-emerald-500 transition-colors"
                                    >
                                        <Plus size={12} />
                                    </button>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-[10px] md:text-[11px]">
                                        <thead className="bg-slate-50 border-b border-slate-100 text-[9px] uppercase text-slate-400 font-bold">
                                            <tr>
                                                <th className="p-2 text-left">Ref</th>
                                                <th className="p-2 text-right w-10">Ud</th>
                                                <th className="p-2 text-right w-10">Ll</th>
                                                <th className="p-2 text-right w-10">Am</th>
                                                <th className="p-2 text-right w-10">Al</th>
                                                <th className="p-2 text-right w-12">Parc</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {(node.certifications?.[activeCertId]?.measurements || []).map(m => (
                                                <tr key={m.id} className="group">
                                                    <td className="p-1.5"><input type="text" value={m.description} onChange={(e) => actions.updateCertificationMeasurement(node.id, activeCertId, m.id, 'description', e.target.value)} className="w-full bg-transparent border-none text-slate-600 outline-none p-0" /></td>
                                                    <td className="p-1.5"><input type="number" value={m.units} onChange={(e) => actions.updateCertificationMeasurement(node.id, activeCertId, m.id, 'units', e.target.value)} className="w-full text-right bg-transparent border-none font-mono outline-none p-0" /></td>
                                                    <td className="p-1.5"><input type="number" value={m.length} onChange={(e) => actions.updateCertificationMeasurement(node.id, activeCertId, m.id, 'length', e.target.value)} className="w-full text-right bg-transparent border-none font-mono text-slate-400 outline-none p-0" /></td>
                                                    <td className="p-1.5"><input type="number" value={m.width} onChange={(e) => actions.updateCertificationMeasurement(node.id, activeCertId, m.id, 'width', e.target.value)} className="w-full text-right bg-transparent border-none font-mono text-slate-400 outline-none p-0" /></td>
                                                    <td className="p-1.5"><input type="number" value={m.height} onChange={(e) => actions.updateCertificationMeasurement(node.id, activeCertId, m.id, 'height', e.target.value)} className="w-full text-right bg-transparent border-none font-mono text-slate-400 outline-none p-0" /></td>
                                                    <td className="p-1.5 text-right font-mono font-bold text-emerald-600">
                                                        <div className="flex items-center justify-end gap-1">
                                                            {formatNumber((m.units || 0) * (m.length || 1) * (m.width || 1) * (m.height || 1), 2)}
                                                            <button onClick={() => actions.removeCertificationLine(node.id, activeCertId, m.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-colors"><X size={10} /></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}

                    {isApproved && (
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded text-center space-y-2">
                            <Layers size={32} className="mx-auto text-slate-300" />
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Aquesta fase ha estat aprovada</p>
                            <p className="text-[10px] text-slate-400 italic">No es permeten modificacions en els amidaments d'una fase tancada.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default CertificationSidebar;
