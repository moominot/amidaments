import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Plus,
    FolderPlus,
    FileText,
    Trash2,
    GripVertical,
    ChevronRight,
    ChevronDown,
    Download,
    Upload,
    Calculator,
    Layers,
    Search,
    Settings,
    Info,
    Database,
    MousePointer2,
    Link as LinkIcon,
    AlertCircle,
    ExternalLink,
    FileCode,
    Box,
    Tag,
    List,
    AlignLeft,
    Edit3,
    Printer,
    FileDown,
    X,
    Save,
    FilePlus,
    FolderOpen,
    User,
    FileSpreadsheet,
    Percent
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// --- Utilitats de Format ---
const round2 = (val) => Math.round(((Number(val) || 0) + Number.EPSILON) * 100) / 100; // Minimal error rounding
const formatCurrency = (val) => new Intl.NumberFormat('ca-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val || 0);
const formatNumber = (val, decimals = 2) => Number(val || 0).toLocaleString('ca-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const formatPrice = (val) => formatNumber(val, 2);
const normalizeCode = (code) => code ? code.trim().replace(/#+$/, '') : '';

const numberToTextCatalan = (n) => {
    const units = ['', 'UN', 'DOS', 'TRES', 'QUATRE', 'CINC', 'SIS', 'SET', 'VUIT', 'NOU'];
    const tens = ['', 'DEU', 'VINT', 'TRENTA', 'QUARANTA', 'CINQUANTA', 'SEIXANTA', 'SETANTA', 'VUITANTA', 'NORANTA'];
    const unique = {
        11: 'ONZE', 12: 'DOTZE', 13: 'TRETZE', 14: 'CATORZE', 15: 'QUINZE',
        16: 'SETZE', 17: 'DISSET', 18: 'DIVUIT', 19: 'DINOU'
    };
    const n2t = (num) => {
        if (num === 0) return '';
        if (num < 10) return units[num];
        if (num < 20 && unique[num]) return unique[num];
        if (num < 100) {
            const t = Math.floor(num / 10);
            const u = num % 10;
            if (u === 0) return tens[t];
            if (t === 2) return `VINT-I-${units[u]}`;
            return `${tens[t]}-${units[u]}`;
        }
        if (num < 1000) {
            const h = Math.floor(num / 100);
            const r = num % 100;
            const prefix = h === 1 ? 'CENT' : `${units[h]}-CENTS`;
            if (r === 0) return prefix;
            return `${prefix} ${n2t(r)}`;
        }
        return '';
    };
    const integerPart = Math.floor(n);
    const decimalPart = Math.round((n - integerPart) * 100);
    let result = '';
    const millions = Math.floor(integerPart / 1000000);
    const thousands = Math.floor((integerPart % 1000000) / 1000);
    const units_part = integerPart % 1000;
    if (millions > 0) result += millions === 1 ? 'UN MILIÓ' : `${n2t(millions)} MILIONS`;
    if (thousands > 0) {
        if (result) result += ' ';
        result += thousands === 1 ? 'MIL' : `${n2t(thousands)} MIL`;
    }
    if (units_part > 0 || (millions === 0 && thousands === 0)) {
        if (result) result += ' ';
        result += units_part === 0 && (millions > 0 || thousands > 0) ? '' : (integerPart === 0 ? 'ZERO' : n2t(units_part));
    }
    result += integerPart === 1 ? ' EURO' : ' EUROS';
    if (decimalPart > 0) result += ` AMB ${n2t(decimalPart)} ${decimalPart === 1 ? 'CÈNTIM' : 'CÈNTIMS'}`;
    return result.trim();
};

const flattenBudget = (nodes, level = 0, parentRef = '', counterObj = { val: 0 }, config, calcChapterTotal, calcItemTotalAmount, priceDatabase) => {
    let rows = [];
    nodes.forEach((node) => {
        const isChapter = !node.unit;
        const shouldShowHeader = !isChapter || (level < config.maxLevels);

        if (shouldShowHeader) {
            counterObj.val++;
            const currentRef = parentRef ? `${parentRef}.${counterObj.val}` : `${counterObj.val}`;
            const displayCode = config.useCorrelativeCodes ? currentRef : node.code;
            const totalAmount = isChapter ? calcChapterTotal(node) : calcItemTotalAmount(node);

            if (isChapter) {
                // Chapter Header Row
                rows.push({
                    type: 'chapter',
                    level: level,
                    data: [
                        displayCode,
                        { content: node.description.toUpperCase(), colSpan: 8 },
                        formatNumber(totalAmount, 2)
                    ]
                });

                // Chapter Long Description
                if (config.showLongDesc && node.fullDescription && node.fullDescription !== node.description) {
                    rows.push({
                        type: 'item-long-desc',
                        data: [
                            '',
                            { content: node.fullDescription, colSpan: 9 }
                        ]
                    });
                }

                // Recursive children - New counter for next level
                const children = [...(node.subChapters || []), ...(node.items || [])];
                rows.push(...flattenBudget(children, level + 1, currentRef, { val: 0 }, config, calcChapterTotal, calcItemTotalAmount, priceDatabase));

                // Chapter Footer Total
                rows.push({
                    type: 'chapter-total',
                    level: level,
                    data: [
                        '',
                        { content: `TOTAL ${level === 0 ? 'CAPÍTOL' : 'SUBCAPÍTOL'} ${displayCode} ${node.description} ..........................................................................................`, colSpan: 8 },
                        formatNumber(totalAmount, 2)
                    ]
                });
            } else {
                // Item Header Row
                rows.push({
                    type: 'item',
                    data: [
                        displayCode,
                        { content: `${node.unit} ${node.description}`, colSpan: 9 }
                    ]
                });

                // Long Description Row
                if (config.showLongDesc && node.fullDescription && node.fullDescription !== node.description) {
                    rows.push({
                        type: 'item-long-desc',
                        data: [
                            '',
                            { content: node.fullDescription, colSpan: 9 }
                        ]
                    });
                }

                // Measurement Lines
                if (config.showMeasurements && node.measurements && node.measurements.length > 0) {
                    node.measurements.forEach(m => {
                        rows.push({
                            type: 'measurement',
                            data: [
                                '',
                                `    ${m.description}`,
                                formatNumber(m.units, 0),
                                (m.length > 1 || (m.width === 1 && m.height === 1 && m.length !== 0) ? formatNumber(m.length, 2) : ''),
                                (m.width > 1 ? formatNumber(m.width, 2) : ''),
                                (m.height > 1 ? formatNumber(m.height, 2) : ''),
                                formatNumber(m.units * m.length * m.width * m.height, 2),
                                '', '', ''
                            ]
                        });
                    });

                    // Item Total Row
                    const totalQty = node.measurements.reduce((acc, m) => acc + (m.units * m.length * m.width * m.height), 0);
                    const unitPrice = priceDatabase[normalizeCode(node.code)]?.price ?? node.price;
                    rows.push({
                        type: 'item-total',
                        data: [
                            '', '', '', '', '', '', '',
                            formatNumber(totalQty, 2),
                            formatNumber(unitPrice, 2),
                            formatNumber(totalAmount, 2)
                        ]
                    });
                } else {
                    const totalQty = node.measurements?.reduce((acc, m) => acc + (m.units * m.length * m.width * m.height), 0) || 0;
                    const unitPrice = priceDatabase[normalizeCode(node.code)]?.price ?? node.price;
                    rows.push({
                        type: 'item-total',
                        data: [
                            '', '', '', '', '', '', '',
                            formatNumber(totalQty, 2),
                            formatNumber(unitPrice, 2),
                            formatNumber(totalAmount, 2)
                        ]
                    });
                }
            }
        } else if (isChapter && !shouldShowHeader) {
            // HIDDEN CHAPTER: Bubble up children at the SAME level using SAME counterObj
            const children = [...(node.subChapters || []), ...(node.items || [])];
            rows.push(...flattenBudget(children, level, parentRef, counterObj, config, calcChapterTotal, calcItemTotalAmount, priceDatabase));
        }
    });
    return rows;
};

// --- Component de Vista d'Impressió ---
const PrintView = ({ budget, priceDatabase, calcItemTotalAmount, calcChapterTotal, budgetTotal, config, setConfig, onOpenConfig, onClose, onExportPDF, onExportSummaryPDF, handleExportXLSX }) => {
    const [date] = useState(new Date().toLocaleDateString('ca-ES'));
    const [viewMode, setViewMode] = useState('amidaments'); // 'amidaments' | 'resum'


    const renderPrintNode = (node, level = 0, parentRef = '', counterObj = { val: 0 }) => {
        const isChapter = !node.unit;
        const shouldShowHeader = !isChapter || (level < config.maxLevels);

        let displayCode = node.code;
        let currentRef = parentRef;

        if (shouldShowHeader) {
            counterObj.val++;
            currentRef = parentRef ? `${parentRef}.${counterObj.val}` : `${counterObj.val}`;
            displayCode = config.useCorrelativeCodes ? currentRef : node.code;
        }

        const totalAmount = isChapter ? calcChapterTotal(node) : calcItemTotalAmount(node);
        const totalQty = isChapter ? 0 : (node.measurements?.reduce((acc, m) => acc + (m.units * m.length * m.width * m.height), 0) || 0);
        const unitPrice = isChapter ? 0 : (priceDatabase[normalizeCode(node.code)]?.price ?? node.price);

        return (
            <React.Fragment key={node.id}>
                {shouldShowHeader && (
                    <>
                        {isChapter ? (
                            <tr className={`border-b-2 border-black/20 break-inside-avoid align-bottom ${level === 0 && config.chaptersOnNewPage ? 'break-before-page' : ''}`}>
                                <td className="p-1 px-2 font-bold text-[11px] uppercase" colSpan={9}>
                                    <div className="flex flex-col gap-1">
                                        <span>{level === 0 ? 'CAPÍTOL ' : 'SUBCAPÍTOL '} {displayCode} {node.description}</span>
                                        {config.showLongDesc && node.fullDescription && node.fullDescription !== node.description && (
                                            <div className="text-[9px] text-slate-700 mt-0.5 whitespace-pre-wrap leading-normal font-normal normal-case">
                                                {node.fullDescription}
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="p-1 text-right font-bold text-[11px] font-mono">
                                    {formatNumber(totalAmount, 2)}
                                </td>
                            </tr>
                        ) : (
                            <>
                                {/* Item Main Row */}
                                <tr className="text-[10px] break-inside-avoid-page align-top">
                                    <td className="p-1 px-2 font-mono whitespace-nowrap">{displayCode}</td>
                                    <td className="p-1 px-2 leading-tight" colSpan={9}>
                                        <div className="font-bold flex gap-2">
                                            <span className="min-w-[20px]">{node.unit}</span>
                                            <span>{node.description}</span>
                                        </div>
                                        {config.showLongDesc && node.fullDescription && node.fullDescription !== node.description && (
                                            <div className="text-[9px] text-slate-700 mt-0.5 whitespace-pre-wrap leading-normal font-normal">
                                                {node.fullDescription}
                                            </div>
                                        )}
                                    </td>
                                </tr>

                                {/* Measurement Lines */}
                                {config.showMeasurements && node.measurements && node.measurements.length > 0 && (
                                    <>
                                        {node.measurements.map((m, i) => (
                                            <tr key={i} className="text-[9px] text-slate-600 align-top border-none leading-tight">
                                                <td className="p-1"></td>
                                                <td className="p-0.5 px-4 italic">{m.description}</td>
                                                <td className="p-0.5 text-center font-mono">{formatNumber(m.units, 0)}</td>
                                                <td className="p-0.5 text-right font-mono">{m.length > 1 || (m.width === 1 && m.height === 1 && m.length !== 0) ? formatNumber(m.length, 2) : ''}</td>
                                                <td className="p-0.5 text-right font-mono">{m.width > 1 ? formatNumber(m.width, 2) : ''}</td>
                                                <td className="p-0.5 text-right font-mono">{m.height > 1 ? formatNumber(m.height, 2) : ''}</td>
                                                <td className="p-0.5 text-right font-mono">{formatNumber(m.units * m.length * m.width * m.height, 2)}</td>
                                                <td className="p-0.5" colSpan={3}></td>
                                            </tr>
                                        ))}
                                    </>
                                )}

                                {/* Item Totals Row */}
                                <tr className="text-[10px] align-bottom">
                                    <td colSpan={7}></td>
                                    <td className="border-t border-black/40"></td>
                                    <td className="border-t border-black/40"></td>
                                    <td className="border-t border-black/40"></td>
                                </tr>
                                <tr className="text-[10px] font-bold align-bottom">
                                    <td colSpan={7}></td>
                                    <td className="p-1 text-right font-mono font-bold">{formatNumber(totalQty, 2)}</td>
                                    <td className="p-1 text-right font-mono">{formatNumber(unitPrice, 2)}</td>
                                    <td className="p-1 text-right font-mono">{formatNumber(totalAmount, 2)}</td>
                                </tr>
                                <tr className="h-1">
                                    <td colSpan={10}></td>
                                </tr>

                                {/* Breakdown (if expanded) */}
                                {config.showBreakdown && node.breakdown && node.breakdown.length > 0 && (
                                    <tr>
                                        <td></td>
                                        <td colSpan={9} className="p-2 pt-0">
                                            <table className="w-full text-[8px] bg-slate-50/50 border border-slate-200">
                                                <thead>
                                                    <tr className="bg-slate-100 text-[7px] uppercase tracking-tighter text-slate-500">
                                                        <th className="p-1 text-left">Codi</th>
                                                        <th className="p-1 text-left">Component</th>
                                                        <th className="p-1 text-right">Rend.</th>
                                                        <th className="p-1 text-right">Preu</th>
                                                        <th className="p-1 text-right">Total</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {node.breakdown.map((b, i) => (
                                                        <tr key={i} className="border-t border-slate-100">
                                                            <td className="p-1 font-mono">{b.code}</td>
                                                            <td className="p-1">{b.description}</td>
                                                            <td className="p-1 text-right font-mono">{formatNumber(b.yield, 3)}</td>
                                                            <td className="p-1 text-right font-mono">{formatNumber(b.price, 2)}</td>
                                                            <td className="p-1 text-right font-mono">{formatNumber(b.total, 2)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </td>
                                    </tr>
                                )}
                            </>
                        )}
                    </>
                )}

                {/* Recursive Children - Determine if they bubble up or start fresh counter */}
                {[...(node.subChapters || []), ...(node.items || [])].map((child) => (
                    renderPrintNode(
                        child,
                        isChapter ? (shouldShowHeader ? level + 1 : level) : level + 1,
                        currentRef,
                        isChapter && shouldShowHeader ? { val: 0 } : counterObj
                    )
                ))}

                {/* Chapter Footer Total */}
                {isChapter && shouldShowHeader && (
                    <tr className="text-[10px] font-bold break-inside-avoid">
                        <td colSpan={9} className="p-1 pt-4 text-right pr-4 uppercase italic">
                            <div className="flex items-end gap-2">
                                <span className="whitespace-nowrap">Total {level === 0 ? 'Capítol' : 'Subcapítol'} {displayCode} {node.description}</span>
                                <div className="flex-1 border-b border-dotted border-black mb-1"></div>
                            </div>
                        </td>
                        <td className="p-1 pt-4 text-right font-mono border-t-2 border-black">
                            {formatNumber(totalAmount, 2)}
                        </td>
                    </tr>
                )}
            </React.Fragment>
        );
    };

    return (
        <div className="fixed inset-0 z-[100] bg-white overflow-auto flex flex-col print:relative print:z-0 print:overflow-visible print:h-auto print:bg-transparent print:block">
            <div className="print:hidden bg-slate-900 p-4 flex justify-between items-center text-white border-b border-slate-700 shadow-2xl z-20 gap-6">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-600 p-1.5 rounded-lg">
                        <Printer size={18} />
                    </div>
                    <h2 className="font-bold uppercase tracking-widest text-xs">Ajustaments de Sortida</h2>
                </div>

                <div className="flex items-center gap-6 flex-1 justify-center bg-slate-800/50 p-2 rounded-xl border border-slate-700/50 backdrop-blur-sm">
                    <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-700 mr-4 shadow-inner">
                        <button
                            onClick={() => setViewMode('amidaments')}
                            className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all duration-300 ${viewMode === 'amidaments' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-slate-400 hover:text-white'}`}
                        >
                            Amidaments
                        </button>
                        <button
                            onClick={() => setViewMode('resum')}
                            className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all duration-300 ${viewMode === 'resum' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-slate-400 hover:text-white'}`}
                        >
                            Resum
                        </button>
                    </div>

                    <div className="h-4 w-[1px] bg-slate-700 mx-2"></div>

                    <button
                        onClick={onOpenConfig}
                        className="flex items-center gap-2 px-4 py-1.5 rounded-md text-[10px] font-bold uppercase bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all"
                    >
                        <Settings size={14} className="text-blue-400" />
                        Configuració
                    </button>
                </div>

                <div className="flex gap-3">
                    <button onClick={handleExportXLSX} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-widest flex items-center gap-2 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-emerald-500/25">
                        <FileSpreadsheet size={14} />
                        Excel
                    </button>
                    <button onClick={() => viewMode === 'amidaments' ? onExportPDF(config) : onExportSummaryPDF(config)} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-widest flex items-center gap-2 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-blue-500/25">
                        <FileDown size={14} />
                        Exporta PDF
                    </button>
                    <button onClick={() => window.print()} className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-widest">Imprimir</button>
                    <button onClick={onClose} className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-widest">Tancar</button>
                </div>
            </div>

            <div className="flex-1 bg-gray-100 p-8 print:p-0 print:bg-white print:overflow-visible overflow-auto print:block">
                <div className="max-w-[21cm] mx-auto p-[2cm] print:p-0 print:max-w-none print:mx-0 shadow-2xl print:shadow-none bg-white min-h-[29.7cm]">
                    <div className="mb-10 text-left border-b-2 border-black pb-4">
                        <h1 className="text-2xl font-bold uppercase tracking-tighter">Pressupost i Amidaments</h1>
                        <p className="text-sm font-bold mt-2 uppercase">{budget.name}</p>
                    </div>

                    {viewMode === 'amidaments' ? (
                        <table className="w-full border-collapse">
                            <thead className="border-b-2 border-black text-[9px] uppercase font-bold">
                                <tr className="align-bottom">
                                    <th className="p-1 text-left w-16">Codi</th>
                                    <th className="p-1 text-left">Descripció</th>
                                    <th className="p-1 text-center w-6">Ud</th>
                                    <th className="p-1 text-right w-14">Longitud</th>
                                    <th className="p-1 text-right w-14">Amplada</th>
                                    <th className="p-1 text-right w-14">Alçada</th>
                                    <th className="p-1 text-right w-16">Parcials</th>
                                    <th className="p-1 text-right w-16">Quantitat</th>
                                    <th className="p-1 text-right w-16">Preu</th>
                                    <th className="p-1 text-right w-28">Import</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(() => {
                                    const counter = { val: 0 };
                                    return (budget.chapters || []).map(node => renderPrintNode(node, 0, '', counter));
                                })()}
                            </tbody>
                            <tfoot className="border-t-2 border-black mt-8">
                                <tr className="text-sm font-bold bg-gray-100">
                                    <td colSpan={9} className="p-4 text-right uppercase tracking-widest leading-none">Total Pressupost d'Execució Material</td>
                                    <td className="p-4 text-right font-mono text-lg underline underline-offset-4 decoration-double whitespace-nowrap">{formatCurrency(budgetTotal)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    ) : (
                        <div className="space-y-8">
                            <table className="w-full border-collapse">
                                <thead className="border-b-2 border-black text-[9px] uppercase font-bold">
                                    <tr>
                                        <th className="p-2 text-left w-20">Capítol</th>
                                        <th className="p-2 text-left">Resum</th>
                                        <th className="p-2 text-right w-32">Euros</th>
                                        <th className="p-2 text-right w-20">%</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {budget.chapters.map((ch, index) => {
                                        const total = calcChapterTotal(ch);
                                        const percentage = (total / budgetTotal) * 100;
                                        return (
                                            <tr key={ch.id} className="border-b border-gray-100 text-[10px]">
                                                <td className="p-2 font-bold">{config.useCorrelativeCodes ? (index + 1) : ch.code}</td>
                                                <td className="p-2 uppercase tracking-tighter">{ch.description}</td>
                                                <td className="p-2 text-right font-mono">{formatNumber(total, 2)}</td>
                                                <td className="p-2 text-right font-mono text-gray-500">{formatNumber(percentage, 2)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            <div className="mt-10 space-y-2 flex flex-col items-end pt-4 border-t border-black/10">
                                <div className="flex justify-between w-72 pb-1">
                                    <span className="text-[10px] font-bold uppercase">Total Execució Material</span>
                                    <span className="text-xs font-mono font-bold border-b border-black">{formatNumber(budgetTotal, 2)}</span>
                                </div>
                                {/*  <div className="flex justify-between w-72 pb-1">
                                    <span className="text-[10px] font-bold uppercase">Total Pressupost Contracta</span>
                                    <span className="text-xs font-mono font-bold border-b border-black">{formatNumber(budgetTotal, 2)}</span>
                                </div>
                                <div className="flex justify-between w-72 pb-1">
                                    <span className="text-[10px] font-bold uppercase underline decoration-double">Total Pressupost General</span>
                                    <span className="text-xs font-mono font-bold border-b border-black">{formatNumber(budgetTotal, 2)}</span>
                                </div> */}
                            </div>

                            <div className="mt-12 text-[10px] leading-relaxed border-l-2 border-blue-500 pl-4 py-2 bg-blue-50/30">
                                <p>El pressupost general ascendeix a la quantitat de <span className="font-bold uppercase tracking-tight">{numberToTextCatalan(budgetTotal)}</span></p>
                            </div>

                            <div className="mt-8 text-[10px] text-right font-medium italic text-slate-600">
                                , a {date}
                            </div>

                            <div className="mt-24 grid grid-cols-2 gap-20 text-center">
                                <div className="border-t border-dashed border-slate-300 pt-2">
                                    <p className="text-[9px] font-bold uppercase text-slate-500">La Propietat</p>
                                </div>
                                <div className="border-t border-dashed border-slate-300 pt-2">
                                    <p className="text-[9px] font-bold uppercase text-slate-500">La Direcció Facultativa</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="text-[10px] text-gray-400 italic text-center mt-12 print:fixed print:bottom-4 print:left-0 print:w-full">
                        Generat el {new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </div>
                </div>
            </div>

            <style>{`
                @media print {
                  .print\\:hidden { display: none !important; }
                  .print\\:p-0 { padding: 0 !important; }
                  body { background-color: white; margin: 0; }
                  @page { 
                    size: A4; 
                    margin: 1.5cm;
                    @bottom-center {
                        content: counter(page);
                    }
                  }
                  tr { page-break-inside: avoid; }
                  .break-inside-avoid { page-break-inside: avoid; }
                  .break-before-page { break-before: page; }
                }
                table { table-layout: fixed; }
                td { vertical-align: top; overflow-wrap: break-word; }
            `}</style>
        </div >
    );
};

// --- Modal de Confirmació d'Importació ---
const ImportConfirmModal = ({ code, description, onConfirm, onSkip }) => {
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md">
            <div className="bg-white rounded-none shadow-2xl w-[450px] border border-slate-300 animate-in zoom-in-95 duration-200">
                <div className="bg-amber-600 text-white p-4 flex items-center gap-3">
                    <AlertCircle size={20} />
                    <h3 className="font-bold uppercase tracking-widest text-xs">Codi Duplicat Detectat</h3>
                </div>
                <div className="p-6">
                    <p className="text-sm text-slate-600 mb-4">
                        La partida amb codi <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1">{code}</span> ja existeix al projecte.
                    </p>
                    <div className="bg-slate-50 p-3 border border-slate-200 mb-6 font-medium text-xs text-slate-500 italic">
                        "{description}"
                    </div>
                    <div className="flex flex-col gap-3">
                        <button
                            onClick={onConfirm}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white p-3 text-xs font-bold uppercase tracking-widest flex justify-center items-center gap-2 transition-colors"
                        >
                            <Plus size={16} /> Afegir com a partida nova (amb sufix)
                        </button>
                        <button
                            onClick={onSkip}
                            className="w-full bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 p-3 text-xs font-bold uppercase tracking-widest flex justify-center items-center gap-2 transition-colors"
                        >
                            <ChevronRight size={16} /> Mantenir existent i mostrar capítol
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Modal d'Ajust de PEM ---
const PemAdjustmentModal = ({ currentPem, onAdjust, onClose }) => {
    const [targetPem, setTargetPem] = useState(currentPem);
    const [percentage, setPercentage] = useState(0);

    const handlePercentageChange = (val) => {
        setPercentage(val);
        const factor = 1 + (val / 100);
        setTargetPem(currentPem * factor);
    };

    const handleTargetChange = (val) => {
        setTargetPem(val);
        const perc = currentPem === 0 ? 0 : ((val / currentPem) - 1) * 100;
        setPercentage(perc);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md">
            <div className="bg-white rounded-none shadow-2xl w-[450px] border border-slate-300 animate-in zoom-in-95 duration-200 overflow-hidden">
                <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
                    <h3 className="font-bold uppercase tracking-widest text-xs flex items-center gap-2">
                        <Calculator size={14} className="text-blue-400" /> Ajust de PEM Consolidat
                    </h3>
                    <button onClick={onClose} className="hover:text-blue-400 transition-colors"><X size={18} /></button>
                </div>

                <div className="p-8 space-y-8">
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest text-center">PEM Actual</label>
                        <div className="text-3xl font-mono font-bold text-slate-300 text-center opacity-50">
                            {new Intl.NumberFormat('ca-ES', { style: 'currency', currency: 'EUR' }).format(currentPem)}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-8 py-4 border-y border-slate-100">
                        <div className="space-y-2">
                            <label className="text-[10px] uppercase font-black text-slate-500 tracking-widest text-center block">Variació %</label>
                            <div className="relative">
                                <input
                                    className="w-full text-center bg-slate-50 border border-slate-200 p-4 text-xl font-mono focus:border-blue-500 outline-none font-bold"
                                    type="number"
                                    step="0.1"
                                    value={percentage.toFixed(2)}
                                    onChange={(e) => handlePercentageChange(parseFloat(e.target.value) || 0)}
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 font-bold">%</span>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] uppercase font-black text-slate-500 tracking-widest text-center block">PEM Objectiu</label>
                            <div className="relative">
                                <input
                                    className="w-full text-center bg-blue-50 border border-blue-200 p-4 text-xl font-mono focus:border-blue-600 outline-none font-bold text-blue-700"
                                    type="number"
                                    step="0.01"
                                    value={targetPem.toFixed(2)}
                                    onChange={(e) => handleTargetChange(parseFloat(e.target.value) || 0)}
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-300 font-bold">€</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-amber-50 border border-amber-100 p-4">
                        <p className="text-[10px] text-amber-700 font-medium italic leading-tight uppercase tracking-tighter">
                            * Aquesta acció modificarà tots els preus unitaris del projecte (excepte percentatges de costos directes) per assolir el total desitjat.
                        </p>
                    </div>

                    <div className="flex gap-4">
                        <button
                            onClick={onClose}
                            className="flex-1 bg-white border border-slate-200 p-4 text-xs font-bold uppercase tracking-widest hover:bg-slate-50 transition-colors"
                        >
                            Cancel·lar
                        </button>
                        <button
                            onClick={() => { onAdjust(targetPem); onClose(); }}
                            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white p-4 text-xs font-bold uppercase tracking-widest shadow-xl shadow-blue-500/20 transition-all active:scale-95"
                        >
                            Aplicar Ajust
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Modal de Configuració d'Exportació de Resum ---
const PrintConfigModal = ({ config, setConfig, onClose, viewMode }) => {
    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-md">
            <div className="bg-white rounded-none shadow-2xl w-[500px] border border-slate-300 animate-in zoom-in-95 duration-200">
                <div className="bg-slate-800 text-white p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Settings size={18} className="text-blue-400" />
                        <h3 className="font-bold uppercase tracking-widest text-xs">Configuració d'Impressió i Exportació</h3>
                    </div>
                    <button onClick={onClose} className="hover:text-red-400 transition-colors"><X size={18} /></button>
                </div>

                <div className="p-6 space-y-8 max-h-[80vh] overflow-auto">
                    {/* Measurement View Settings */}
                    <div className="space-y-4">
                        <p className="text-[11px] text-blue-600 uppercase font-bold tracking-wider border-b border-blue-100 pb-2">Vista d'Amidaments (Detall)</p>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex items-center justify-between">
                                <label className="text-xs text-slate-600">Nivells de Jerarquia</label>
                                <input
                                    type="number" min="1" max="10"
                                    value={config.maxLevels}
                                    onChange={e => setConfig({ ...config, maxLevels: parseInt(e.target.value) || 1 })}
                                    className="w-12 border border-slate-300 rounded p-1 text-xs text-center"
                                />
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={config.showLongDesc} onChange={e => setConfig({ ...config, showLongDesc: e.target.checked })} />
                                <span className="text-xs text-slate-600">Descripció Llarga</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={config.showMeasurements} onChange={e => setConfig({ ...config, showMeasurements: e.target.checked })} />
                                <span className="text-xs text-slate-600">Mostrar Amidaments</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={config.showBreakdown} onChange={e => setConfig({ ...config, showBreakdown: e.target.checked })} />
                                <span className="text-xs text-slate-600">Mostrar Descomposts</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={config.useCorrelativeCodes} onChange={e => setConfig({ ...config, useCorrelativeCodes: e.target.checked })} />
                                <span className="text-xs text-slate-600">Codis Correlatius (1.1, 1.1.2...)</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={config.chaptersOnNewPage} onChange={e => setConfig({ ...config, chaptersOnNewPage: e.target.checked })} />
                                <span className="text-xs text-slate-600">Cada capítol en pàgina nova</span>
                            </label>
                        </div>
                    </div>

                    {/* Summary / Budget Settings */}
                    <div className="space-y-4">
                        <p className="text-[11px] text-emerald-600 uppercase font-bold tracking-wider border-b border-emerald-100 pb-2">Pressupost General (Resum i Totals)</p>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between group">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={config.ge.enabled} onChange={e => setConfig({ ...config, ge: { ...config.ge, enabled: e.target.checked } })} />
                                    <span className="text-xs text-slate-600">Despeses Generals (G.G.)</span>
                                </label>
                                <div className="flex items-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                                    <input
                                        type="number" step="0.01"
                                        value={config.ge.percentage}
                                        onChange={e => setConfig({ ...config, ge: { ...config.ge, percentage: parseFloat(e.target.value) || 0 } })}
                                        className="w-16 border border-slate-300 rounded p-1 text-xs text-right"
                                    />
                                    <span className="text-[10px] text-slate-400 font-bold">%</span>
                                </div>
                            </div>

                            <div className="flex items-center justify-between group">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={config.ip.enabled} onChange={e => setConfig({ ...config, ip: { ...config.ip, enabled: e.target.checked } })} />
                                    <span className="text-xs text-slate-600">Benefici Industrial (B.I.)</span>
                                </label>
                                <div className="flex items-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                                    <input
                                        type="number" step="0.01"
                                        value={config.ip.percentage}
                                        onChange={e => setConfig({ ...config, ip: { ...config.ip, percentage: parseFloat(e.target.value) || 0 } })}
                                        className="w-16 border border-slate-300 rounded p-1 text-xs text-right"
                                    />
                                    <span className="text-[10px] text-slate-400 font-bold">%</span>
                                </div>
                            </div>

                            <div className="flex items-center justify-between group">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={config.iva.enabled} onChange={e => setConfig({ ...config, iva: { ...config.iva, enabled: e.target.checked } })} />
                                    <span className="text-xs text-slate-600">I.V.A.</span>
                                </label>
                                <div className="flex items-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                                    <input
                                        type="number" step="0.01"
                                        value={config.iva.percentage}
                                        onChange={e => setConfig({ ...config, iva: { ...config.iva, percentage: parseFloat(e.target.value) || 0 } })}
                                        className="w-16 border border-slate-300 rounded p-1 text-xs text-right"
                                    />
                                    <span className="text-[10px] text-slate-400 font-bold">%</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end">
                        <button
                            onClick={onClose}
                            className="bg-slate-800 text-white hover:bg-slate-700 px-8 py-3 text-xs font-bold uppercase tracking-widest transition-colors shadow-lg shadow-slate-900/20"
                        >
                            D'acord
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Modal Creador de Partides ---
const ItemCreator = ({ onClose, onSave, parentId, parentCode }) => {
    const [mode, setMode] = useState('item'); // 'item' | 'chapter'
    const [target, setTarget] = useState(parentId ? 'child' : 'root'); // 'root' | 'child'
    const [data, setData] = useState({
        code: '',
        description: '',
        unit: 'm2',
        price: 0
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        // If target is root, pass null as parentId
        onSave({ ...data, type: mode }, target === 'root' ? null : parentId);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-none shadow-2xl w-[500px] border border-slate-200 animate-in zoom-in-95 duration-200">
                <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
                    <h3 className="font-bold uppercase tracking-widest text-xs flex items-center gap-2">
                        <FolderPlus size={14} className="text-blue-400" /> Nova Entrada
                    </h3>
                    <button onClick={onClose}><X size={16} /></button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
                    {parentCode && (
                        <div className="flex gap-4 mb-2">
                            <label className={`flex items-center gap-2 text-xs font-bold uppercase cursor-pointer p-2 border ${target === 'child' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-slate-200 text-slate-400'}`}>
                                <input type="radio" name="target" checked={target === 'child'} onChange={() => setTarget('child')} className="accent-blue-600" />
                                Dins de {parentCode}
                            </label>
                            <label className={`flex items-center gap-2 text-xs font-bold uppercase cursor-pointer p-2 border ${target === 'root' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-slate-200 text-slate-400'}`}>
                                <input type="radio" name="target" checked={target === 'root'} onChange={() => setTarget('root')} className="accent-blue-600" />
                                A l'Arrel del Projecte
                            </label>
                        </div>
                    )}

                    <div className="flex gap-4 p-1 bg-slate-100 border border-slate-200 w-fit">
                        <button
                            type="button"
                            onClick={() => setMode('item')}
                            className={`px-4 py-1 text-[10px] uppercase font-bold tracking-widest transition-all ${mode === 'item' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            Partida (Fulla)
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode('chapter')}
                            className={`px-4 py-1 text-[10px] uppercase font-bold tracking-widest transition-all ${mode === 'chapter' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            Capítol (Branca)
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-slate-400">Codi</label>
                            <input
                                required
                                className="w-full bg-slate-50 border border-slate-200 p-2 text-xs font-mono focus:border-blue-500 outline-none"
                                value={data.code}
                                onChange={e => setData({ ...data, code: e.target.value })}
                                placeholder="EX: 01.01"
                            />
                        </div>
                        {mode === 'item' && (
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-slate-400">Unitat</label>
                                <input
                                    className="w-full bg-slate-50 border border-slate-200 p-2 text-xs font-mono focus:border-blue-500 outline-none"
                                    value={data.unit}
                                    onChange={e => setData({ ...data, unit: e.target.value })}
                                    placeholder="m2, u, kg..."
                                />
                            </div>
                        )}
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-slate-400">Descripció</label>
                        <textarea
                            required
                            className="w-full bg-slate-50 border border-slate-200 p-2 text-xs focus:border-blue-500 outline-none h-24 resize-none"
                            value={data.description}
                            onChange={e => setData({ ...data, description: e.target.value })}
                            placeholder="Descripció breu..."
                        />
                    </div>

                    {mode === 'item' && (
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-slate-400">Preu Unitari Estimat (€)</label>
                            <input
                                type="number"
                                step="0.01"
                                className="w-full bg-slate-50 border border-slate-200 p-2 text-xs font-mono focus:border-blue-500 outline-none font-bold text-blue-600"
                                value={data.price}
                                onChange={e => setData({ ...data, price: e.target.value })}
                            />
                        </div>
                    )}

                    <button type="submit" className="mt-4 bg-blue-600 hover:bg-blue-500 text-white p-3 text-xs font-bold uppercase tracking-widest flex justify-center items-center gap-2 transition-colors">
                        <Plus size={16} /> Crear {mode === 'item' ? 'Partida' : 'Capítol'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default function App() {
    const [budget, setBudget] = useState(() => {
        const saved = localStorage.getItem('amidaments_budget');
        try {
            return saved ? JSON.parse(saved) : { id: '1', name: 'Projecte BC3', chapters: [] };
        } catch (e) {
            console.error("Error parsing saved budget", e);
            return { id: '1', name: 'Projecte BC3', chapters: [] };
        }
    });

    const [priceDatabase, setPriceDatabase] = useState(() => {
        const saved = localStorage.getItem('amidaments_prices');
        try {
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            console.error("Error parsing saved prices", e);
            return {};
        }
    });

    const [lastSaved, setLastSaved] = useState(null);

    // Auto-save effect
    useEffect(() => {
        const timer = setTimeout(() => {
            localStorage.setItem('amidaments_budget', JSON.stringify(budget));
            localStorage.setItem('amidaments_prices', JSON.stringify(priceDatabase));
            setLastSaved(new Date());
        }, 1000);
        return () => clearTimeout(timer);
    }, [budget, priceDatabase]);

    useEffect(() => {
        const handleBeforeUnload = () => {
            localStorage.setItem('amidaments_budget', JSON.stringify(budget));
            localStorage.setItem('amidaments_prices', JSON.stringify(priceDatabase));
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [budget, priceDatabase]);
    const [activeTab, setActiveTab] = useState('editor');
    const [selectedId, setSelectedId] = useState(null);
    const [showJustification, setShowJustification] = useState({});
    const [expandedChapters, setExpandedChapters] = useState({});
    const [isDragging, setIsDragging] = useState(false);
    const [showCreator, setShowCreator] = useState(false);
    const [showPrintConfigModal, setShowPrintConfigModal] = useState(false);
    const [printConfig, setPrintConfig] = useState({
        maxLevels: 5,
        showLongDesc: true,
        showBreakdown: false,
        showMeasurements: true,
        useCorrelativeCodes: true,
        chaptersOnNewPage: true,
        ge: { enabled: false, percentage: 13 },
        ip: { enabled: false, percentage: 6 },
        iva: { enabled: false, percentage: 21 }
    });
    const [showPrint, setShowPrint] = useState(false);
    const [showPemModal, setShowPemModal] = useState(false);
    const [importPending, setImportPending] = useState(null);
    const [notification, setNotification] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [showSaveDropdown, setShowSaveDropdown] = useState(false);

    // Reordering State
    const [draggedNodeId, setDraggedNodeId] = useState(null);
    const [dragOverTarget, setDragOverTarget] = useState(null); // { id, position: 'before' | 'after' }

    // Sidebar state
    const [sidebarWidth, setSidebarWidth] = useState(450);
    const [expandedSidebarSections, setExpandedSidebarSections] = useState({
        title: true,
        description: true,
        measurements: true,
        justification: true
    });

    const isResizing = React.useRef(false);

    const startResizing = useCallback(() => {
        isResizing.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, []);

    const stopResizing = useCallback(() => {
        isResizing.current = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
    }, []);

    const resize = useCallback((e) => {
        if (!isResizing.current) return;
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth > 300 && newWidth < 800) {
            setSidebarWidth(newWidth);
        }
    }, []);

    useEffect(() => {
        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResizing);
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [resize, stopResizing]);

    const toggleSidebarSection = (section) => {
        setExpandedSidebarSections(prev => ({ ...prev, [section]: !prev[section] }));
    };
    const notify = (msg, type = 'info') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 5000);
    };


    // --- Lògica de Càlcul ---
    const calcMeasureTotal = (m) => round2((m.units || 0) * (m.length || 1) * (m.width || 1) * (m.height || 1));
    const calcItemTotalQty = (item) => {
        if (!item.measurements || item.measurements.length === 0) return 0;

        let subtotal = 0;
        item.measurements.forEach(m => {
            if (!m.isIncrement) {
                subtotal += calcMeasureTotal(m);
            }
        });

        const incrementTotal = item.measurements
            .filter(m => m.isIncrement)
            .reduce((acc, m) => {
                const percentage = parseFloat(m.units) || 0;
                return acc + (subtotal * (percentage / 100));
            }, 0);

        return round2(subtotal + incrementTotal);
    };

    // --- Helper de Categories ---
    const getComponentCategory = (code) => {
        if (!code) return 'directCost';
        const c = code.toLowerCase();
        if (c.startsWith('mo')) return 'labor';
        if (c.startsWith('mt') || c.startsWith('mq')) return 'material';
        if (c.includes('%')) return 'percent';
        return 'directCost';
    };

    const getItemUnitPrice = useCallback((item) => {
        // Dynamic re-calc based on current priceDatabase
        if (item.breakdown && item.breakdown.length > 0) {
            // 1. Calculate Base (Labor + Material + Direct Costs, excluding other percents)
            let baseTotal = 0;
            item.breakdown.forEach(line => {
                const cat = getComponentCategory(line.code);
                if (cat !== 'percent') {
                    const dbPrice = priceDatabase[normalizeCode(line.code)]?.price;
                    const unitPrice = dbPrice !== undefined ? dbPrice : (line.price || 0);
                    baseTotal = round2(baseTotal + round2(unitPrice * (line.yield || 0)));
                }
            });
            baseTotal = round2(baseTotal);

            // 2. Sum everything, handling % specifically
            return round2(item.breakdown.reduce((acc, line) => {
                const cat = getComponentCategory(line.code);

                if (cat === 'percent') {
                    const percentage = line.yield || 0;
                    const lineTotal = round2(baseTotal * (percentage / 100));
                    return acc + lineTotal;
                }

                const dbPrice = priceDatabase[normalizeCode(line.code)]?.price;
                const unitPrice = dbPrice !== undefined ? dbPrice : (line.price || 0);
                return acc + round2(unitPrice * (line.yield || 0));
            }, 0));
        }
        const code = normalizeCode(item.code);
        return priceDatabase[code]?.price ?? item.price ?? 0;
    }, [priceDatabase]);

    const calcItemTotalAmount = useCallback((item) => {
        const qty = calcItemTotalQty(item);
        const unitPrice = getItemUnitPrice(item);
        const total = qty * unitPrice;
        // Divide by 100 only if unit is '%' AND it's a simple item (no breakdown)
        // If it has breakdown, the price is calculated from components which are already correct.
        const isSimplePercent = item.unit === '%' && (!item.breakdown || item.breakdown.length === 0);
        return round2(isSimplePercent ? total / 100 : total);
    }, [getItemUnitPrice]);

    const calcChapterTotal = useCallback((chapter) => {
        const itemsTotal = (chapter.items || []).reduce((acc, item) => acc + calcItemTotalAmount(item), 0);
        const subChaptersTotal = (chapter.subChapters || []).reduce((acc, sub) => acc + calcChapterTotal(sub), 0);
        return itemsTotal + subChaptersTotal;
    }, [calcItemTotalAmount]);

    const budgetTotal = useMemo(() => {
        return budget.chapters.reduce((acc, ch) => acc + calcChapterTotal(ch), 0);
    }, [budget.chapters, calcChapterTotal]);

    const handleExportPDF = useCallback((config) => {
        const doc = new jsPDF('p', 'mm', 'a4');
        const counter = { val: 0 };
        const date = new Date().toLocaleDateString('ca-ES');

        const generateTableForNodes = (nodes, isFirst, currentCounter) => {
            const rows = flattenBudget(nodes, 0, '', currentCounter, config, calcChapterTotal, calcItemTotalAmount, priceDatabase);

            autoTable(doc, {
                head: [[
                    'Codi',
                    'Descripció',
                    { content: 'Ud', styles: { halign: 'center' } },
                    { content: 'Long.', styles: { halign: 'right' } },
                    { content: 'Ampl.', styles: { halign: 'right' } },
                    { content: 'Alç.', styles: { halign: 'right' } },
                    { content: 'Parc.', styles: { halign: 'right' } },
                    { content: 'Quant.', styles: { halign: 'right' } },
                    { content: 'Preu', styles: { halign: 'right' } },
                    { content: 'Import', styles: { halign: 'right' } }
                ]],
                body: rows.map(r => r.data),
                startY: (isFirst ? 30 : 25),
                margin: { top: 30 },
                theme: 'plain',
                styles: { fontSize: 9, cellPadding: 1.5, overflow: 'linebreak', cellWidth: 'wrap', lineWidth: 0, valign: 'top', font: 'helvetica' },
                headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: { bottom: 0.5 }, lineColor: [0, 0, 0], fontSize: 8 },
                columnStyles: {
                    0: { cellWidth: 18, fontStyle: 'bold' },
                    1: { cellWidth: 'auto' },
                    2: { cellWidth: 10, halign: 'center' },
                    3: { cellWidth: 14, halign: 'right' },
                    4: { cellWidth: 14, halign: 'right' },
                    5: { cellWidth: 14, halign: 'right' },
                    6: { cellWidth: 16, halign: 'right' },
                    7: { cellWidth: 18, halign: 'right' },
                    8: { cellWidth: 18, halign: 'right' },
                    9: { cellWidth: 26, halign: 'right' }
                },
                didDrawPage: (data) => {
                    const pageNum = doc.internal.getNumberOfPages();
                    if (pageNum === 1) {
                        doc.setFontSize(16);
                        doc.setFont('helvetica', 'bold');
                        doc.text('PRESSUPOST I AMIDAMENTS', 14, 15);
                    }
                    doc.setFontSize(10);
                    doc.setFont('helvetica', 'bold');
                    doc.text(budget.name.toUpperCase(), 14, (pageNum === 1 ? 20 : 15));
                    doc.setLineWidth(0.5);
                    doc.line(14, (pageNum === 1 ? 22 : 17), 196, (pageNum === 1 ? 22 : 17));
                    const str = `Pàgina ${pageNum}`;
                    doc.setFontSize(8);
                    doc.setFont('helvetica', 'italic');
                    doc.text(str, 196, 285, { align: 'right' });
                    doc.text(date, 14, 285);
                },
                didParseCell: (data) => {
                    const rowIndex = data.row.index;
                    const rowObj = rows[rowIndex];
                    if (!rowObj) return;

                    if (rowObj.type === 'chapter') {
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.lineWidth = { bottom: 0.2 };
                        data.cell.styles.lineColor = [0, 0, 0];
                    }
                    if (rowObj.type === 'chapter-total') {
                        data.cell.styles.fontStyle = 'bolditalic';
                        data.cell.styles.fontSize = 8.5;
                        if (data.column.index === 9 || (data.cell.colSpan > 1 && data.column.index === 1)) {
                            if (data.column.index === 9) {
                                data.cell.styles.lineWidth = { top: 0.5 };
                                data.cell.styles.lineColor = [0, 0, 0];
                            }
                        }
                    }
                    if (rowObj.type === 'item') {
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.cellPadding = { top: 3, bottom: 1, left: 1.5, right: 1.5 };
                    }
                    if (rowObj.type === 'item-long-desc') {
                        data.cell.styles.fontStyle = 'normal';
                        data.cell.styles.fontSize = 8.5;
                        data.cell.styles.cellPadding = { top: 0, bottom: 2, left: 1.5, right: 1.5 };
                        data.cell.styles.textColor = [50, 50, 50];
                    }
                    if (rowObj.type === 'measurement') {
                        data.cell.styles.fontSize = 8;
                        data.cell.styles.textColor = [80, 80, 80];
                        data.cell.styles.fontStyle = 'italic';
                        data.cell.styles.cellPadding = { top: 0.5, bottom: 0.5, left: 1.5, right: 1.5 };
                    }
                    if (rowObj.type === 'item-total') {
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.cellPadding = { top: 1.5, bottom: 3, left: 1.5, right: 1.5 };
                        if (data.column.index >= 7) {
                            data.cell.styles.lineWidth = { top: 0.2 };
                            data.cell.styles.lineColor = [150, 150, 150];
                        }
                    }
                }
            });
        };

        if (config.chaptersOnNewPage) {
            budget.chapters.forEach((ch, idx) => {
                if (idx > 0) doc.addPage();
                generateTableForNodes([ch], idx === 0, counter);
            });
        } else {
            generateTableForNodes(budget.chapters, true, counter);
        }

        let finalY = doc.lastAutoTable.finalY + 10;
        if (finalY > 270) {
            doc.addPage();
            finalY = 30;
        }

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(245, 245, 245);
        doc.rect(14, finalY - 7, 182, 14, 'F');
        doc.text("TOTAL PRESSUPOST D'EXECUCIÓ MATERIAL", 150, finalY + 2, { align: 'right' });
        doc.setFontSize(13);
        doc.text(formatCurrency(budgetTotal), 196, finalY + 2, { align: 'right' });

        finalY += 15;
        if (finalY > 270) { doc.addPage(); finalY = 50; }
        doc.setFont('helvetica', 'bold');
        doc.text('LA PROPIETAT', 55, finalY, { align: 'center' });
        doc.text('LA DIRECCIÓ FACULTATIVA', 155, finalY, { align: 'center' });

        doc.save(`Amidaments_${budget.name}.pdf`);
    }, [budget, priceDatabase, calcItemTotalAmount, calcChapterTotal, budgetTotal]);

    const handleExportSummaryPDF = useCallback((config) => {
        const doc = new jsPDF('p', 'mm', 'a4');
        const PEMValue = budgetTotal;
        const date = new Date().toLocaleDateString('ca-ES');

        const GE = config.ge.enabled ? PEMValue * (config.ge.percentage / 100) : 0;
        const IP = config.ip.enabled ? PEMValue * (config.ip.percentage / 100) : 0;
        const PECValue = PEMValue + GE + IP;
        const VAT = config.iva.enabled ? PECValue * (config.iva.percentage / 100) : 0;
        const PVValue = PECValue + VAT;

        const rows = budget.chapters.map((ch, index) => {
            const total = calcChapterTotal(ch);
            const percentage = (total / PEMValue) * 100;
            return [
                config.useCorrelativeCodes ? (index + 1).toString() : ch.code,
                ch.description.toUpperCase(),
                formatNumber(total, 2),
                formatNumber(percentage, 2)
            ];
        });

        autoTable(doc, {
            head: [['CAPÍTOL', 'RESUM', { content: 'EUROS', styles: { halign: 'right' } }, { content: '%', styles: { halign: 'right' } }]],
            body: rows,
            startY: 40,
            theme: 'plain',
            styles: { fontSize: 9, cellPadding: 1, font: 'helvetica' },
            headStyles: { fontStyle: 'bold', lineWidth: { bottom: 0.5 }, lineColor: [0, 0, 0] },
            columnStyles: {
                0: { cellWidth: 20 },
                1: { cellWidth: 'auto' },
                2: { cellWidth: 30, halign: 'right' },
                3: { cellWidth: 20, halign: 'right' }
            },
            didDrawPage: (data) => {
                const pageNum = doc.internal.getNumberOfPages();
                if (pageNum === 1) {
                    doc.setFontSize(16);
                    doc.setFont('helvetica', 'bold');
                    doc.text('RESUM DE PRESSUPOST', 14, 20);
                    doc.setFontSize(10);
                    doc.text(budget.name.toUpperCase(), 14, 28);
                    doc.setLineWidth(0.5);
                    doc.line(14, 32, 196, 32);
                }
                const pageStr = `Pàgina ${pageNum}`;
                doc.setFontSize(8);
                doc.setFont('helvetica', 'italic');
                doc.text(pageStr, 196, 285, { align: 'right' });
            }
        });

        let finalY = doc.lastAutoTable.finalY + 15;
        if (finalY > 220) { doc.addPage(); finalY = 30; }

        const drawTotalLine = (label, value, y) => {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.text(label, 150, y, { align: 'right' });
            doc.text(formatNumber(value, 2), 196, y, { align: 'right' });
            doc.setLineWidth(0.2);
            doc.line(155, y + 1, 196, y + 1);
        };

        drawTotalLine('TOTAL EXECUCIÓ MATERIAL', PEMValue, finalY);

        let currentOffset = 8;
        if (config.ge.enabled) {
            drawTotalLine(`${config.ge.percentage.toFixed(2)} % DESPESES GENERALS`, GE, finalY + currentOffset);
            currentOffset += 8;
        }
        if (config.ip.enabled) {
            drawTotalLine(`${config.ip.percentage.toFixed(2)} % BENEFICI INDUSTRIAL`, IP, finalY + currentOffset);
            currentOffset += 8;
        }
        if (config.ge.enabled || config.ip.enabled) {
            drawTotalLine('TOTAL PRESSUPOST CONTRACTA (PEC)', PECValue, finalY + currentOffset);
            currentOffset += 8;
        }
        if (config.iva.enabled) {
            drawTotalLine(`${config.iva.percentage.toFixed(2)} % I.V.A.`, VAT, finalY + currentOffset);
            currentOffset += 8;
        }
        if (config.ge.enabled || config.ip.enabled || config.iva.enabled) {
            drawTotalLine('TOTAL PRESSUPOST GENERAL', PVValue, finalY + currentOffset);
            currentOffset += 8;
        }

        finalY += currentOffset + 8;
        if (finalY > 250) { doc.addPage(); finalY = 30; }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const verbalText = `El pressupost general ascendeix a la quantitat de ${numberToTextCatalan(PVValue)}`;
        const splitText = doc.splitTextToSize(verbalText, 180);
        doc.text(splitText, 14, finalY);

        finalY += 15;
        doc.text(`, a ${date}`, 120, finalY);

        doc.save(`${budget.name}_resum.pdf`);
    }, [budget, calcChapterTotal, budgetTotal]);

    const handleExportXLSX = useCallback(() => {
        const wb = XLSX.utils.book_new();

        const createWorksheetData = (nodes) => {
            const data = [];
            data.push(['CODI', 'DESCRIPCIÓ', 'UD', 'LONGITUD', 'AMPLADA', 'ALÇADA', 'PARCIALS', 'QUANTITAT', 'PREU', 'IMPORT']);
            let rowAcc = 2;

            const pushNodes = (ns) => {
                ns.forEach(node => {
                    const isChapter = !node.unit;
                    const totalAmount = isChapter ? calcChapterTotal(node) : calcItemTotalAmount(node);

                    if (isChapter) {
                        data.push([node.code, node.description.toUpperCase(), '', '', '', '', '', '', '', totalAmount]);
                        rowAcc++;

                        if (printConfig.showLongDesc && node.fullDescription && node.fullDescription !== node.description) {
                            data.push(['', node.fullDescription, '', '', '', '', '', '', '', '']);
                            rowAcc++;
                        }

                        if (node.subChapters) pushNodes(node.subChapters);
                        if (node.items) pushNodes(node.items);
                    } else {
                        data.push([node.code, node.description, node.unit, '', '', '', '', '', '', '']);
                        rowAcc++;

                        if (printConfig.showLongDesc && node.fullDescription && node.fullDescription !== node.description) {
                            data.push(['', node.fullDescription, '', '', '', '', '', '', '', '']);
                            rowAcc++;
                        }

                        let mStart = rowAcc;
                        if (node.measurements && node.measurements.length > 0) {
                            node.measurements.forEach(m => {
                                const f = { f: `C${rowAcc}*D${rowAcc}*E${rowAcc}*F${rowAcc}` };
                                data.push(['', `  ${m.description}`, m.units, m.length, m.width, m.height, f, '', '', '']);
                                rowAcc++;
                            });
                        }
                        let mEnd = rowAcc - 1;

                        const price = round2(priceDatabase[normalizeCode(node.code)]?.price ?? node.price);
                        const qtyF = node.measurements?.length > 0 ? { f: `ROUND(SUM(G${mStart}:G${mEnd}), 2)` } : 0;
                        const amountF = { f: `ROUND(H${rowAcc}*I${rowAcc}, 2)` };

                        data.push(['', '', '', '', '', '', '', qtyF, price, amountF]);
                        rowAcc++;
                    }
                });
            };

            pushNodes(nodes);
            const ws = XLSX.utils.aoa_to_sheet(data);
            ws['!cols'] = [{ wch: 15 }, { wch: 60 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }];
            return ws;
        };

        if (printConfig.chaptersOnNewPage) {
            // 1. Create Summary Sheet
            const summaryData = [['CODI', 'DESCRIPCIÓ', 'IMPORT']];
            budget.chapters.forEach(ch => {
                summaryData.push([ch.code, ch.description.toUpperCase(), calcChapterTotal(ch)]);
            });
            const wsResum = XLSX.utils.aoa_to_sheet(summaryData);
            wsResum['!cols'] = [{ wch: 15 }, { wch: 60 }, { wch: 15 }];
            XLSX.utils.book_append_sheet(wb, wsResum, "Resum");

            // 2. Create Sheet for each Top Chapter
            budget.chapters.forEach((ch, idx) => {
                const ws = createWorksheetData([ch]);
                // Sheet name derived from code or Index to be safe
                const name = (ch.code || `Cap ${idx + 1}`).substring(0, 31).replace(/[\[\]\*\?\/\\]/g, '');
                XLSX.utils.book_append_sheet(wb, ws, name);
            });
        } else {
            const ws = createWorksheetData(budget.chapters);
            XLSX.utils.book_append_sheet(wb, ws, "Pressupost");
        }

        XLSX.writeFile(wb, `${budget.name}.xlsx`);
    }, [budget, calcChapterTotal, calcItemTotalAmount, priceDatabase, printConfig.chaptersOnNewPage]);

    // --- Search Filtering ---
    const filteredChapters = useMemo(() => {
        if (!searchTerm.trim()) return budget.chapters;

        const searchLower = searchTerm.toLowerCase().trim();

        const filterNodes = (nodes) => {
            return nodes.map(node => {
                const matchesSelf = (node.code || '').toLowerCase().includes(searchLower) ||
                    (node.description || '').toLowerCase().includes(searchLower);

                const filteredSubChapters = filterNodes(node.subChapters || []);
                const filteredItems = filterNodes(node.items || []);

                if (matchesSelf || filteredSubChapters.length > 0 || filteredItems.length > 0) {
                    // If matches self or children match, keep the node and its matching children
                    // If it matches self, but children don't match, we still keep the node but might want all children?
                    // User said: "hauria de filtrar i mostrar els items amb codi que contenguin la cerca"
                    // Usually, if a parent matches, we show all its structure. If only a child matches, we show parent -> matching child.
                    return {
                        ...node,
                        subChapters: filteredSubChapters,
                        items: filteredItems
                    };
                }
                return null;
            }).filter(Boolean);
        };

        return filterNodes(budget.chapters);
    }, [budget.chapters, searchTerm]);

    // --- Filtered Prices ---
    const filteredPrices = useMemo(() => {
        if (!searchTerm.trim()) return Object.entries(priceDatabase);
        const searchLower = searchTerm.toLowerCase().trim();
        return Object.entries(priceDatabase).filter(([code, data]) => {
            return (code || '').toLowerCase().includes(searchLower) ||
                (data.summary || '').toLowerCase().includes(searchLower);
        });
    }, [priceDatabase, searchTerm]);

    // --- Resources Aggregation Logic ---
    const aggregatedResources = useMemo(() => {
        const resources = {};

        // Helper to get total quantity of a node (Item) from its measurements
        const calculateNodeQty = (node) => {
            if (!node.measurements || node.measurements.length === 0) return 0;
            return node.measurements.reduce((acc, m) => {
                const units = parseFloat(m.units) || 0;
                const length = parseFloat(m.length) || 1;
                const width = parseFloat(m.width) || 1;
                const height = parseFloat(m.height) || 1;
                return acc + (units * length * width * height);
            }, 0);
        };

        // Recursive function to process breakdown
        // multiplier: how many units of this component are needed (cumulative from parents)
        const processBreakdown = (breakdown, multiplier) => {
            // 1. Calculate Base Total for this level (for percentage calcs)
            let levelBase = 0;
            breakdown.forEach(b => {
                const cat = getComponentCategory(b.code);
                if (cat !== 'percent') {
                    // Use DB price if available, else line price
                    const dbPrice = priceDatabase[normalizeCode(b.code)]?.price;
                    const bPrice = dbPrice !== undefined ? dbPrice : (parseFloat(b.price) || 0);
                    const bYield = parseFloat(b.yield) || 0;
                    levelBase += bPrice * bYield;
                }
            });

            // 2. Process Items
            breakdown.forEach(b => {
                const bYield = parseFloat(b.yield) || 0;
                const cat = getComponentCategory(b.code);
                const normCode = normalizeCode(b.code);

                if (cat === 'percent') {
                    // Percentage Item
                    const percentageCost = levelBase * (bYield / 100);
                    const totalCost = percentageCost * multiplier;

                    if (resources[normCode]) {
                        resources[normCode].amount += totalCost;
                        resources[normCode].quantity += multiplier;
                    } else {
                        resources[normCode] = {
                            code: b.code,
                            description: b.description || 'Despeses Auxiliars / Indirectes',
                            unit: '%',
                            price: 0, // Will calc
                            quantity: multiplier,
                            amount: totalCost,
                            type: 'others'
                        };
                    }
                } else {
                    // Normal Item
                    const bQty = bYield * multiplier; // Total quantity of this resource needed
                    const dbPrice = priceDatabase[normCode]?.price;
                    const bPrice = dbPrice !== undefined ? dbPrice : (parseFloat(b.price) || 0);
                    const bTotal = bQty * bPrice;

                    const dbEntry = priceDatabase[normCode];
                    const nestedBreakdown = dbEntry?.breakdown || [];

                    if (nestedBreakdown.length > 0) {
                        // Recurse down
                        processBreakdown(nestedBreakdown, bQty);
                    } else {
                        // Leaf resource
                        let type = 'others';
                        if (cat === 'material') type = b.code.toLowerCase().startsWith('mq') ? 'machinery' : 'material';
                        else if (cat === 'labor') type = 'labor';

                        if (resources[normCode]) {
                            resources[normCode].quantity += bQty;
                            resources[normCode].amount += bTotal;
                        } else {
                            resources[normCode] = {
                                code: b.code,
                                description: b.description || dbEntry?.summary || 'Sense descripció',
                                unit: b.unit || '',
                                price: bPrice,
                                quantity: bQty,
                                amount: bTotal,
                                type: type
                            };
                        }
                    }
                }
            });
        };

        const traverse = (nodes) => {
            nodes.forEach(node => {
                if (!node.unit) {
                    // Chapter/Subchapter
                    if (node.subChapters) traverse(node.subChapters);
                    if (node.items) traverse(node.items);
                } else {
                    // Item (Leaf of the budget tree)
                    const itemQty = calculateNodeQty(node);
                    if (itemQty === 0) return;

                    // Get breakdown
                    const normCode = normalizeCode(node.code);
                    const dbEntry = priceDatabase[normCode];
                    const breakdown = dbEntry?.breakdown || node.breakdown || [];

                    if (breakdown.length > 0) {
                        processBreakdown(breakdown, itemQty);
                    } else {
                        // Simple item (is a resource itself?)
                        const price = parseFloat(dbEntry?.price || node.price || 0);
                        if (price > 0) {
                            let type = 'others';
                            const itemCat = getComponentCategory(node.code);
                            if (itemCat === 'material') type = node.code.toLowerCase().startsWith('mq') ? 'machinery' : 'material';
                            else if (itemCat === 'labor') type = 'labor';

                            const total = itemQty * price;
                            if (resources[normCode]) {
                                resources[normCode].quantity += itemQty;
                                resources[normCode].amount += total;
                            } else {
                                resources[normCode] = {
                                    code: node.code,
                                    description: node.description || dbEntry?.summary || 'Sense descripció',
                                    unit: node.unit || '',
                                    price: price,
                                    quantity: itemQty,
                                    amount: total,
                                    type: type
                                };
                            }
                        }
                    }
                }
            });
        };

        if (budget.chapters) {
            traverse(budget.chapters);
        }

        const sortedResources = Object.values(resources).sort((a, b) => a.code.localeCompare(b.code));

        // Finalize prices (mostly for % items)
        sortedResources.forEach(r => {
            if (r.price === 0 && r.quantity !== 0) {
                r.price = r.amount / r.quantity;
            }
        });

        // Group by type
        const grouped = {
            material: [],
            labor: [],
            machinery: [],
            others: []
        };

        sortedResources.forEach(r => {
            if (grouped[r.type]) grouped[r.type].push(r);
            else grouped.others.push(r);
        });

        return grouped;
    }, [budget, priceDatabase]);

    // --- Filtered Resources ---
    const filteredResources = useMemo(() => {
        if (!searchTerm.trim()) return aggregatedResources;
        const searchLower = searchTerm.toLowerCase().trim();

        const filterList = (list) => list.filter(res =>
            (res.code || '').toLowerCase().includes(searchLower) ||
            (res.description || '').toLowerCase().includes(searchLower)
        );

        return {
            material: filterList(aggregatedResources.material),
            labor: filterList(aggregatedResources.labor),
            machinery: filterList(aggregatedResources.machinery),
            others: filterList(aggregatedResources.others)
        };
    }, [aggregatedResources, searchTerm]);

    // --- MODIFICATION: PEM Adjustment Logic ---
    const adjustPem = (targetTotal) => {
        if (!budgetTotal || !targetTotal) return;
        const factor = targetTotal / budgetTotal;

        setPriceDatabase(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(code => {
                if (!code.includes('%')) {
                    next[code] = {
                        ...next[code],
                        price: (next[code].price || 0) * factor
                    };
                }
            });
            return next;
        });

        const updateTree = (nodes) => {
            return nodes.map(node => {
                const isChapter = !node.unit;
                const newNode = { ...node };
                if (!isChapter) {
                    if (newNode.price) newNode.price *= factor;
                    if (newNode.breakdown) {
                        newNode.breakdown = newNode.breakdown.map(b => {
                            if (b.code && !b.code.includes('%')) {
                                return { ...b, price: (b.price || 0) * factor };
                            }
                            return b;
                        });
                    }
                } else {
                    newNode.subChapters = updateTree(node.subChapters || []);
                    newNode.items = updateTree(node.items || []);
                }
                return newNode;
            });
        };

        setBudget(prev => ({ ...prev, chapters: updateTree(prev.chapters) }));
        notify(`Pressupost ajustat correctament (Factor: ${factor.toFixed(4)})`);
    };

    // --- MODIFICATION: Global Price Management ---
    const updateGlobalPrice = (code, newPrice, type = 'price') => {
        const price = parseFloat(newPrice) || 0;

        // 1. Update Price Database
        const newDb = { ...priceDatabase };
        newDb[code] = {
            ...(newDb[code] || {}),
            price: price,
            code: code
        };
        setPriceDatabase(newDb);

        // 2. Recalculate Budget Tree
        const recalculateNode = (node) => {
            // If it's a chapter, recurse
            if (!node.unit) {
                const newSubChapters = (node.subChapters || []).map(recalculateNode);
                const newItems = (node.items || []).map(recalculateNode);
                return { ...node, subChapters: newSubChapters, items: newItems };
            }

            // It's an item
            // Check if it's the item being updated directly
            if (node.code === code) {
                // If it has no breakdown, just update price. 
                // If it has breakdown, price should theoretically be derived, but user might be overriding base price of a resource.
                // Assuming priority: Calculated > DB > Manual Override for composites.
                // If it IS the resource we are editing, we set its price.
                return { ...node, price: price };
            }

            // Check if this item is composed of the updated resource
            const dbEntry = newDb[node.code] || node;
            const breakdown = dbEntry.breakdown || node.breakdown || [];

            if (breakdown.length > 0) {
                // Recalculate price based on components
                let calculatedPrice = 0;
                let hasUpdates = false;

                const newBreakdown = breakdown.map(b => {
                    const componentCode = b.code;
                    let componentPrice = b.price;

                    // Get latest price from DB
                    if (newDb[componentCode]) {
                        componentPrice = newDb[componentCode].price;
                    }

                    // If this component IS the one we updated, ensure we use the new price
                    if (componentCode === code) {
                        componentPrice = price;
                        hasUpdates = true;
                    }

                    calculatedPrice += (b.yield || 0) * componentPrice;
                    return { ...b, price: componentPrice };
                });

                if (hasUpdates || breakdown.some(b => newDb[b.code])) {
                    // Need to ensure we really recalculate everything if any component changed
                    // Actually, we should always recalculate composite if ANY of its children is the target code.
                    // A cleaner way: Always recalculate calculatedPrice from DB for all components.

                    calculatedPrice = breakdown.reduce((acc, b) => {
                        const p = newDb[b.code]?.price ?? b.price ?? 0;
                        return acc + ((b.yield || 0) * p);
                    }, 0);

                    return { ...node, price: calculatedPrice, breakdown: newBreakdown };
                }
            }

            return node;
        };

        const newChapters = budget.chapters.map(recalculateNode);
        setBudget(prev => ({ ...prev, chapters: newChapters }));
    };

    // Kept for compatibility if used elsewhere, but redirecting
    const updateDbPrice = (code, value) => updateGlobalPrice(code, value);

    // --- MODIFICATION: Item Creator ---
    const handleSaveNewItem = (data, parentId) => {
        const newNode = {
            id: crypto.randomUUID(),
            code: data.code,
            description: data.description,
            fullDescription: data.description,
            unit: data.type === 'item' ? data.unit : null,
            price: parseFloat(data.price) || 0,
            breakdown: [],
            items: [],
            subChapters: [],
            measurements: data.type === 'item' ? [{ id: crypto.randomUUID(), description: 'Base', units: 1, length: 1, width: 1, height: 1 }] : []
        };

        // Update DB if price is set
        if (data.type === 'item' && data.price) {
            setPriceDatabase(prev => ({
                ...prev,
                [normalizeCode(data.code)]: { code: data.code, price: parseFloat(data.price), summary: data.description, unit: data.unit }
            }));
        }

        const addToTree = (nodes) => {
            if (!parentId) {
                return [...nodes, newNode];
            }
            return nodes.map(node => {
                if (node.id === parentId) {
                    // Expand parent automatically
                    setExpandedChapters(prev => ({ ...prev, [node.id]: true }));

                    if (data.type === 'item') {
                        return { ...node, items: [...(node.items || []), newNode] };
                    } else {
                        return { ...node, subChapters: [...(node.subChapters || []), newNode] };
                    }
                }
                return {
                    ...node,
                    subChapters: addToTree(node.subChapters || []),
                    items: addToTree(node.items || [])
                };
            });
        };

        if (!parentId) {
            setBudget(prev => ({ ...prev, chapters: [...prev.chapters, newNode] }));
        } else {
            setBudget(prev => ({ ...prev, chapters: addToTree(prev.chapters) }));
        }

        setShowCreator(false);
        notify(`${data.type === 'item' ? 'Partida' : 'Capítol'} creada correctament`);
    };

    // --- DEEP CLONE UTILITY ---
    const deepCloneNode = (node) => {
        if (!node) return null;
        return {
            ...node,
            id: crypto.randomUUID(),
            measurements: (node.measurements || []).map(m => ({ ...m, id: crypto.randomUUID() })),
            subChapters: (node.subChapters || []).map(deepCloneNode).filter(Boolean),
            items: (node.items || []).map(deepCloneNode).filter(Boolean),
            breakdown: (node.breakdown || []).map(b => ({ ...b }))
        };
    };

    // --- FUSIÓ DE BRANQUES (IMMUTABLE & SECURE) ---
    const mergeTreeBranches = (existingNodes, newNodes) => {
        const merged = [...existingNodes];

        newNodes.forEach(newNode => {
            const normNew = normalizeCode(newNode.code);
            const existingIdx = merged.findIndex(node => normalizeCode(node.code) === normNew);

            if (existingIdx > -1) {
                const existingNode = merged[existingIdx];
                const updatedNode = { ...existingNode };

                if (newNode.subChapters && newNode.subChapters.length > 0) {
                    updatedNode.subChapters = mergeTreeBranches(existingNode.subChapters || [], newNode.subChapters);
                }
                if (newNode.items && newNode.items.length > 0) {
                    updatedNode.items = mergeTreeBranches(existingNode.items || [], newNode.items);
                }

                // Only merge measurements for CHAPTERS. 
                // For ITEMS, if they matched, it means the user chose to keep existing.
                if (!newNode.unit && newNode.measurements && newNode.measurements.length > 0) {
                    updatedNode.measurements = [...(existingNode.measurements || []), ...newNode.measurements.map(m => ({ ...m, id: crypto.randomUUID() }))];
                }

                merged[existingIdx] = updatedNode;
            } else {
                merged.push(deepCloneNode(newNode));
            }
        });
        return merged;
    };

    // --- PARSER FIEBDC-3/2024 ---
    const processBC3Data = useCallback((text) => {
        if (!text) return null;

        const records = text.split('~').map(r => r.trim()).filter(r => r.length > 0);
        const concepts = {};
        const relations = {};
        const measurements = [];
        const longTexts = {};

        records.forEach(record => {
            const type = record[0];
            const content = record.substring(2);
            const fields = content.split('|');

            switch (type) {
                case 'C':
                    const codeRaw = fields[0].split('\\')[0].trim();
                    const normCode = normalizeCode(codeRaw);
                    const unit = fields[1]?.trim();
                    const summary = fields[2]?.trim();
                    const prices = fields[3] ? fields[3].split('\\').map(p => parseFloat(p.replace(',', '.')) || 0) : [0];

                    concepts[normCode] = {
                        originalCode: codeRaw,
                        code: normCode,
                        unit,
                        summary,
                        price: prices[0]
                    };
                    break;
                case 'T':
                    const tCodeRaw = fields[0].trim();
                    const tCode = normalizeCode(tCodeRaw);
                    if (tCode) longTexts[tCode] = fields[1]?.trim();
                    break;
                case 'D':
                    const pCode = normalizeCode(fields[0]);
                    const rawChildren = fields[1]?.trim() || fields[2]?.trim();
                    if (pCode && rawChildren) {
                        const parts = rawChildren.split('\\');
                        const children = [];
                        for (let i = 0; i < parts.length; i += 3) {
                            const cCode = normalizeCode(parts[i]);
                            if (cCode) {
                                children.push({
                                    child: cCode,
                                    factor: parseFloat((parts[i + 1] || '1').replace(',', '.')) || 1,
                                    yield: parseFloat((parts[i + 2] || '1').replace(',', '.')) || 1
                                });
                            }
                        }
                        relations[pCode] = children;
                    }
                    break;
                case 'M':
                    const mParts = fields[0]?.split('\\');
                    const targetCode = normalizeCode(mParts[mParts.length - 1]);
                    if (fields[3]) {
                        const mLines = fields[3].split('\\');
                        for (let i = 0; i < mLines.length; i += 6) {
                            if (mLines[i + 1] || mLines[i + 2]) {
                                measurements.push({
                                    target: targetCode,
                                    description: mLines[i + 1]?.trim() || 'Importat',
                                    units: parseFloat(mLines[i + 2]) || 0,
                                    length: parseFloat(mLines[i + 3]) || 1,
                                    width: parseFloat(mLines[i + 4]) || 1,
                                    height: parseFloat(mLines[i + 5]) || 1
                                });
                            }
                        }
                    } else if (fields[2]) {
                        measurements.push({
                            target: targetCode,
                            description: 'Amidament base',
                            units: parseFloat(fields[2].replace(',', '.')) || 0,
                            length: 0, width: 0, height: 0
                        });
                    }
                    break;
                case 'R':
                    // Ignorem registres de residus (~R) ja que hem eliminat la funcionalitat
                    break;
            }
        });

        const newPrices = { ...concepts };

        const buildTree = (normCode, stack = new Set()) => {
            if (stack.has(normCode)) return null; // Prevent infinite recursion
            const concept = concepts[normCode];
            if (!concept) return null;

            const nextStack = new Set(stack);
            nextStack.add(normCode);

            const breakdown = [];
            (relations[normCode] || []).forEach(rel => {
                const childConcept = concepts[rel.child];
                const unitPrice = childConcept?.price || 0;
                const childUnit = childConcept?.unit || '';
                const isPercent = childUnit === '%';
                const lineYield = isPercent ? (rel.yield * rel.factor * 100) : (rel.yield * rel.factor);
                const lineTotal = isPercent ? (lineYield / 100) * unitPrice : lineYield * unitPrice;

                const lineItem = {
                    code: rel.child,
                    description: childConcept?.summary || 'Sense descripció',
                    unit: childConcept?.unit || '',
                    yield: lineYield,
                    price: unitPrice,
                    total: lineTotal
                };
                breakdown.push(lineItem);
            });

            // If it's an item with a price but NO decomposition components,
            // create an automatic decomposition line with 'pa' prefix.
            if (breakdown.length === 0 && concept.unit && concept.price > 0) {
                breakdown.push({
                    code: 'pa' + concept.originalCode,
                    description: concept.summary,
                    unit: concept.unit,
                    yield: 1,
                    price: concept.price,
                    total: concept.price
                });
            }

            const node = {
                id: crypto.randomUUID(),
                code: concept.originalCode,
                description: concept.summary,
                fullDescription: longTexts[normCode] || concept.summary,
                unit: concept.unit,
                price: concept.price,
                breakdown: breakdown,
                waste: [],
                items: [],
                subChapters: [],
                measurements: measurements.filter(m => m.target === normCode).map(m => ({ ...m, id: crypto.randomUUID() }))
            };

            if (!concept.unit) {
                (relations[normCode] || []).forEach(rel => {
                    const childNode = buildTree(rel.child, nextStack);
                    if (childNode) {
                        if (childNode.unit) node.items.push(childNode);
                        else node.subChapters.push(childNode);
                    }
                });
            }
            return node;
        };

        const allChildren = new Set(Object.values(relations).flat().map(r => r.child));
        const rootCandidates = Object.keys(concepts).filter(c =>
            concepts[c].originalCode.includes('##') || !allChildren.has(c)
        );

        const finalChapters = [];
        rootCandidates.forEach(candidate => {
            const rootNode = buildTree(candidate);
            if (rootNode) {
                // Si és un node de projecte (##), n'agafem els fills com a capítols de primer nivell
                if (concepts[candidate].originalCode.includes('##')) {
                    finalChapters.push(...(rootNode.subChapters || []), ...(rootNode.items || []));
                } else if (!rootNode.unit || (rootNode.items?.length > 0 || rootNode.subChapters?.length > 0)) {
                    // Si és un orphan i sembla un capítol (no té unitat o té fills), l'afegim
                    finalChapters.push(rootNode);
                }
            }
        });

        if (finalChapters.length > 0) {
            // Eliminar duplicats per id (per si un cas)
            const seen = new Set();
            const uniqueChapters = finalChapters.filter(ch => {
                if (seen.has(ch.id)) return false;
                seen.add(ch.id);
                return true;
            });
            return { chapters: uniqueChapters, prices: newPrices };
        }

        return null;
    }, []);

    // --- Exportació BC3 ---
    const generateBC3 = useCallback(() => {
        const concepts = new Map(); // normCode -> { data, isDecomposed }
        const measurementsByCode = new Map(); // normCode -> Array of measurement lines
        const relationships = new Map(); // normCode -> Array of { childNormCode, factor, yield }

        const getExportCode = (normCode) => {
            const concept = concepts.get(normCode);
            return (concept && concept.isDecomposed) ? `${normCode}#` : normCode;
        };

        const fNum = (n) => (n || 0).toString().replace('.', ',');

        // 1. First Pass: Collect all data and determine decomposition
        const processNode = (node) => {
            const norm = normalizeCode(node.code);
            const hasChildren = (node.subChapters?.length > 0 || node.items?.length > 0);
            const hasBreakdown = (node.breakdown?.length > 0);
            const hasMeasurements = (node.measurements?.length > 0);

            if (!concepts.has(norm)) {
                concepts.set(norm, {
                    unit: node.unit || '',
                    description: node.description || '',
                    fullDescription: node.fullDescription || '',
                    price: node.price || 0,
                    isDecomposed: false
                });
            }

            const concept = concepts.get(norm);
            if (hasChildren || hasBreakdown) {
                concept.isDecomposed = true;
            }

            // Relationship data
            if (hasChildren) {
                if (!relationships.has(norm)) relationships.set(norm, []);
                const rels = relationships.get(norm);
                const children = [...(node.subChapters || []), ...(node.items || [])];
                children.forEach(child => {
                    const childNorm = normalizeCode(child.code);
                    if (!rels.some(r => r.child === childNorm)) {
                        rels.push({ child: childNorm, factor: 1, yield: 1 });
                    }
                });
            } else if (hasBreakdown) {
                if (!relationships.has(norm)) relationships.set(norm, []);
                const rels = relationships.get(norm);
                node.breakdown.forEach(b => {
                    const bNorm = normalizeCode(b.code);
                    if (!rels.some(r => r.child === bNorm)) {
                        rels.push({ child: bNorm, factor: 1, yield: b.yield || 1 });
                    }
                    if (!concepts.has(bNorm)) {
                        concepts.set(bNorm, {
                            unit: b.unit || '',
                            description: b.description || '',
                            price: b.price || 0,
                            isDecomposed: false
                        });
                    }
                });
            }

            // Measurement aggregation
            if (hasMeasurements) {
                if (!measurementsByCode.has(norm)) measurementsByCode.set(norm, []);
                measurementsByCode.get(norm).push(...node.measurements);
            }

            if (node.subChapters) node.subChapters.forEach(processNode);
            if (node.items) node.items.forEach(processNode);
        };

        budget.chapters.forEach(processNode);
        // Also ensure price database entries are present as concepts
        Object.entries(priceDatabase).forEach(([code, data]) => {
            const norm = normalizeCode(code);
            if (!concepts.has(norm)) {
                concepts.set(norm, {
                    unit: data.unit || '',
                    description: data.summary || '',
                    price: data.price || 0,
                    isDecomposed: false
                });
            }
        });

        let lines = [];
        lines.push('~V|FIEBDC-3/2016|PreuArq BIM|ANSI');
        lines.push('~K|\\0\\0\\0\\2\\2\\2\\2\\');

        // 2. Second Pass: Generate records

        // Root Concept
        if (budget.chapters.length > 0) {
            lines.push(`~C|##|u|${budget.name || 'PROJECTE'}|0|0|0|0\\0\\0`);
            const rootChildren = budget.chapters.map(ch => {
                const childNorm = normalizeCode(ch.code);
                return `${getExportCode(childNorm)}\\1\\1`;
            }).join('\\');
            lines.push(`~D|##|${rootChildren}`);
        }

        // Concepts records (~C, ~T)
        concepts.forEach((data, norm) => {
            const exportCode = getExportCode(norm);
            lines.push(`~C|${exportCode}|${data.unit}|${data.description}|${fNum(data.price)}|0|0|0\\0\\0`);
            if (data.fullDescription) {
                lines.push(`~T|${exportCode}|${data.fullDescription}`);
            }
        });

        // Decomposition records (~D)
        relationships.forEach((rels, norm) => {
            const exportCode = getExportCode(norm);
            const childStr = rels.map(r => `${getExportCode(r.child)}\\${fNum(r.factor)}\\${fNum(r.yield)}`).join('\\');
            if (childStr) {
                lines.push(`~D|${exportCode}|${childStr}`);
            }
        });

        // Quantity (~Q) and Measurement (~M) records
        const codesWithActivity = new Set([...measurementsByCode.keys()]);

        codesWithActivity.forEach(norm => {
            const exportCode = getExportCode(norm);
            const measurements = measurementsByCode.get(norm) || [];

            if (measurements.length > 0) {
                const totalQty = measurements.reduce((acc, m) => acc + (m.units || 0) * (m.length || 1) * (m.width || 1) * (m.height || 1), 0);
                lines.push(`~Q|${exportCode}|${fNum(totalQty)}`);

                const mLines = measurements.map(m => {
                    return `2\\${m.description}\\${fNum(m.units)}\\${fNum(m.length)}\\${fNum(m.width)}\\${fNum(m.height)}`;
                }).join('\\');
                lines.push(`~M|${exportCode}|1\\${mLines}`);
            }
        });

        return lines.join('\n');
    }, [budget, priceDatabase]);

    const handleExportBC3 = () => {
        const content = generateBC3();

        // Use TextEncoder to first get UTF-8 (default) then we need a way to get Windows-1252.
        // In a browser environment without external libraries, we can use a small trick for Windows-1252
        // if we only care about common Catalan/Spanish characters.
        // However, the standard way is to use a library or just use UTF-8 and hope the receiver handles it.
        // BUT the user specifically asked for correct encoding.
        // Let's use an approach that works for a wide range of characters in Windows-1252.

        const encoder = new TextEncoder();
        const utf8Array = encoder.encode(content);

        // For true Windows-1252, we'd need a mapping. 
        // A common alternative in modern web is to just use UTF-8 but label it correctly.
        // However, if they want "pure" BC3 for old software, Windows-1252 is key.

        // Let's implement a basic Windows-1252 encoder for the Catalan/Spanish subset
        const toWindows1252 = (str) => {
            const buf = new Uint8Array(str.length);
            for (let i = 0; i < str.length; i++) {
                const charCode = str.charCodeAt(i);
                if (charCode < 128) {
                    buf[i] = charCode;
                } else {
                    // Mapping for common characters in Catalan/Spanish
                    const map = {
                        0x00E0: 0xE0, // à
                        0x00E1: 0xE1, // á
                        0x00E8: 0xE8, // è
                        0x00E9: 0xE9, // é
                        0x00ED: 0xED, // í
                        0x00F2: 0xF2, // ò
                        0x00F3: 0xF3, // ó
                        0x00FA: 0xFA, // ú
                        0x00EF: 0xEF, // ï
                        0x00FC: 0xFC, // ü
                        0x00E7: 0xE7, // ç
                        0x00F1: 0xF1, // ñ
                        0x00C0: 0xC0, // À
                        0x00C1: 0xC1, // Á
                        0x00C8: 0xC8, // È
                        0x00C9: 0xC9, // É
                        0x00CD: 0xCD, // Í
                        0x00D2: 0xD2, // Ò
                        0x00D3: 0xD3, // Ó
                        0x00DA: 0xDA, // Ú
                        0x00CF: 0xCF, // Ï
                        0x00DC: 0xDC, // Ü
                        0x00C7: 0xC7, // Ç
                        0x00D1: 0xD1, // Ñ
                        0x20AC: 0x80, // €
                        0x00B0: 0xB0, // °
                    };
                    buf[i] = map[charCode] || 63; // 63 is '?'
                }
            }
            return buf;
        };

        const win1252Array = toWindows1252(content);
        const blob = new Blob([win1252Array], { type: 'text/plain;charset=windows-1252' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${budget.name || 'projecte'}.bc3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        notify("Fitxer BC3 exportat correctament (Windows-1252)");
    };

    // --- Project Management Handlers ---
    const fileInputRef = React.useRef(null);

    const handleDownloadProject = () => {
        const projectData = {
            budget,
            priceDatabase,
            exportDate: new Date().toISOString(),
            version: '1.0'
        };
        const json = JSON.stringify(projectData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${budget.name || 'projecte'}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        notify("Projecte desat correctament");
    };

    const handleOpenProject = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const fileName = file.name.toLowerCase();

        if (fileName.endsWith('.json')) {
            // Handle JSON project file
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const projectData = JSON.parse(event.target.result);
                    if (projectData.budget && projectData.priceDatabase) {
                        setBudget(projectData.budget);
                        setPriceDatabase(projectData.priceDatabase);
                        notify("Projecte carregat correctament");
                    } else {
                        notify("Format de fitxer no vàlid", "error");
                    }
                } catch (err) {
                    notify("Error llegint el fitxer", "error");
                    console.error(err);
                }
            };
            reader.readAsText(file);
        } else if (fileName.endsWith('.bc3')) {
            // Handle BC3 file
            const reader = new FileReader();
            reader.onload = (ev) => {
                const result = processBC3Data(ev.target.result);
                if (result) {
                    startImportProcess(result);
                } else {
                    notify("Format BC3 no reconegut", "error");
                }
            };
            reader.readAsText(file, 'windows-1252');
        } else {
            notify("Format de fitxer no suportat. Utilitza .json o .bc3", "error");
        }

        e.target.value = ''; // Reset input
    };

    const handleNewProject = () => {
        if (budget.chapters.length > 0 || Object.keys(priceDatabase).length > 0) {
            if (!confirm('Estàs segur que vols crear un nou projecte? Es perdran les dades no desades.')) {
                return;
            }
        }
        setBudget({ id: crypto.randomUUID(), name: 'Nou Projecte', chapters: [] });
        setPriceDatabase({});
        setSelectedId(null);
        notify("Nou projecte creat");
    };



    const startImportProcess = (result) => {
        // Find duplicates
        const existingCodes = new Set();
        const collectExisting = (nodes) => {
            nodes.forEach(n => {
                existingCodes.add(normalizeCode(n.code));
                if (n.subChapters) collectExisting(n.subChapters);
                if (n.items) collectExisting(n.items);
            });
        };
        collectExisting(budget.chapters);

        const duplicates = [];
        const findDuplicates = (nodes) => {
            nodes.forEach(n => {
                if (n.unit && existingCodes.has(normalizeCode(n.code))) {
                    duplicates.push({ id: n.id, code: n.code, description: n.description });
                }
                if (n.subChapters) findDuplicates(n.subChapters);
                if (n.items) findDuplicates(n.items);
            });
        };
        findDuplicates(result.chapters);

        if (duplicates.length > 0) {
            setImportPending({ ...result, duplicates, currentIdx: 0 });
        } else {
            finalizeImport(result);
        }
    };

    const generateUniqueCode = (baseCode, existingCodes) => {
        let suffix = 1;
        let newCode = `${baseCode}_${suffix}`;
        while (existingCodes.has(normalizeCode(newCode))) {
            suffix++;
            newCode = `${baseCode}_${suffix}`;
        }
        return newCode;
    };

    const findParentPath = (nodes, targetId, path = []) => {
        for (const node of nodes) {
            if (node.id === targetId) return path;
            const subResult = findParentPath(node.subChapters || [], targetId, [...path, node.id]);
            if (subResult) return subResult;
            const itemResult = findParentPath(node.items || [], targetId, [...path, node.id]);
            if (itemResult) return itemResult;
        }
        return null;
    };

    const handleConfirmDuplicate = (asNew) => {
        setImportPending(prev => {
            if (!prev) return null;
            const { chapters, duplicates, currentIdx } = prev;
            const currentDup = duplicates[currentIdx];
            let nextChapters = chapters;

            if (asNew) {
                // Add suffix to the imported item
                const existingCodes = new Set();
                const collectExisting = (nodes) => {
                    nodes.forEach(n => {
                        existingCodes.add(normalizeCode(n.code));
                        if (n.subChapters) collectExisting(n.subChapters);
                        if (n.items) collectExisting(n.items);
                    });
                };
                collectExisting(budget.chapters);

                const newCode = generateUniqueCode(currentDup.code, existingCodes);

                const updateCodeInTree = (nodes) => {
                    return nodes.map(n => {
                        if (n.id === currentDup.id) {
                            return { ...n, code: newCode };
                        }
                        return {
                            ...n,
                            subChapters: updateCodeInTree(n.subChapters || []),
                            items: updateCodeInTree(n.items || [])
                        };
                    });
                };
                nextChapters = updateCodeInTree(chapters);
            } else {
                // Remove from imported tree and mark for expansion
                const findAndExpand = (nodes, targetCode) => {
                    for (const node of nodes) {
                        if (normalizeCode(node.code) === normalizeCode(targetCode)) {
                            return node.id;
                        }
                        const found = findAndExpand([...(node.subChapters || []), ...(node.items || [])], targetCode);
                        if (found) return found;
                    }
                    return null;
                };

                const existingItemId = findAndExpand(budget.chapters, currentDup.code);
                if (existingItemId) {
                    const path = findParentPath(budget.chapters, existingItemId);
                    if (path) {
                        setExpandedChapters(prevExpanded => {
                            const next = { ...prevExpanded };
                            path.forEach(id => next[id] = true);
                            return next;
                        });
                    }
                }

                const removeFromTree = (nodes) => {
                    return nodes.filter(n => n.id !== currentDup.id).map(n => ({
                        ...n,
                        subChapters: removeFromTree(n.subChapters || []),
                        items: removeFromTree(n.items || [])
                    }));
                };
                nextChapters = removeFromTree(chapters);
            }

            const updatedPending = { ...prev, chapters: nextChapters };

            if (currentIdx + 1 < duplicates.length) {
                return { ...updatedPending, currentIdx: currentIdx + 1 };
            } else {
                // Schedule finalization after state update completes
                setTimeout(() => {
                    finalizeImport(updatedPending);
                    setImportPending(null);
                }, 0);
                return updatedPending;
            }
        });
    };

    const finalizeImport = (result) => {
        setPriceDatabase(prev => ({ ...prev, ...result.prices }));
        setBudget(prev => ({
            ...prev,
            chapters: mergeTreeBranches(prev.chapters, result.chapters)
        }));
        notify("Dades importades correctament");
    };

    // --- BC3 URL Handlers (defined after dependencies) ---
    const importFromUrl = useCallback(async (url) => {
        if (!url) return;
        try {
            console.log("Attempting import from URL:", url);
            notify("Consolidant amb el projecte...");
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url.trim())}`;
            const response = await fetch(proxyUrl);
            const buffer = await response.arrayBuffer();
            const decoder = new TextDecoder('windows-1252');
            const text = decoder.decode(buffer);

            const result = processBC3Data(text);
            if (result) {
                startImportProcess(result);
            } else {
                notify("Format BC3 no reconegut", "error");
            }
        } catch (err) {
            console.error("Error important dades:", err);
            notify(`Error: ${err.message}`, "error");
        }
    }, [processBC3Data, startImportProcess]);

    const handleDrop = async (e) => {
        if (draggedNodeId) return; // Ignorar drop intern
        e.preventDefault();
        setIsDragging(false);

        const html = e.dataTransfer.getData('text/html');

        let extractedUrl = null;
        if (html) {
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                // 1. Cercar data-href en qualsevol element
                const withDataHref = doc.querySelectorAll('[data-href]');
                for (const el of withDataHref) {
                    const dh = el.getAttribute('data-href');
                    if (dh && (dh.toLowerCase().includes('.bc3') || dh.toLowerCase().includes('generadordepreus'))) {
                        extractedUrl = dh;
                        break;
                    }
                }

                // 2. Cercar qualsevol enllaç vàlid (no javascript) amb bc3
                if (!extractedUrl) {
                    const links = doc.querySelectorAll('a[href]');
                    for (const link of links) {
                        const href = link.getAttribute('href');
                        if (href && !href.toLowerCase().startsWith('javascript:') && (href.toLowerCase().includes('.bc3') || href.toLowerCase().includes('generadordepreus'))) {
                            extractedUrl = href;
                            break;
                        }
                    }
                }
            } catch (err) {
                console.error("Error parsing dropped HTML:", err);
            }
        }

        const candidates = [];
        // Escanejar tots els tipus per trobar alguna cosa que sembli una URL de BC3
        for (const type of e.dataTransfer.types) {
            try {
                const val = e.dataTransfer.getData(type)?.trim();
                if (val &&
                    !val.toLowerCase().startsWith('javascript:') &&
                    !val.toLowerCase().includes('about:blank') &&
                    !val.startsWith('<') &&
                    (val.toLowerCase().includes('.bc3') || val.toLowerCase().includes('generadordepreus'))) {
                    candidates.push(val);
                }
            } catch (e) { }
        }
        if (extractedUrl) candidates.unshift(extractedUrl);

        const url = candidates[0];
        if (url) {
            importFromUrl(url);
            return;
        }

        const file = e.dataTransfer.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const result = processBC3Data(ev.target.result);
                if (result) {
                    startImportProcess(result);
                } else {
                    notify("Format BC3 no reconegut", "error");
                }
            };
            reader.readAsText(file, 'windows-1252');
        }
    };

    const handlePaste = useCallback((e) => {
        const text = e.clipboardData.getData('text/plain')?.trim();
        if (text && (text.toLowerCase().includes('.bc3') || text.toLowerCase().includes('generadordepreus'))) {
            importFromUrl(text);
        }
    }, [importFromUrl]);


    const updateMeasurement = (itemId, mId, field, value) => {
        const numValue = field === 'description' ? value : parseFloat(value) || 0;
        const updateInTree = (nodes) => {
            return nodes.map(node => {
                if (node.id === itemId) {
                    return {
                        ...node,
                        measurements: node.measurements.map(m => m.id === mId ? { ...m, [field]: numValue } : m)
                    };
                }
                return {
                    ...node,
                    subChapters: updateInTree(node.subChapters || []),
                    items: updateInTree(node.items || [])
                };
            });
        };
        setBudget(prev => ({ ...prev, chapters: updateInTree(prev.chapters) }));
    };

    const updateDescription = (itemId, text) => {
        const updateInTree = (nodes) => {
            return nodes.map(node => {
                if (node.id === itemId) {
                    return { ...node, description: text };
                }
                return {
                    ...node,
                    subChapters: updateInTree(node.subChapters || []),
                    items: updateInTree(node.items || [])
                };
            });
        };
        setBudget(prev => ({ ...prev, chapters: updateInTree(prev.chapters) }));
    };

    const updateFullDescription = (itemId, text) => {
        const updateInTree = (nodes) => {
            return nodes.map(node => {
                if (node.id === itemId) {
                    return { ...node, fullDescription: text };
                }
                return {
                    ...node,
                    subChapters: updateInTree(node.subChapters || []),
                    items: updateInTree(node.items || [])
                };
            });
        };
        setBudget(prev => ({ ...prev, chapters: updateInTree(prev.chapters) }));
    };

    const updateUnit = (itemId, newUnit) => {
        const updateInTree = (nodes) => {
            return nodes.map(node => {
                if (node.id === itemId) {
                    return { ...node, unit: newUnit };
                }
                return {
                    ...node,
                    subChapters: updateInTree(node.subChapters || []),
                    items: updateInTree(node.items || [])
                };
            });
        };
        setBudget(prev => ({ ...prev, chapters: updateInTree(prev.chapters) }));
    };

    const addMeasurementLine = (itemId) => {
        const updateInTree = (nodes) => {
            return nodes.map(node => {
                if (node.id === itemId) {
                    return {
                        ...node,
                        measurements: [...(node.measurements || []), { id: crypto.randomUUID(), description: 'Nova línia', units: 0, length: 0, width: 0, height: 0 }]
                    };
                }
                return {
                    ...node,
                    subChapters: updateInTree(node.subChapters || []),
                    items: updateInTree(node.items || [])
                };
            });
        };
        setBudget(prev => ({ ...prev, chapters: updateInTree(prev.chapters) }));
    };

    const addIncrementLine = (itemId) => {
        const updateInTree = (nodes) => {
            return nodes.map(node => {
                if (node.id === itemId) {
                    return {
                        ...node,
                        measurements: [...(node.measurements || []), { id: crypto.randomUUID(), description: '% Increment', units: 0, length: 0, width: 0, height: 0, isIncrement: true }]
                    };
                }
                return {
                    ...node,
                    subChapters: updateInTree(node.subChapters || []),
                    items: updateInTree(node.items || [])
                };
            });
        };
        setBudget(prev => ({ ...prev, chapters: updateInTree(prev.chapters) }));
    };

    const deleteNode = (id) => {
        const findNode = (nodes) => {
            for (const n of nodes) {
                if (n.id === id) return n;
                const sub = findNode([...(n.subChapters || []), ...(n.items || [])]);
                if (sub) return sub;
            }
            return null;
        };

        const node = findNode(budget.chapters);
        if (!node) return;

        const hasChildren = (node.subChapters?.length > 0 || node.items?.length > 0);
        if (hasChildren) {
            if (!confirm(`El capítol "${node.description}" conté elements. Estàs segur que vols eliminar-lo i tot el seu contingut?`)) {
                return;
            }
        } else {
            if (!confirm(`Vols eliminar l'element "${node.description}"?`)) {
                return;
            }
        }

        const removeFromTree = (nodes) => {
            return nodes.filter(n => n.id !== id).map(n => ({
                ...n,
                subChapters: removeFromTree(n.subChapters || []),
                items: removeFromTree(n.items || [])
            }));
        };

        setBudget(prev => ({ ...prev, chapters: removeFromTree(prev.chapters) }));
        if (selectedId === id) setSelectedId(null);
        notify(`${node.unit ? 'Partida' : 'Capítol'} eliminat correctament`);
    };

    const deleteMeasurementLine = (itemId, mId) => {
        const updateInTree = (nodes) => {
            return nodes.map(node => {
                if (node.id === itemId) {
                    return {
                        ...node,
                        measurements: (node.measurements || []).filter(m => m.id !== mId)
                    };
                }
                return {
                    ...node,
                    subChapters: updateInTree(node.subChapters || []),
                    items: updateInTree(node.items || [])
                };
            });
        };
        setBudget(prev => ({ ...prev, chapters: updateInTree(prev.chapters) }));
    };

    // --- REORDERING LOGIC ---
    const handleReorder = (draggedId, targetId, pos) => {
        if (!draggedId || !targetId || draggedId === targetId) return;

        setBudget(prev => {
            let removedNode = null;

            const remove = (nodes) => {
                const idx = nodes.findIndex(n => n.id === draggedId);
                if (idx > -1) {
                    removedNode = nodes[idx];
                    return nodes.filter(n => n.id !== draggedId);
                }
                return nodes.map(node => ({
                    ...node,
                    subChapters: remove(node.subChapters || []),
                    items: remove(node.items || [])
                }));
            };

            const insert = (nodes) => {
                const targetIdx = nodes.findIndex(n => n.id === targetId);
                if (targetIdx > -1) {
                    // Logic for dropping INSIDE a chapter/subchapter
                    if (pos === 'inside') {
                        return nodes.map((node, idx) => {
                            if (idx === targetIdx) {
                                // Determine if it should go to subChapters or items based on unit
                                const isItem = !!removedNode.unit;
                                return {
                                    ...node,
                                    items: isItem ? [...(node.items || []), removedNode] : node.items,
                                    subChapters: !isItem ? [...(node.subChapters || []), removedNode] : node.subChapters
                                };
                            }
                            return node;
                        });
                    }

                    // Logic for reordering BEFORE/AFTER
                    const newNodes = [...nodes];
                    const insIdx = pos === 'before' ? targetIdx : targetIdx + 1;
                    newNodes.splice(insIdx, 0, removedNode);
                    return newNodes;
                }

                return nodes.map(node => {
                    const isChapter = !node.unit;
                    if (isChapter) {
                        return {
                            ...node,
                            subChapters: insert(node.subChapters || []),
                            items: insert(node.items || [])
                        };
                    }
                    return node;
                });
            };

            const budgetWithoutNode = remove(prev.chapters);
            if (!removedNode) return prev;

            return {
                ...prev,
                chapters: insert(budgetWithoutNode)
            };
        });

        setDraggedNodeId(null);
        setDragOverTarget(null);
    };

    const updateBreakdownLine = (itemId, idx, field, value) => {
        const numValue = (field === 'yield' || field === 'price') ? parseFloat(value) || 0 : value;
        const updateInTree = (nodes) => {
            return nodes.map(node => {
                if (node.id === itemId) {
                    const newBreakdown = [...node.breakdown];
                    newBreakdown[idx] = { ...newBreakdown[idx], [field]: numValue };
                    // If we change code, we might want to pull unit/desc from DB, but let's keep it simple
                    if (field === 'price') {
                        // If user manually edits price in breakdown, should we update DB or just this line? 
                        // For now just line. But since getItemUnitPrice prefers DB, this might look inconsistent if we don't handle it.
                        // Actually getItemUnitPrice uses DB if available. 
                        // If User wants to override, we might need a flag or update DB. 
                        // Recommened: Update DB if it's a known code.
                        if (newBreakdown[idx].code && priceDatabase[normalizeCode(newBreakdown[idx].code)]) {
                            updateDbPrice(normalizeCode(newBreakdown[idx].code), numValue);
                        }
                    }
                    return { ...node, breakdown: newBreakdown };
                }
                return {
                    ...node,
                    subChapters: updateInTree(node.subChapters || []),
                    items: updateInTree(node.items || [])
                };
            });
        };
        setBudget(prev => ({ ...prev, chapters: updateInTree(prev.chapters) }));
    };

    const addBreakdownLine = (itemId) => {
        const updateInTree = (nodes) => {
            return nodes.map(node => {
                if (node.id === itemId) {
                    return {
                        ...node,
                        breakdown: [...(node.breakdown || []), { code: '', description: 'Nova línia', unit: 'u', yield: 1, price: 0 }]
                    };
                }
                return {
                    ...node,
                    subChapters: updateInTree(node.subChapters || []),
                    items: updateInTree(node.items || [])
                };
            });
        };
        setBudget(prev => ({ ...prev, chapters: updateInTree(prev.chapters) }));
    };

    const removeBreakdownLine = (itemId, idx) => {
        const updateInTree = (nodes) => {
            return nodes.map(node => {
                if (node.id === itemId) {
                    return {
                        ...node,
                        breakdown: node.breakdown.filter((_, i) => i !== idx)
                    };
                }
                return {
                    ...node,
                    subChapters: updateInTree(node.subChapters || []),
                    items: updateInTree(node.items || [])
                };
            });
        };
        setBudget(prev => ({ ...prev, chapters: updateInTree(prev.chapters) }));
    };

    const toggleChapter = (id) => setExpandedChapters(prev => ({ ...prev, [id]: !prev[id] }));
    const toggleJustification = (id) => setShowJustification(prev => ({ ...prev, [id]: !prev[id] }));
    const toggleWaste = (id) => setShowWaste(prev => ({ ...prev, [id]: !prev[id] }));

    // --- Render Helper ---
    const renderJustificationTable = (node) => {
        const categories = {
            material: { label: 'Materials (MT/MQ)', items: [], total: 0, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            labor: { label: 'Mà d\'Obra (MO)', items: [], total: 0, color: 'text-amber-600', bg: 'bg-amber-50' },
            directCost: { label: 'Costos Directes', items: [], total: 0, color: 'text-slate-600', bg: 'bg-slate-50' },
            percent: { label: 'Costs Auxiliars / Percentatges', items: [], total: 0, color: 'text-purple-600', bg: 'bg-purple-50' }
        };

        // 1. Calculate Base for Percentages
        let baseTotalForPercent = 0;
        (node.breakdown || []).forEach(line => {
            const cat = getComponentCategory(line.code);
            if (cat !== 'percent') {
                const dbPrice = priceDatabase[normalizeCode(line.code)]?.price;
                const finalPrice = dbPrice !== undefined ? dbPrice : (line.price || 0);
                baseTotalForPercent += round2(finalPrice * (line.yield || 0));
            }
        });
        baseTotalForPercent = round2(baseTotalForPercent);

        // 2. Process Lines
        (node.breakdown || []).forEach((line, idx) => {
            const cat = getComponentCategory(line.code);
            let finalPrice, total;

            if (cat === 'percent') {
                finalPrice = baseTotalForPercent;
                // Només dividir per 100 si la unitat és '%'
                const unitFromDb = priceDatabase[normalizeCode(line.code)]?.unit;
                if (unitFromDb === '%') {
                    total = round2(finalPrice * ((line.yield || 0) / 100));
                } else {
                    total = round2(finalPrice * (line.yield || 0));
                }
            } else {
                const dbPrice = priceDatabase[normalizeCode(line.code)]?.price;
                finalPrice = dbPrice !== undefined ? dbPrice : (line.price || 0);
                total = round2(finalPrice * (line.yield || 0));
            }

            categories[cat].items.push({ ...line, idx, finalPrice, total, isPercentage: cat === 'percent' });
            categories[cat].total = round2(categories[cat].total + total);
        });

        const totalCost = round2(categories.material.total + categories.labor.total + categories.directCost.total + categories.percent.total);

        return (
            <div className="bg-white border border-slate-300 animate-in fade-in duration-300">
                <div className="bg-slate-100 px-4 py-1.5 border-b border-slate-300 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Tag size={12} className="text-blue-500" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Justificació de Preu Unitari: {node.code}</span>
                    </div>
                    <button onClick={() => addBreakdownLine(node.id)} className="text-[9px] bg-white border border-slate-300 px-2 py-0.5 hover:bg-slate-50 flex items-center gap-1 uppercase font-bold">
                        <Plus size={10} /> Afegir Component
                    </button>
                </div>

                {Object.entries(categories).map(([key, cat]) => (
                    cat.items.length > 0 && (
                        <div key={key}>
                            <div className={`${cat.bg} px-4 py-1 text-[9px] uppercase font-bold tracking-widest ${cat.color} border-y border-slate-100`}>
                                {cat.label}
                            </div>
                            <table className="w-full text-[11px]">
                                <tbody className="divide-y divide-slate-100">
                                    {cat.items.map((line) => (
                                        <tr key={line.idx} className="hover:bg-slate-50 group">
                                            <td className="p-2 w-32">
                                                <input
                                                    className="w-full font-mono text-slate-400 bg-transparent outline-none border-b border-transparent focus:border-blue-300"
                                                    value={line.code}
                                                    onChange={e => updateBreakdownLine(node.id, line.idx, 'code', e.target.value)}
                                                    placeholder="Codi"
                                                />
                                            </td>
                                            <td className="p-2">
                                                <input
                                                    className="w-full text-slate-700 bg-transparent outline-none border-b border-transparent focus:border-blue-300"
                                                    value={line.description}
                                                    onChange={e => updateBreakdownLine(node.id, line.idx, 'description', e.target.value)}
                                                    placeholder="Descripció"
                                                />
                                            </td>
                                            <td className="p-2 text-center w-12">
                                                <input
                                                    className="w-full text-center text-slate-400 bg-transparent outline-none"
                                                    value={line.unit}
                                                    onChange={e => updateBreakdownLine(node.id, line.idx, 'unit', e.target.value)}
                                                />
                                            </td>
                                            <td className="p-2 text-right w-24">
                                                <div className="relative">
                                                    <input
                                                        className="w-full text-right font-mono bg-transparent outline-none border-b border-transparent focus:border-blue-300"
                                                        value={line.yield}
                                                        type="number"
                                                        onChange={e => updateBreakdownLine(node.id, line.idx, 'yield', e.target.value)}
                                                    />
                                                    {line.isPercentage && <span className="absolute top-0 right-[-10px] text-[9px]">%</span>}
                                                </div>
                                            </td>
                                            <td className="p-2 text-right w-28">
                                                {line.isPercentage ? (
                                                    <span className="font-mono text-slate-400 italic text-[10px] cursor-help" title="Base de càlcul (MO + MT)">{formatCurrency(line.finalPrice)}</span>
                                                ) : (
                                                    <input
                                                        className="w-full text-right font-mono bg-transparent outline-none border-b border-transparent focus:border-blue-300 text-blue-600 font-bold"
                                                        value={line.finalPrice}
                                                        type="number"
                                                        onChange={e => updateBreakdownLine(node.id, line.idx, 'price', e.target.value)}
                                                    />
                                                )}
                                            </td>
                                            <td className="p-2 text-right font-mono font-bold w-32">{formatCurrency(line.total)}</td>
                                            <td className="p-2 w-8 text-center opacity-0 group-hover:opacity-100">
                                                <button onClick={() => removeBreakdownLine(node.id, line.idx)} className="text-red-400 hover:text-red-600"><Trash2 size={12} /></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-white/50">
                                    <tr>
                                        <td colSpan={5} className="p-1 px-4 text-right text-[9px] uppercase opacity-50">Subtotal {cat.label}</td>
                                        <td className="p-1 px-2 text-right font-mono text-xs font-bold opacity-70">{formatCurrency(cat.total)}</td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )
                ))}

                <div className="bg-slate-50 border-t border-slate-200">
                    <div className="flex justify-between items-center p-2 px-4">
                        <span className="text-[10px] uppercase font-black text-slate-500 tracking-widest">Cost Directe Total</span>
                        <span className="font-mono font-bold text-blue-700">{formatCurrency(totalCost)}</span>
                    </div>
                </div>
            </div>
        );
    };

    // --- Renderitzadors ---
    const renderTreeNodes = (nodes, level = 0) => {
        return nodes.map(node => (
            <div key={node.id}>
                <div
                    className={`flex items-center gap-2 p-1.5 cursor-pointer border-l-2 ${selectedId === node.id ? 'bg-blue-600 text-white border-blue-800' : 'hover:bg-slate-100 text-slate-700 border-transparent'}`}
                    style={{ paddingLeft: `${level * 12 + 8}px` }}
                    onClick={() => { setSelectedId(node.id); if (!node.unit) toggleChapter(node.id); }}
                >
                    {(!node.unit && (node.subChapters?.length > 0 || node.items?.length > 0)) ? (
                        expandedChapters[node.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                    ) : (
                        node.unit ? <FileText size={14} className={selectedId === node.id ? 'text-blue-100' : 'text-slate-400'} /> : <Box size={14} />
                    )}
                    <span className={`font-mono text-[9px] px-1 ${selectedId === node.id ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-600'}`}>{node.code}</span>
                    <span className="truncate text-xs font-semibold">{node.description}</span>
                </div>
                {expandedChapters[node.id] && (
                    <div>
                        {renderTreeNodes(node.subChapters || [], level + 1)}
                        {renderTreeNodes(node.items || [], level + 1)}
                    </div>
                )}
            </div>
        ));
    };

    const renderTableRows = (nodes, level = 0) => {
        return nodes.map((node, index) => {
            const isTarget = dragOverTarget?.id === node.id;
            let dropClass = 'border-b border-slate-100';

            if (isTarget) {
                if (dragOverTarget.pos === 'inside') {
                    dropClass = 'bg-blue-100 ring-2 ring-inset ring-blue-500 border-b border-blue-200';
                } else if (dragOverTarget.pos === 'before') {
                    dropClass = 'border-t-2 border-t-blue-500 border-b border-slate-100';
                } else if (dragOverTarget.pos === 'after') {
                    dropClass = 'border-b-2 border-b-blue-500';
                }
            }

            return (
                <React.Fragment key={node.id}>
                    <tr
                        draggable
                        onDragStart={(e) => {
                            setDraggedNodeId(node.id);
                            e.dataTransfer.setData('text/plain', node.id);
                            e.dataTransfer.effectAllowed = 'move';
                            // Optional: set a drag ghost image if desired
                        }}
                        onDragEnd={() => {
                            setDraggedNodeId(null);
                            setDragOverTarget(null);
                        }}
                        onDragOver={(e) => {
                            if (!draggedNodeId) return;
                            e.preventDefault();
                            if (draggedNodeId === node.id) return;

                            const rect = e.currentTarget.getBoundingClientRect();
                            const y = e.clientY - rect.top;
                            const height = rect.height;

                            let pos;
                            if (node.unit) {
                                // Items: only before/after
                                pos = y < height / 2 ? 'before' : 'after';
                            } else {
                                // Chapters: allow inside if hovering middle 50%
                                if (y < height * 0.25) pos = 'before';
                                else if (y > height * 0.75) pos = 'after';
                                else pos = 'inside';
                            }

                            if (dragOverTarget?.id !== node.id || dragOverTarget?.pos !== pos) {
                                setDragOverTarget({ id: node.id, pos });
                            }
                        }}
                        onDrop={(e) => {
                            if (!draggedNodeId) return;
                            e.preventDefault();
                            if (draggedNodeId && dragOverTarget) {
                                handleReorder(draggedNodeId, node.id, dragOverTarget.pos);
                            }
                        }}
                        className={`cursor-pointer transition-colors group ${selectedId === node.id ? 'bg-blue-50/50' : 'hover:bg-slate-50'} ${!node.unit
                            ? (level === 0 ? 'bg-emerald-100/60' : (level === 1 ? 'bg-emerald-50/60' : (level === 2 ? 'bg-emerald-50/30' : 'bg-slate-50/30')))
                            : 'bg-white'
                            } ${dropClass}`}
                        onClick={() => {
                            setSelectedId(node.id);
                        }}
                    >
                        <td className="p-2 w-10 text-center" onClick={(e) => {
                            if (!node.unit) {
                                e.stopPropagation();
                                toggleChapter(node.id);
                            }
                        }}>
                            <div className="flex items-center justify-center gap-1">
                                <GripVertical size={10} className="text-slate-300 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing" />
                                {!node.unit && (
                                    <div className="flex items-center justify-center text-slate-400 hover:text-blue-500 transition-colors">
                                        {expandedChapters[node.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </div>
                                )}
                                {node.unit && <FileText size={14} className="text-slate-300" />}
                            </div>
                        </td>
                        <td className="p-2 font-mono text-[10px] text-slate-400 w-28" style={{ paddingLeft: `${level * 12 + 8}px` }}>
                            {node.code}
                        </td>
                        <td className="p-2 text-slate-800">
                            <div className="flex flex-col">
                                <span className={`text-[11px] ${!node.unit ? 'font-bold uppercase tracking-tight text-slate-600' : 'font-medium'}`}>
                                    {node.description}
                                </span>
                            </div>
                        </td>
                        <td className="p-2 text-center text-slate-400 italic w-14 text-[10px]">{node.unit || ''}</td>
                        <td className="p-2 text-right font-mono w-20 text-[11px] text-slate-500">{node.unit ? formatNumber(calcItemTotalQty(node), 2) : ''}</td>
                        <td className="p-2 text-right font-mono w-28 text-[11px] text-slate-600">
                            {node.unit ? formatPrice(getItemUnitPrice(node)) : ''}
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-slate-700 w-32 text-[11px]">
                            <div className="flex items-center justify-end gap-2">
                                {node.unit ? formatCurrency(calcItemTotalAmount(node)) : formatCurrency(calcChapterTotal(node))}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        deleteNode(node.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all ml-2"
                                    title="Eliminar"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        </td>
                    </tr>

                    {!node.unit && (expandedChapters[node.id] || searchTerm) && renderTableRows([...(node.subChapters || []), ...(node.items || [])], level + 1)}
                </React.Fragment>
            );
        });
    };



    const renderResourcesTable = () => {
        const resources = filteredResources;
        const groups = [
            { id: 'material', title: 'Materials', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: Box },
            { id: 'labor', title: 'Mà d\'Obra', color: 'text-blue-600', bg: 'bg-blue-50', icon: User }, // Use UserIcon or similar if available, else generic
            { id: 'machinery', title: 'Maquinària', color: 'text-amber-600', bg: 'bg-amber-50', icon: Settings },
            { id: 'others', title: 'Partides Alçades i Altres', color: 'text-slate-600', bg: 'bg-slate-50', icon: Layers }
        ];

        const totalAmount = Object.values(resources).flat().reduce((acc, r) => acc + (r.quantity * r.price), 0);
        const totalCount = Object.values(resources).flat().length;

        return (
            <div className="p-6">
                <div className="bg-white border border-slate-200">
                    <div className="bg-slate-800 p-3 text-white flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Layers size={16} className="text-blue-400" />
                            <span className="text-xs font-bold uppercase tracking-widest">Llistat de Recursos (Consolidat)</span>
                        </div>
                        <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-slate-300">
                            {totalCount} Recursos {searchTerm && `(${Object.values(aggregatedResources).flat().length} total)`}
                        </span>
                    </div>

                    <div className="overflow-auto max-h-[calc(100vh-250px)]">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-500 font-bold uppercase tracking-widest sticky top-0 z-10">
                                <tr>
                                    <th className="p-3 w-32 border-r border-slate-200">Codi</th>
                                    <th className="p-3">Concepte</th>
                                    <th className="p-3 w-16 text-center border-x border-slate-200">Ud.</th>
                                    <th className="p-3 w-28 text-right">Quant. Total</th>
                                    <th className="p-3 w-28 text-right">Preu</th>
                                    <th className="p-3 w-32 text-right bg-blue-50/50">Import Total</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm divide-y divide-slate-100">
                                {groups.map(group => {
                                    const groupResources = resources[group.id] || [];
                                    if (groupResources.length === 0) return null;

                                    const groupTotal = groupResources.reduce((acc, r) => acc + (r.quantity * r.price), 0);
                                    const Icon = group.icon;

                                    return (
                                        <React.Fragment key={group.id}>
                                            <tr className={`${group.bg} border-y border-slate-200`}>
                                                <td colSpan={6} className="p-2 pl-4">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <Icon size={14} className={group.color} />
                                                            <span className={`text-[11px] font-bold uppercase tracking-widest ${group.color}`}>{group.title}</span>
                                                            <span className="text-[10px] bg-white px-2 py-0.5 rounded-full border border-slate-200 text-slate-400 font-mono">
                                                                {groupResources.length}
                                                            </span>
                                                        </div>
                                                        <span className="font-mono text-[11px] font-bold text-slate-600 mr-4">
                                                            {formatCurrency(groupTotal)}
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                            {groupResources.map((res) => (
                                                <tr key={res.code} className="hover:bg-slate-50 group bg-white">
                                                    <td className="p-3 font-mono text-[11px] text-slate-400 border-r border-slate-200 pl-8">{res.code}</td>
                                                    <td className="p-3 text-slate-700">{res.description}</td>
                                                    <td className="p-3 text-center text-slate-400 italic border-x border-slate-200">{res.unit || '—'}</td>
                                                    <td className="p-3 text-right font-mono text-slate-600">{formatNumber(res.quantity, 2)}</td>
                                                    <td className="p-3 text-right font-mono text-slate-600">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <input
                                                                type="number"
                                                                step="any"
                                                                className="bg-transparent text-right border-b border-transparent hover:border-blue-300 focus:border-blue-600 outline-none w-20 font-bold text-slate-600 focus:text-blue-600 px-1"
                                                                value={res.price}
                                                                onChange={(e) => updateGlobalPrice(res.code, e.target.value)}
                                                                onClick={(e) => e.stopPropagation()}
                                                            />
                                                            <span className="text-[10px] text-slate-400">€</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-3 text-right font-mono font-bold text-blue-800 bg-blue-50/10 group-hover:bg-blue-50/20">
                                                        {formatCurrency(res.quantity * res.price)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                            <tfoot className="bg-slate-900 text-white font-bold sticky bottom-0 z-10">
                                <tr>
                                    <td colSpan={5} className="p-3 text-right text-[10px] uppercase tracking-widest">Total Recursos {searchTerm ? 'Filtrats' : 'Consolidats'}</td>
                                    <td className="p-3 text-right font-mono text-lg text-green-400">
                                        {formatCurrency(totalAmount)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>
        );
    };


    // --- MODIFICATION: Updated Prices Table with Edit Inputs ---
    const renderPricesTable = () => {
        const prices = filteredPrices;
        return (
            <div className="p-6">
                <div className="bg-white border border-slate-200">
                    <div className="bg-slate-800 p-3 text-white flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Database size={16} className="text-blue-400" />
                            <span className="text-xs font-bold uppercase tracking-widest">Banc de Preus de Projecte</span>
                        </div>
                        <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-slate-300">
                            {prices.length} Entrades
                        </span>
                    </div>
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                            <tr>
                                <th className="p-3 w-32 border-r border-slate-200">Codi</th>
                                <th className="p-3">Resum de Concepte</th>
                                <th className="p-3 w-20 text-center border-x border-slate-200">Ud.</th>
                                <th className="p-3 w-48 text-right bg-blue-50/50">Preu Unitari (Editable)</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm divide-y divide-slate-100">
                            {prices.map(([code, data]) => (
                                <tr key={code} className="hover:bg-slate-50 group">
                                    <td className="p-3 font-mono text-[11px] text-slate-400 border-r border-slate-200">{code}</td>
                                    <td className="p-3 text-slate-700">{data.summary}</td>
                                    <td className="p-3 text-center text-slate-400 italic border-x border-slate-200">{data.unit || '—'}</td>
                                    <td className="p-3 text-right font-mono font-bold text-blue-800 bg-blue-50/10 group-hover:bg-blue-50/30">
                                        <div className="flex items-center justify-end gap-2">
                                            <span className="text-xs text-slate-300">€</span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                className="bg-transparent text-right border-b border-transparent hover:border-blue-300 focus:border-blue-600 outline-none w-24 font-bold text-blue-700"
                                                value={data.price}
                                                onChange={(e) => updateDbPrice(code, e.target.value)}
                                            />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <div
            className="flex flex-col h-screen bg-slate-50 overflow-hidden font-sans selection:bg-blue-100 selection:text-blue-900 print:h-auto print:overflow-visible"
            onDragOver={(e) => {
                e.preventDefault();
                if (!draggedNodeId) setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onPaste={handlePaste}
        >
            {/* 2. ITEM CREATOR MODAL */}
            {showCreator && (
                <ItemCreator
                    onClose={() => setShowCreator(false)}
                    onSave={handleSaveNewItem}
                    parentId={selectedId}
                    parentCode={selectedId ? (
                        // Find code by ID - basic search for standard hierarchy
                        [...budget.chapters, ...budget.chapters.flatMap(c => [...(c.subChapters || []), ...(c.items || [])])].find(n => n.id === selectedId)?.code
                    ) : null}
                />
            )}

            {/* 3. PRINT PREVIEW */}
            {showPrint && (
                <PrintView
                    budget={budget}
                    priceDatabase={priceDatabase}
                    calcItemTotalAmount={calcItemTotalAmount}
                    calcChapterTotal={calcChapterTotal}
                    budgetTotal={budgetTotal}
                    config={printConfig}
                    setConfig={setPrintConfig}
                    onOpenConfig={() => setShowPrintConfigModal(true)}
                    onClose={() => setShowPrint(false)}
                    onExportPDF={handleExportPDF}
                    onExportSummaryPDF={handleExportSummaryPDF}
                />
            )}

            {isDragging && (
                <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-blue-600/10 backdrop-blur-sm pointer-events-none border-4 border-dashed border-blue-400 m-4">
                    <div className="bg-white p-12 border border-blue-200 flex flex-col items-center animate-in zoom-in duration-200">
                        <Upload size={48} className="text-blue-600 mb-4" />
                        <h2 className="text-2xl font-bold text-slate-800 tracking-tight uppercase">Importació BC3</h2>
                        <p className="text-slate-500 mt-2 text-center max-w-sm text-sm italic">Deixa anar per analitzar la jerarquia i descripcions.</p>
                    </div>
                </div>
            )}

            {/* Header Flat */}
            <header className="bg-slate-950 text-white p-4 flex flex-col md:flex-row justify-between items-center border-b border-slate-800 z-30 gap-4">
                <div className="flex items-center gap-4">
                    <div className="bg-blue-600 p-2">
                        <Calculator size={24} className="text-white" />
                    </div>
                    <div>
                        <h1 className="font-bold text-xl tracking-tighter leading-none uppercase">PreuArq <span className="text-blue-400 font-light">BIM</span></h1>

                    </div>
                </div>

                <div className="flex items-center gap-6">
                    {/* Total PEM Display (Interactive) */}
                    <button
                        onClick={() => setShowPemModal(true)}
                        className="flex flex-col items-center md:items-end gap-0.5 group cursor-pointer"
                        title="Ajustar PEM"
                    >
                        <span className="text-[9px] uppercase text-slate-500 font-bold tracking-widest leading-none group-hover:text-blue-400 transition-colors">Total PEM</span>
                        <div className="flex items-center gap-2">
                            <span className="text-xl font-mono text-emerald-400 font-bold tracking-tighter leading-none">{formatCurrency(budgetTotal)}</span>
                            <Calculator size={14} className="text-slate-600 group-hover:text-blue-500 transition-colors" />
                        </div>
                    </button>

                    <div className="flex items-center gap-2 flex-wrap justify-center">
                        {/* Nou */}
                        <button onClick={handleNewProject} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 border border-slate-700 transition-colors" title="Nou Projecte">
                            <FilePlus size={16} className="text-slate-400" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Nou</span>
                        </button>

                        {/* Obrir (JSON + BC3) */}
                        <button onClick={handleOpenProject} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 border border-slate-700 transition-colors" title="Obrir Projecte (JSON o BC3)">
                            <FolderOpen size={16} className="text-slate-400" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Obrir</span>
                        </button>

                        {/* Desar (Dropdown) */}
                        <div className="relative">
                            <button
                                onClick={() => setShowSaveDropdown(!showSaveDropdown)}
                                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 border border-slate-700 transition-colors"
                                title="Desar Projecte"
                            >
                                <Save size={16} className="text-emerald-400" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">Desar</span>
                                <ChevronDown size={12} className="text-slate-500" />
                            </button>
                            {showSaveDropdown && (
                                <div className="absolute top-full right-0 mt-1 bg-slate-900 border border-slate-700 shadow-2xl z-50 min-w-[180px]">
                                    <button
                                        onClick={() => { handleDownloadProject(); setShowSaveDropdown(false); }}
                                        className="w-full text-left px-4 py-2 text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-colors flex items-center gap-2"
                                    >
                                        <FileDown size={12} className="text-blue-400" />
                                        Desar com a JSON
                                    </button>
                                    <button
                                        onClick={() => { handleExportBC3(); setShowSaveDropdown(false); }}
                                        className="w-full text-left px-4 py-2 text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-colors flex items-center gap-2 border-t border-slate-800"
                                    >
                                        <Download size={12} className="text-emerald-400" />
                                        Exportar BC3
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Importar BC3 */}
                        <button
                            onClick={() => document.getElementById('bc3-import-input')?.click()}
                            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 border border-slate-700 transition-colors"
                            title="Importar BC3"
                        >
                            <Upload size={16} className="text-blue-400" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Importar</span>
                        </button>

                        {/* Imprimir */}
                        <button onClick={() => setShowPrint(true)} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 border border-slate-700 transition-colors" title="Imprimir">
                            <Printer size={16} className="text-slate-300" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Imprimir</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* Hidden file input for opening projects (JSON + BC3) */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".json,.bc3"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
            />

            {/* Hidden file input for BC3 import */}
            <input
                id="bc3-import-input"
                type="file"
                accept=".bc3"
                onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                            const result = processBC3Data(ev.target.result);
                            if (result) {
                                startImportProcess(result);
                            } else {
                                notify("Format BC3 no reconegut", "error");
                            }
                        };
                        reader.readAsText(file, 'windows-1252');
                    }
                    e.target.value = '';
                }}
                style={{ display: 'none' }}
            />

            <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
                {/* Taula Principal Flat */}
                <section className="flex-1 flex flex-col bg-white overflow-hidden relative">
                    <div className="border-b border-slate-200 p-2 flex flex-col md:flex-row justify-between items-center bg-slate-50 gap-2">
                        <div className="flex bg-white border border-slate-200 p-1 overflow-x-auto max-w-full">
                            <button
                                onClick={() => setActiveTab('editor')}
                                className={`px-4 py-1 text-[10px] font-bold uppercase tracking-widest transition-colors ${activeTab === 'editor' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-100'}`}
                            >
                                Editor de Partides
                            </button>
                            <button
                                onClick={() => setActiveTab('prices')}
                                className={`px-4 py-1 text-[10px] font-bold uppercase tracking-widest transition-colors ${activeTab === 'prices' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-100'}`}
                            >
                                Base de Preus
                            </button>
                            <button
                                onClick={() => setActiveTab('recursos')}
                                className={`px-4 py-1 text-[10px] font-bold uppercase tracking-widest transition-colors ${activeTab === 'recursos' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-100'}`}
                            >
                                Llistat de Recursos
                            </button>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2 text-slate-300" size={12} />
                                <input
                                    type="text"
                                    placeholder="Cerca codi..."
                                    className="pl-8 pr-3 py-1 bg-white border border-slate-200 text-[10px] focus:border-blue-500 outline-none w-48 transition-all"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                                {searchTerm && (
                                    <button
                                        onClick={() => setSearchTerm('')}
                                        className="absolute right-2 top-2 text-slate-300 hover:text-slate-500"
                                    >
                                        <X size={10} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Project Controls - Only in Editor View */}
                    {activeTab === 'editor' && (
                        <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
                            <div className="flex flex-col md:flex-row items-center gap-6 w-full md:w-auto">
                                {/* Project Name */}
                                <div className="flex items-center gap-3 group">
                                    <div className="bg-blue-600 p-2 rounded">
                                        <FileText size={20} className="text-white" />
                                    </div>
                                    <div>
                                        <label className="text-[9px] uppercase font-bold text-slate-400 tracking-widest block mb-1">Projecte</label>
                                        <input
                                            className="text-xl font-bold text-slate-800 bg-transparent border-b-2 border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none transition-colors px-1 -ml-1"
                                            value={budget.name}
                                            onChange={(e) => setBudget(prev => ({ ...prev, name: e.target.value }))}
                                            placeholder="Nom del Projecte"
                                        />
                                    </div>
                                </div>

                                {/* Nova Entrada Button */}
                                <button
                                    onClick={() => setShowCreator(true)}
                                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-blue-500/25"
                                >
                                    <Plus size={18} />
                                    <span className="text-[11px] font-bold uppercase tracking-widest">Nova Entrada</span>
                                </button>
                            </div>


                        </div>
                    )}

                    <div className="flex-1 overflow-auto">
                        {activeTab === 'editor' && (
                            <table className="w-full text-left border-collapse min-w-[800px]">
                                <thead className="sticky top-0 bg-white z-20 border-b border-slate-200 shadow-sm">
                                    <tr className="text-[9px] uppercase text-slate-400 font-black tracking-widest bg-white">
                                        <th className="p-2 w-10 text-center"></th>
                                        <th className="p-2 w-28">Codi</th>
                                        <th className="p-2">Concepte d'Obra</th>
                                        <th className="p-2 w-14 text-center">Ud.</th>
                                        <th className="p-2 w-20 text-right">Quantitat</th>
                                        <th className="p-2 w-28 text-right">Preu Ud.</th>
                                        <th className="p-2 w-32 text-right">Import Total</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {renderTableRows(filteredChapters)}
                                </tbody>
                            </table>
                        )}
                        {activeTab === 'prices' && renderPricesTable()}
                        {activeTab === 'recursos' && renderResourcesTable()}

                        {budget.chapters.length === 0 && activeTab === 'editor' && (
                            <div className="p-24 text-center">
                                <div className="flex flex-col items-center opacity-10">
                                    <FileCode size={64} className="mb-4" />
                                    <h3 className="text-xl font-bold uppercase tracking-widest">Esperant fitxer BC3</h3>
                                </div>
                            </div>
                        )}
                    </div>
                </section>

                {/* Resizer Handle - Hide on mobile */}
                <div
                    className="hidden md:block w-1 bg-slate-200 hover:bg-blue-400 cursor-col-resize transition-colors z-30"
                    onMouseDown={startResizing}
                />

                {/* Right Edit Sidebar */}
                <aside
                    className="bg-slate-50 border-l border-slate-200 overflow-y-auto flex flex-col w-full md:w-auto"
                    style={{ width: window.innerWidth < 768 ? '100%' : `${sidebarWidth}px` }}
                >
                    {selectedId ? (
                        (() => {
                            const findNode = (nodes) => {
                                for (const n of nodes) {
                                    if (n.id === selectedId) return n;
                                    const sub = findNode([...(n.subChapters || []), ...(n.items || [])]);
                                    if (sub) return sub;
                                }
                                return null;
                            };
                            const node = findNode(budget.chapters);
                            if (!node) return <div className="p-8 text-center text-slate-400 text-xs italic">Element no trobat</div>;

                            return (
                                <div className="flex flex-col h-full animate-in fade-in duration-300">
                                    <header className="bg-white border-b border-slate-200 p-4 sticky top-0 z-10 shadow-sm">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[10px] font-black bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{node.code}</span>
                                            <h2 className="text-sm font-bold text-slate-800 truncate">{node.description}</h2>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <p className="text-[9px] text-slate-400 uppercase font-bold tracking-widest">{node.unit ? 'Detall de Partida' : 'Detall de Capítol'}</p>
                                            {node.unit && (
                                                <div className="flex items-center gap-1">
                                                    <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{formatCurrency(calcItemTotalAmount(node))}</span>
                                                    <span className="text-[10px] font-black bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{node.unit}</span>
                                                </div>
                                            )}
                                        </div>
                                    </header>

                                    <div className="flex-1 p-4 space-y-4">
                                        {/* Títol & Codi Section */}
                                        <div className="bg-white border border-slate-200 rounded shadow-sm overflow-hidden">
                                            <button
                                                onClick={() => toggleSidebarSection('title')}
                                                className="w-full px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between hover:bg-slate-100 transition-colors"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <Tag size={12} className="text-slate-400" />
                                                    <span className="text-[10px] font-bold uppercase text-slate-600 tracking-wider">Identificació</span>
                                                </div>
                                                {expandedSidebarSections.title ? <ChevronDown size={12} className="text-slate-400" /> : <ChevronRight size={12} className="text-slate-400" />}
                                            </button>
                                            {expandedSidebarSections.title && (
                                                <div className="p-3 space-y-3">
                                                    <div>
                                                        <label className="text-[9px] font-bold text-slate-400 uppercase mb-1 block">Concepte / Títol</label>
                                                        <textarea
                                                            className="w-full p-2 text-xs border border-slate-200 rounded focus:border-blue-500 outline-none transition-all resize-none font-medium text-slate-700"
                                                            rows={2}
                                                            value={node.description}
                                                            onChange={(e) => updateDescription(node.id, e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Unitats Section - Only for items */}
                                        {node.unit && (
                                            <div className="bg-white border border-slate-200 rounded shadow-sm overflow-hidden">
                                                <button
                                                    onClick={() => toggleSidebarSection('unit')}
                                                    className="w-full px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between hover:bg-slate-100 transition-colors"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <FileText size={12} className="text-slate-400" />
                                                        <span className="text-[10px] font-bold uppercase text-slate-600 tracking-wider">Unitats de Mesura</span>
                                                    </div>
                                                    {expandedSidebarSections.unit ? <ChevronDown size={12} className="text-slate-400" /> : <ChevronRight size={12} className="text-slate-400" />}
                                                </button>
                                                {expandedSidebarSections.unit && (
                                                    <div className="p-3">
                                                        <label className="text-[9px] font-bold text-slate-400 uppercase mb-1 block">Unitat</label>
                                                        <input
                                                            className="w-full p-2 text-xs border border-slate-200 rounded focus:border-blue-500 outline-none transition-all font-medium text-slate-700"
                                                            value={node.unit}
                                                            onChange={(e) => updateUnit(node.id, e.target.value)}
                                                            placeholder="m², m³, ut, kg..."
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Descripció Section */}
                                        <div className="bg-white border border-slate-200 rounded shadow-sm overflow-hidden">
                                            <button
                                                onClick={() => toggleSidebarSection('description')}
                                                className="w-full px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between hover:bg-slate-100 transition-colors"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <AlignLeft size={12} className="text-slate-400" />
                                                    <span className="text-[10px] font-bold uppercase text-slate-600 tracking-wider">Descripció Tècnica</span>
                                                </div>
                                                {expandedSidebarSections.description ? <ChevronDown size={12} className="text-slate-400" /> : <ChevronRight size={12} className="text-slate-400" />}
                                            </button>
                                            {expandedSidebarSections.description && (
                                                <div className="p-3">
                                                    <textarea
                                                        className="w-full p-3 text-xs border border-slate-200 rounded focus:border-blue-500 outline-none transition-all min-h-[150px] font-sans text-slate-600 leading-relaxed"
                                                        value={node.fullDescription || ''}
                                                        onChange={(e) => updateFullDescription(node.id, e.target.value)}
                                                        placeholder="Escriu la descripció detallada..."
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        {/* Measurements Section */}
                                        {node.unit && (
                                            <div className="bg-white border border-slate-200 rounded shadow-sm overflow-hidden">
                                                <button
                                                    onClick={() => toggleSidebarSection('measurements')}
                                                    className="w-full px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between hover:bg-slate-100 transition-colors"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <Calculator size={12} className="text-slate-400" />
                                                        <span className="text-[10px] font-bold uppercase text-slate-600 tracking-wider">Detall d'Amidament</span>
                                                    </div>
                                                    {expandedSidebarSections.measurements ? <ChevronDown size={12} className="text-slate-400" /> : <ChevronRight size={12} className="text-slate-400" />}
                                                </button>
                                                {expandedSidebarSections.measurements && (
                                                    <div className="p-0">
                                                        <table className="w-full text-[11px]">
                                                            <thead className="bg-slate-50 border-b border-slate-100 text-[9px] uppercase text-slate-400 font-bold">
                                                                <tr>
                                                                    <th className="p-2 text-left">Ref</th>
                                                                    <th className="p-2 text-right w-12">Ud</th>
                                                                    <th className="p-2 text-right w-12">Ll</th>
                                                                    <th className="p-2 text-right w-12">Am</th>
                                                                    <th className="p-2 text-right w-12">Al</th>
                                                                    <th className="p-2 text-right w-16">Parc</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-100">
                                                                {/* Normal Lines */}
                                                                {(node.measurements || []).filter(m => !m.isIncrement).map(m => (
                                                                    <tr key={m.id} className="group">
                                                                        <td className="p-1.5"><input type="text" value={m.description} onChange={(e) => updateMeasurement(node.id, m.id, 'description', e.target.value)} className="w-full bg-transparent border-none text-slate-600 outline-none p-0" /></td>
                                                                        <td className="p-1.5"><input type="number" value={m.units} onChange={(e) => updateMeasurement(node.id, m.id, 'units', e.target.value)} className="w-full text-right bg-transparent border-none font-mono outline-none p-0" /></td>
                                                                        <td className="p-1.5"><input type="number" value={m.length} onChange={(e) => updateMeasurement(node.id, m.id, 'length', e.target.value)} className="w-full text-right bg-transparent border-none font-mono text-slate-400 outline-none p-0" /></td>
                                                                        <td className="p-1.5"><input type="number" value={m.width} onChange={(e) => updateMeasurement(node.id, m.id, 'width', e.target.value)} className="w-full text-right bg-transparent border-none font-mono text-slate-400 outline-none p-0" /></td>
                                                                        <td className="p-1.5"><input type="number" value={m.height} onChange={(e) => updateMeasurement(node.id, m.id, 'height', e.target.value)} className="w-full text-right bg-transparent border-none font-mono text-slate-400 outline-none p-0" /></td>
                                                                        <td className="p-1.5 text-right font-bold text-blue-900">
                                                                            <div className="flex items-center justify-end gap-1">
                                                                                {formatNumber(calcMeasureTotal(m), 2)}
                                                                                <button
                                                                                    onClick={() => deleteMeasurementLine(node.id, m.id)}
                                                                                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 p-0.5 ml-1"
                                                                                >
                                                                                    <X size={10} />
                                                                                </button>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                ))}

                                                                {/* Increment Lines */}
                                                                {(node.measurements || []).filter(m => m.isIncrement).map(m => {
                                                                    const subtotal = (node.measurements || []).filter(line => !line.isIncrement).reduce((acc, line) => acc + calcMeasureTotal(line), 0);
                                                                    const partial = subtotal * ((parseFloat(m.units) || 0) / 100);

                                                                    return (
                                                                        <tr key={m.id} className="group bg-slate-50">
                                                                            <td className="p-1.5 bg-slate-50"><input type="text" value={m.description} onChange={(e) => updateMeasurement(node.id, m.id, 'description', e.target.value)} className="w-full bg-transparent border-none text-slate-600 outline-none p-0 italic" /></td>
                                                                            <td className="p-1.5 text-right text-slate-500 text-[10px]">%</td>
                                                                            <td className="p-1.5"><input type="number" value={m.units} onChange={(e) => updateMeasurement(node.id, m.id, 'units', e.target.value)} className="w-full text-right bg-transparent border-none font-mono font-bold outline-none p-0" /></td>
                                                                            <td colSpan={2} className="p-1.5 text-center text-slate-300">-</td>
                                                                            <td className="p-1.5 text-right font-bold text-blue-900 bg-slate-50">
                                                                                <div className="flex items-center justify-end gap-1">
                                                                                    {formatNumber(partial, 2)}
                                                                                    <button
                                                                                        onClick={() => deleteMeasurementLine(node.id, m.id)}
                                                                                        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 p-0.5 ml-1"
                                                                                    >
                                                                                        <X size={10} />
                                                                                    </button>
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    )
                                                                })}
                                                            </tbody>
                                                        </table>
                                                        <div className="p-2 bg-slate-50 border-t border-slate-100 flex justify-between items-center gap-2">
                                                            <div className="flex gap-2">
                                                                <button onClick={() => addMeasurementLine(node.id)} className="text-[9px] bg-white border border-slate-200 px-2 py-1 flex items-center gap-1 hover:bg-slate-100 transition-colors uppercase font-bold text-slate-600">
                                                                    <Plus size={10} /> Afegir línia
                                                                </button>
                                                                <button onClick={() => addIncrementLine(node.id)} className="text-[9px] bg-white border border-slate-200 px-2 py-1 flex items-center gap-1 hover:bg-slate-100 transition-colors uppercase font-bold text-slate-600">
                                                                    <Percent size={10} /> Afegir %
                                                                </button>
                                                            </div>
                                                            <span className="text-[10px] font-mono font-bold text-blue-700">{formatNumber(calcItemTotalQty(node), 2)} {node.unit}</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Justification Section */}
                                        {node.unit && (
                                            <div className="bg-white border border-slate-200 rounded shadow-sm overflow-hidden">
                                                <button
                                                    onClick={() => toggleSidebarSection('justification')}
                                                    className="w-full px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between hover:bg-slate-100 transition-colors"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <List size={12} className="text-slate-400" />
                                                        <span className="text-[10px] font-bold uppercase text-slate-600 tracking-wider">Justificació de Preu</span>
                                                    </div>
                                                    {expandedSidebarSections.justification ? <ChevronDown size={12} className="text-slate-400" /> : <ChevronRight size={12} className="text-slate-400" />}
                                                </button>
                                                {expandedSidebarSections.justification && (
                                                    <div className="p-0">
                                                        {renderJustificationTable(node)}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 opacity-20">
                            <MousePointer2 size={48} className="mb-4 text-slate-400" />
                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-center">Selecciona una partida<br />per veure els detalls</p>
                        </div>
                    )}
                </aside>
            </main>

            <footer className="bg-slate-950 border-t border-slate-800 p-2.5 px-6 text-[10px] text-slate-500 flex justify-between items-center z-40">
                <div className="flex gap-8 items-center uppercase font-bold tracking-widest">
                    <span className="flex items-center gap-2"><Layers size={12} className="text-blue-500" /> Jerarquia: <span className="text-white font-mono">{budget.chapters.length}</span></span>
                    <span className="flex items-center gap-2 text-blue-400 border-l border-slate-800 pl-8"><Database size={12} /> Conceptes: <span className="text-white font-mono">{Object.keys(priceDatabase).length}</span></span>
                    {lastSaved && (
                        <span className="flex items-center gap-2 text-slate-500 border-l border-slate-800 pl-8 italic">
                            <Save size={10} className="text-emerald-500" />
                            Desat: {lastSaved.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                    )}
                </div>
                <div className="font-mono text-[9px] opacity-30 uppercase">
                    FIEBDC-3/2024 • Text Editing Module
                </div>
            </footer>

            {notification && (
                <div className={`fixed bottom-16 left-1/2 -translate-x-1/2 px-8 py-4 border-2 text-white transition-all transform animate-in fade-in slide-in-from-bottom-8 flex items-center gap-4 z-[100] ${notification.type === 'error' ? 'bg-red-600 border-red-500' : 'bg-slate-950 border-slate-800'}`}>
                    <Info size={24} className="text-blue-400" />
                    <div className="flex flex-col">
                        <span className="text-sm font-bold tracking-tight leading-none mb-1">{notification.msg}</span>
                        <span className="text-[9px] opacity-60 font-bold uppercase">Sistema de gestió BC3</span>
                    </div>
                </div>
            )}

            {importPending && importPending.duplicates.length > 0 && (
                <ImportConfirmModal
                    code={importPending.duplicates[importPending.currentIdx].code}
                    description={importPending.duplicates[importPending.currentIdx].description}
                    onConfirm={() => handleConfirmDuplicate(true)}
                    onSkip={() => handleConfirmDuplicate(false)}
                />
            )}

            {showPemModal && (
                <PemAdjustmentModal
                    currentPem={budgetTotal}
                    onAdjust={adjustPem}
                    onClose={() => setShowPemModal(false)}
                />
            )}

            {showPrintConfigModal && (
                <PrintConfigModal
                    config={printConfig}
                    setConfig={setPrintConfig}
                    onClose={() => setShowPrintConfigModal(false)}
                />
            )}

            {showPrint && (
                <PrintView
                    budget={budget}
                    priceDatabase={priceDatabase}
                    calcItemTotalAmount={calcItemTotalAmount}
                    calcChapterTotal={calcChapterTotal}
                    budgetTotal={budgetTotal}
                    config={printConfig}
                    setConfig={setPrintConfig}
                    onOpenConfig={() => setShowPrintConfigModal(true)}
                    onClose={() => setShowPrint(false)}
                    onExportPDF={handleExportPDF}
                    onExportSummaryPDF={handleExportSummaryPDF}
                    handleExportXLSX={handleExportXLSX}
                />
            )}
        </div>
    );
}
