import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
    AlertCircle,
    FileCode,
    Box,
    Tag,
    List,
    AlignLeft,
    Printer,
    FileDown,
    X,
    Save,
    FilePlus,
    FolderOpen,
    User,
    FileSpreadsheet,
    Percent,
    Link as LinkIcon,
    Menu,
    Cloud,
    Undo2,
    Redo2,
    LogOut,
    Recycle,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// --- Imports Modularitzats ---
import {
    round2,
    normalizeCode,
    formatCurrency,
    formatNumber,
    getComponentCategory,
    calcMeasureTotal,
    calcItemTotalQty,
    getItemUnitPrice,
    calcItemCertifiedQty,
    calcItemCertifiedAmount,
    calcChapterCertifiedTotal,
    calcItemTotalAmount,
    calcChapterTotal,
    getPreviousCertId,
    buildCertificationSummary,
    buildCertificationDetail,
    safePct
} from './utils/calculations';
import { useCertification } from './hooks/useCertification';
import { useHistory } from './hooks/useHistory';
import { useGoogleDrive } from './hooks/useGoogleDrive';
import { useDriveConfig } from './context/DriveConfigContext';
import CertificationBar from './components/Certification/CertificationBar';
import CertificationSidebar from './components/Certification/CertificationSidebar';
import CertificationSummary from './components/Certification/CertificationSummary';
import CertificationSummaryModal from './components/Certification/CertificationSummaryModal';
import DriveSettingsModal from './components/DriveSettingsModal';
import NumberInput from './components/NumberInput';
import ProjectLibraryModal from './components/ProjectLibraryModal';
import LinkItemModal from './components/LinkItemModal';
import { listProjects, getProject, saveProject, deleteProject } from './utils/projectLibrary';
import { migrateBudget } from './utils/migrateBudget';
import { resolveMeasurementRefs, isRefLine, refLabel } from './utils/measurementRefs';
import { processBC3Data } from './utils/bc3Parser';
import { generateBC3, nomFitxerCertificacio } from './utils/bc3Writer';
import { numberToTextCatalan } from './utils/numberToText';
import { exportCertificationPDF } from './utils/certificationPdf';
import { safeFileName } from './utils/fileName';
import { descarregaBC3 } from './utils/corsProxy';
import { buildWasteSummary, formatMassa, nomTipus, TIPUS_RESIDU } from './utils/waste';
import { buildWasteStudy } from './utils/wasteStudy';
import { exportWasteStudyPDF } from './utils/wasteStudyPdf';
import WasteStudyModal from './components/WasteStudyModal';
import PriceBankPicker from './components/PriceBankPicker';
import {
    EXTENSIO_PROJECTE, MIME_PROJECTE, esFitxerProjecte, esFitxerBC3,
    serialitzaProjecte, llegeixProjecte,
} from './utils/projectFile';
import { toWindows1252Bytes } from './utils/googleDrive';

const formatPrice = (val) => formatNumber(val, 2);

const flattenBudget = (nodes, level = 0, parentRef = '', counterObj = { val: 0 }, config, priceDatabase) => {
    let rows = [];
    nodes.forEach((node) => {
        const isChapter = !node.unit;
        const shouldShowHeader = !isChapter || (level < config.maxLevels);

        if (shouldShowHeader) {
            counterObj.val++;
            const currentRef = parentRef ? `${parentRef}.${counterObj.val}` : `${counterObj.val}`;
            const displayCode = config.useCorrelativeCodes ? currentRef : node.code;
            const totalAmount = isChapter ? calcChapterTotal(node, priceDatabase) : calcItemTotalAmount(node, priceDatabase);

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
                rows.push(...flattenBudget(children, level + 1, currentRef, { val: 0 }, config, priceDatabase));
            } else {
                // Item Row
                rows.push({
                    type: 'item',
                    data: [
                        displayCode,
                        node.description,
                        node.unit,
                        formatNumber(calcItemTotalQty(node), 2),
                        formatPrice(getItemUnitPrice(node, priceDatabase)),
                        formatNumber(totalAmount, 2)
                    ]
                });
            }
        }
    });
    return rows;
};

// --- Component de Vista d'Impressió ---
const PrintView = ({ budget, priceDatabase, budgetTotal, config, onOpenConfig, onClose, onExportPDF, onExportSummaryPDF, handleExportXLSX }) => {
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

        const totalAmount = isChapter ? calcChapterTotal(node, priceDatabase) : calcItemTotalAmount(node, priceDatabase);
        const totalQty = isChapter ? 0 : calcItemTotalQty(node);
        const unitPrice = isChapter ? 0 : getItemUnitPrice(node, priceDatabase);

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
                                        const total = calcChapterTotal(ch, priceDatabase);
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
                                <NumberInput
                                    className="w-full text-center bg-slate-50 border border-slate-200 p-4 text-xl font-mono focus:border-blue-500 outline-none font-bold"
                                    value={Number(percentage.toFixed(2))}
                                    onChange={(v) => handlePercentageChange(v)}
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 font-bold">%</span>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] uppercase font-black text-slate-500 tracking-widest text-center block">PEM Objectiu</label>
                            <div className="relative">
                                <NumberInput
                                    className="w-full text-center bg-blue-50 border border-blue-200 p-4 text-xl font-mono focus:border-blue-600 outline-none font-bold text-blue-700"
                                    value={Number(targetPem.toFixed(2))}
                                    onChange={(v) => handleTargetChange(v)}
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
const PrintConfigModal = ({ config, setConfig, onClose }) => {
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
                                    <NumberInput
                                        value={config.ge.percentage}
                                        onChange={v => setConfig({ ...config, ge: { ...config.ge, percentage: v } })}
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
                                    <NumberInput
                                        value={config.ip.percentage}
                                        onChange={v => setConfig({ ...config, ip: { ...config.ip, percentage: v } })}
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
                                    <NumberInput
                                        value={config.iva.percentage}
                                        onChange={v => setConfig({ ...config, iva: { ...config.iva, percentage: v } })}
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
const ItemCreator = ({ onClose, onSave, parentId, parentCode, onTriarDelBanc }) => {
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

                    {mode === 'item' && onTriarDelBanc && (
                        <button
                            type="button"
                            onClick={() => onTriarDelBanc((c) => setData({
                                code: c.code, description: c.description, unit: c.unit || 'u', price: c.price || 0,
                            }))}
                            className="flex items-center justify-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 p-2.5 text-[10px] font-bold uppercase tracking-widest transition-colors"
                        >
                            <Database size={13} /> Omplir des del banc de preus
                        </button>
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
                            <NumberInput
                                className="w-full bg-slate-50 border border-slate-200 p-2 text-xs font-mono focus:border-blue-500 outline-none font-bold text-blue-600"
                                value={data.price}
                                onChange={v => setData({ ...data, price: v })}
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
            const data = saved ? JSON.parse(saved) : { id: '1', name: 'Projecte BC3', chapters: [] };
            if (!data.certifications) data.certifications = [];
            return migrateBudget(data).budget;
        } catch (e) {
            console.error("Error parsing saved budget", e);
            return { id: '1', name: 'Projecte BC3', chapters: [], certifications: [] };
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

    const [appMode, setAppMode] = useState('budget'); // 'budget' | 'certification'
    const [activeCertId, setActiveCertId] = useState(null);

    // Auto-save effect
    useEffect(() => {
        const timer = setTimeout(() => {
            localStorage.setItem('amidaments_budget', JSON.stringify(budget));
            localStorage.setItem('amidaments_prices', JSON.stringify(priceDatabase));

            // I una còpia a la biblioteca, perquè obrir-ne un altre no destrueixi aquest.
            if (budget.chapters?.length > 0) {
                const total = budgetTotal;
                const res = saveProject({ id: budget.id, budget, priceDatabase, total });
                if (res.ok) setLibrary(listProjects());
                else notify('No hi ha prou espai al navegador per desar la còpia de seguretat', 'error');
            }
        }, 1000);
        return () => clearTimeout(timer);
    }, [budget, priceDatabase]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const handleBeforeUnload = () => {
            localStorage.setItem('amidaments_budget', JSON.stringify(budget));
            localStorage.setItem('amidaments_prices', JSON.stringify(priceDatabase));
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [budget, priceDatabase]);

    useEffect(() => {
        if (activeCertId || !(budget.certifications?.length > 0)) return;
        // Obrir sempre per la primera fase deixava l'usuari en una certificació ja aprovada
        // i, per tant, bloquejada. Comencem per l'última oberta, que és on es treballa.
        const obertes = budget.certifications.filter(c => !c.approved);
        const perDefecte = obertes.length > 0
            ? obertes[obertes.length - 1]
            : budget.certifications[budget.certifications.length - 1];
        setActiveCertId(perDefecte.id);
    }, [budget.certifications, activeCertId]);
    const [activeTab, setActiveTab] = useState('editor');
    const [selectedId, setSelectedId] = useState(null);
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
        certItemDetail: true,
        ge: { enabled: false, percentage: 13 },
        ip: { enabled: false, percentage: 6 },
        iva: { enabled: false, percentage: 21 }
    });
    const [showPrint, setShowPrint] = useState(false);
    const [showWasteStudy, setShowWasteStudy] = useState(false);
    // Selector del banc de preus. `picker.onPick` decideix què se'n fa: una línia de
    // descomposat, una partida nova… Amb un sol estat n'hi ha prou per a tots els casos.
    const [picker, setPicker] = useState(null);
    const [showPemModal, setShowPemModal] = useState(false);
    const [importPending, setImportPending] = useState(null);
    const [notification, setNotification] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [showSaveDropdown, setShowSaveDropdown] = useState(false);

    const notify = (msg, type = 'info') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 5000);
    };

    // Reordering State
    const [draggedNodeId, setDraggedNodeId] = useState(null);
    const [dragOverTarget, setDragOverTarget] = useState(null); // { id, position: 'before' | 'after' }

    // Sidebar state
    const [sidebarWidth, setSidebarWidth] = useState(450);
    const [expandedSidebarSections, setExpandedSidebarSections] = useState({
        title: true,
        description: true,
        measurements: true,
        justification: true,
        certification: true
    });

    // Mobile state
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    const [showMobileSidebar, setShowMobileSidebar] = useState(false);
    const [showSearchExpanded, setShowSearchExpanded] = useState(false);

    const isResizing = useRef(false);

    // Initialize Certification Actions
    const certActions = useCertification(budget, setBudget, notify);

    // ── Google Drive ─────────────────────────────────────────────────────────
    const { config: driveConfig, setCredentials, hasCredentials } = useDriveConfig();
    const [showDriveSettings, setShowDriveSettings] = useState(false);
    const [showOpenDropdown, setShowOpenDropdown] = useState(false);

    // Callback quan Drive carrega un BC3 (ArrayBuffer) → reutilitza el flux existent
    const handleBC3FromDrive = useCallback((arrayBuffer) => {
        const decoder = new TextDecoder('windows-1252');
        const text = decoder.decode(arrayBuffer);
        const result = processBC3Data(text);
        if (result) {
            startImportProcess(result, { replace: true });
        } else {
            notify('Format BC3 no reconegut', 'error');
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const drive = useGoogleDrive({
        clientId: driveConfig.clientId,
        apiKey: driveConfig.apiKey,
        appId: driveConfig.appId,
        onProjectLoaded: ({ budget: b, priceDatabase: pd }) => {
            adoptaProjecte(b);
            setPriceDatabase(pd);
        },
        onBC3Loaded: handleBC3FromDrive,
        notify,
    });

    // Helper: connecta Drive, obrint settings si cal
    const requireDrive = useCallback(async (action) => {
        if (!hasCredentials) { setShowDriveSettings(true); return; }
        await action();
    }, [hasCredentials]);


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

    const [showNewCertInput, setShowNewCertInput] = useState(false);
    const [showCertSummary, setShowCertSummary] = useState(false);
    const [showLibrary, setShowLibrary] = useState(false);
    const [linkTarget, setLinkTarget] = useState(null); // id de la partida que rep el vincle
    const [library, setLibrary] = useState(() => listProjects());
    const [newCertName, setNewCertName] = useState('');

    const createCertification = useCallback(() => {
        const name = newCertName.trim() || `Certificació ${budget.certifications.length + 1}`;
        const newId = Date.now().toString();
        const newCert = {
            id: newId,
            name: name,
            date: new Date().toISOString().split('T')[0],
            method: 'origin' // Default to 'At Origin' (Presto style)
        };

        setBudget(prev => ({
            ...prev,
            certifications: [...(prev.certifications || []), newCert]
        }));
        setActiveCertId(newId);
        setShowNewCertInput(false);
        setNewCertName('');
        setNotification({ msg: `Nova certificació "${name}" creada`, type: 'success' });
        setTimeout(() => setNotification(null), 3000);
    }, [newCertName, budget.certifications]);










    // Desfer / refer sobre el projecte sencer (arbre + banc de preus).
    const aplicaInstantania = useCallback((instantania) => {
        setBudget(instantania.budget);
        setPriceDatabase(instantania.priceDatabase);
    }, []);
    const historial = useHistory({ budget, priceDatabase }, aplicaInstantania);

    useEffect(() => {
        const onKeyDown = (e) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            const k = e.key.toLowerCase();
            if (k === 'z' && !e.shiftKey) { e.preventDefault(); historial.undo(); }
            else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); historial.redo(); }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [historial]);

    /**
     * Punt d'entrada únic per a qualsevol projecte que arribi de fora (disc, Drive,
     * biblioteca). Hi aplica les migracions d'esquema pendents i avisa si ha convertit
     * dades, perquè el canvi no passi desapercebut.
     */
    const adoptaProjecte = useCallback((entrant) => {
        const { budget: migrat, migrat: haCanviat } = migrateBudget(entrant);
        setBudget(migrat);
        if (haCanviat) {
            notify('Certificacions convertides al format nou: els imports es conserven igual');
        }
        return migrat;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleOpenFromLibrary = useCallback((id) => {
        const projecte = getProject(id);
        if (!projecte) { notify('Aquest projecte ja no hi és', 'error'); return; }
        adoptaProjecte(projecte.budget);
        setPriceDatabase(projecte.priceDatabase || {});
        setSelectedId(null);
        setActiveCertId(null);
        setShowLibrary(false);
        historial.clear();
        notify(`Projecte obert: ${projecte.budget?.name || ''}`);
    }, [historial]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleDeleteFromLibrary = useCallback((id) => {
        const p = library.find(x => x.id === id);
        if (p && !confirm(`Treure "${p.name}" de la llista de projectes recents?`)) return;
        deleteProject(id);
        setLibrary(listProjects());
    }, [library]);

    const handleDeleteCertification = useCallback((certId) => {
        const cert = (budget.certifications || []).find(c => c.id === certId);
        if (!cert) return;
        if (!confirm(`Eliminar "${cert.name}"?\n\nEs perdran els amidaments certificats en aquesta fase. Aquesta acció es pot desfer amb Ctrl+Z.`)) return;
        certActions.deleteCertification(certId);
        // Si esborrem la fase activa, saltem a una altra perquè la vista no quedi buida.
        const restants = (budget.certifications || []).filter(c => c.id !== certId);
        if (activeCertId === certId) setActiveCertId(restants.length ? restants[restants.length - 1].id : null);
    }, [budget.certifications, activeCertId, certActions]);

    /**
     * Arbre amb les línies d'amidament vinculades ja resoltes.
     *
     * `budget.chapters` continua essent el que s'edita i el que es desa —amb els vincles
     * intactes— i aquest és el que es mostra, es calcula i s'exporta. Resoldre-ho aquí, un
     * sol cop, evita haver d'ensenyar a resoldre vincles a la dotzena de funcions de
     * `calculations.js`.
     */
    const resolt = useMemo(() => resolveMeasurementRefs(budget.chapters), [budget.chapters]);
    const resolvedChapters = resolt.chapters;

    const budgetTotal = useMemo(() => {
        return resolvedChapters.reduce((acc, ch) => acc + calcChapterTotal(ch, priceDatabase), 0);
    }, [resolvedChapters, priceDatabase]);

    // Resum de la certificació activa. Es recalcula a cada canvi de l'arbre, de manera
    // que el percentatge certificat s'actualitza mentre s'edita.
    const certificationSummary = useMemo(
        () => buildCertificationSummary(resolvedChapters, activeCertId, priceDatabase, budget.certifications || []),
        [resolvedChapters, budget.certifications, activeCertId, priceDatabase]
    );

    // Sense passar budget.certifications, una fase amb mètode 'partial' no acumulava
    // i el total del capçal no coincidia amb el de les partides.
    const certifiedTotal = activeCertId ? certificationSummary.totals.origin : 0;

    // Residus. Sobre `resolvedChapters`: si es fes sobre `budget.chapters`, les partides amb
    // amidament vinculat comptarien zero.
    const wasteSummary = useMemo(() => buildWasteSummary(resolvedChapters), [resolvedChapters]);

    const activeCert = (budget.certifications || []).find(c => c.id === activeCertId) || null;
    const previousCert = certificationSummary.prevCertId
        ? (budget.certifications || []).find(c => c.id === certificationSummary.prevCertId) || null
        : null;

    /**
     * El botó d'imprimir segueix el mode actiu. En pressupost obre la vista d'impressió;
     * en certificació, el document de la fase, que és on hi ha les opcions de G.G./B.I./IVA
     * i l'exportació a PDF. Per imprimir el pressupost des del mode certificació, es canvia
     * de mode: la resta de la interfície ja funciona així.
     */
    const obreImpressio = useCallback(() => {
        if (appMode !== 'certification') { setShowPrint(true); return; }
        if (!activeCertId) {
            notify('Crea o selecciona una certificació per poder imprimir-la', 'error');
            return;
        }
        setShowCertSummary(true);
    }, [appMode, activeCertId]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleExportCertificationPDF = useCallback(() => {
        if (!activeCertId) {
            notify('Selecciona una certificació abans d\'exportar', 'error');
            return;
        }
        const certs = budget.certifications || [];
        const cert = certs.find(c => c.id === activeCertId);
        exportCertificationPDF({
            budget: { ...budget, chapters: resolvedChapters },
            summary: certificationSummary,
            detail: printConfig.certItemDetail
                ? buildCertificationDetail(resolvedChapters, activeCertId, priceDatabase, certs)
                : [],
            cert,
            certIndex: certs.findIndex(c => c.id === activeCertId) + 1,
            config: { ...printConfig, showItemDetail: printConfig.certItemDetail },
        });
        notify(`Certificació "${cert?.name}" exportada en PDF`);
    }, [budget, priceDatabase, activeCertId, certificationSummary, printConfig]); // eslint-disable-line react-hooks/exhaustive-deps

    /** Genera l'estudi de gestió de residus del RD 105/2008 amb els paràmetres del modal. */
    const handleWasteStudy = useCallback(({ dades, tarifes }) => {
        exportWasteStudyPDF({
            budget,
            summary: wasteSummary,
            study: buildWasteStudy(wasteSummary, tarifes),
            dades,
        });
        setShowWasteStudy(false);
        notify('Estudi de gestió de residus generat');
    }, [budget, wasteSummary]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleExportPDF = useCallback((config) => {
        const doc = new jsPDF('p', 'mm', 'a4');
        const counter = { val: 0 };
        const date = new Date().toLocaleDateString('ca-ES');

        const generateTableForNodes = (nodes, isFirst, currentCounter) => {
            const rows = flattenBudget(nodes, 0, '', currentCounter, config, priceDatabase);

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
                didDrawPage: () => {
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
            resolvedChapters.forEach((ch, idx) => {
                if (idx > 0) doc.addPage();
                generateTableForNodes([ch], idx === 0, counter);
            });
        } else {
            generateTableForNodes(resolvedChapters, true, counter);
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

        doc.save(`Amidaments_${safeFileName(budget.name, 'projecte')}.pdf`);
    }, [budget, resolvedChapters, priceDatabase, budgetTotal]);

    const handleExportSummaryPDF = useCallback((config) => {
        const doc = new jsPDF('p', 'mm', 'a4');
        const PEMValue = budgetTotal;
        const date = new Date().toLocaleDateString('ca-ES');

        const GE = config.ge.enabled ? PEMValue * (config.ge.percentage / 100) : 0;
        const IP = config.ip.enabled ? PEMValue * (config.ip.percentage / 100) : 0;
        const PECValue = PEMValue + GE + IP;
        const VAT = config.iva.enabled ? PECValue * (config.iva.percentage / 100) : 0;
        const PVValue = PECValue + VAT;

        const rows = resolvedChapters.map((ch, index) => {
            const total = calcChapterTotal(ch, priceDatabase);
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
            didDrawPage: () => {
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

        doc.save(`${safeFileName(budget.name, 'projecte')}_resum.pdf`);
    }, [budget, resolvedChapters, priceDatabase, budgetTotal]);

    const handleExportXLSX = useCallback(() => {
        const wb = XLSX.utils.book_new();

        const createWorksheetData = (nodes) => {
            const data = [];
            data.push(['CODI', 'DESCRIPCIÓ', 'UD', 'LONGITUD', 'AMPLADA', 'ALÇADA', 'PARCIALS', 'QUANTITAT', 'PREU', 'IMPORT']);
            let rowAcc = 2;

            const pushNodes = (ns) => {
                ns.forEach(node => {
                    const isChapter = !node.unit;
                    const totalAmount = isChapter ? calcChapterTotal(node, priceDatabase) : calcItemTotalAmount(node, priceDatabase);

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
            resolvedChapters.forEach(ch => {
                summaryData.push([ch.code, ch.description.toUpperCase(), calcChapterTotal(ch, priceDatabase)]);
            });
            const wsResum = XLSX.utils.aoa_to_sheet(summaryData);
            wsResum['!cols'] = [{ wch: 15 }, { wch: 60 }, { wch: 15 }];
            XLSX.utils.book_append_sheet(wb, wsResum, "Resum");

            // 2. Create Sheet for each Top Chapter
            resolvedChapters.forEach((ch, idx) => {
                const ws = createWorksheetData([ch]);
                // Sheet name derived from code or Index to be safe
                const name = (ch.code || `Cap ${idx + 1}`).substring(0, 31).replace(/[[\]*?/\\]/g, '');
                XLSX.utils.book_append_sheet(wb, ws, name);
            });
        } else {
            const ws = createWorksheetData(resolvedChapters);
            XLSX.utils.book_append_sheet(wb, ws, "Pressupost");
        }

        XLSX.writeFile(wb, `${safeFileName(budget.name, 'projecte')}.xlsx`);
    }, [budget, resolvedChapters, priceDatabase, printConfig.chaptersOnNewPage, printConfig.showLongDesc]);

    // --- Search Filtering ---
    const filteredChapters = useMemo(() => {
        if (!searchTerm.trim()) return resolvedChapters;

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

        return filterNodes(resolvedChapters);
    }, [resolvedChapters, searchTerm]);

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
                    const dbUnit = priceDatabase[normCode]?.unit;
                    const isActuallyPercent = dbUnit === '%' || b.unit === '%' || b.code === '%';
                    const percentageCost = levelBase * (isActuallyPercent ? bYield / 100 : bYield);
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

        if (resolvedChapters) {
            traverse(resolvedChapters);
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
    }, [resolvedChapters, priceDatabase]);

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
    const updateGlobalPrice = (code, newPrice) => {
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
        const price = parseFloat(data.price) || 0;
        const breakdown = [];
        if (data.type === 'item' && price > 0) {
            breakdown.push({
                code: 'pa' + data.code,
                description: data.description,
                unit: data.unit,
                yield: 1,
                price: price,
                total: price
            });
        }

        const newNode = {
            id: crypto.randomUUID(),
            code: data.code,
            description: data.description,
            fullDescription: data.description,
            unit: data.type === 'item' ? data.unit : null,
            price: price,
            breakdown: breakdown,
            items: [],
            subChapters: [],
            measurements: data.type === 'item' ? [{ id: crypto.randomUUID(), description: 'Base', units: 0, length: 0, width: 0, height: 0 }] : []
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

                // Les certificacions van indexades per certId; les fases importades porten
                // ids nous, així que no xoquen amb les existents i es poden fusionar.
                if (newNode.certifications && Object.keys(newNode.certifications).length > 0) {
                    updatedNode.certifications = { ...(existingNode.certifications || {}), ...newNode.certifications };
                }

                merged[existingIdx] = updatedNode;
            } else {
                merged.push(deepCloneNode(newNode));
            }
        });
        return merged;
    };



    // --- Exportació BC3 ---
    //
    // La norma vol un fitxer per document: el pressupost per una banda i cada certificació per
    // una altra, amb el seu registre ~V. L'escriptor viu a `utils/bc3Writer.js`; aquí només es
    // decideix QUÈ s'exporta, que és el que està actiu a la interfície.
    const seleccioBC3 = useMemo(() => {
        const certs = budget.certifications || [];
        const idx = certs.findIndex(c => c.id === activeCertId);
        if (appMode !== 'certification' || idx === -1) return null;
        return { cert: certs[idx], numero: idx + 1 };
    }, [appMode, activeCertId, budget.certifications]);

    /** Què diu el menú que s'exportarà, perquè no sigui una sorpresa en clicar. */
    const etiquetaBC3 = seleccioBC3
        ? `Certificació ${seleccioBC3.numero} · ${seleccioBC3.cert.name}`
        : 'Pressupost i amidaments';

    const documentBC3 = useCallback(() => ({
        contingut: generateBC3({ budget, chapters: resolvedChapters, priceDatabase, certification: seleccioBC3 }),
        // Convenció de nom de la norma: el del pressupost més «#certification NNNN», que és el
        // que permet que un programa importi el pressupost i les certificacions que vulgui
        // d'una tacada.
        nom: seleccioBC3
            ? nomFitxerCertificacio(budget.name, seleccioBC3.numero)
            : (budget.name || 'projecte'),
        etiqueta: seleccioBC3 ? `Certificació ${seleccioBC3.numero}` : 'Pressupost',
    }), [budget, resolvedChapters, priceDatabase, seleccioBC3]);

    const handleExportBC3ToDrive = useCallback(() => {
        const doc = documentBC3();
        // Una certificació sempre va a un fitxer nou: el que es té obert a Drive és el del
        // pressupost i no s'hi ha de proposar de sobreescriure'l.
        requireDrive(() => drive.exportBC3ToDrive(doc.contingut, doc.nom, !!seleccioBC3));
    }, [drive, requireDrive, documentBC3, seleccioBC3]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleExportBC3 = () => {
        const doc = documentBC3();

        // El BC3 s'escriu en Windows-1252 (ANSI): és el que esperen Presto i Arquímedes.
        // La conversió viu a utils/googleDrive.js perquè l'exportació a Drive la necessita igual.
        const win1252Array = toWindows1252Bytes(doc.contingut);
        const blob = new Blob([win1252Array], { type: 'text/plain;charset=windows-1252' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${safeFileName(doc.nom, 'projecte')}.bc3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        notify(`${doc.etiqueta} exportada en BC3 (Windows-1252)`);
    };


    // --- Project Management Handlers ---
    const fileInputRef = React.useRef(null);

    const handleDownloadProject = () => {
        const blob = new Blob([serialitzaProjecte(budget, priceDatabase)], { type: MIME_PROJECTE });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${safeFileName(budget.name, 'projecte')}${EXTENSIO_PROJECTE}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        notify("Projecte desat correctament");
    };

    const handleOpenProject = () => {
        fileInputRef.current?.click();
    };

    /**
     * Obre un fitxer, vingui d'on vingui: del selector, de la File Handling API o del menú de
     * compartir del sistema. Els tres camins feien la seva pròpia comprovació —i la de la File
     * Handling API mirava un camp que no s'escrivia enlloc— així que ara passen tots per aquí.
     */
    const obreFitxer = useCallback(async (file, { replace = true, nomesPreus = false } = {}) => {
        if (!file) return;

        // Deixar anar un fitxer sobre el banc de preus no ha de tocar el pressupost: el que
        // s'hi vol és ampliar el catàleg de conceptes per poder-los fer servir després.
        if (nomesPreus) {
            if (!esFitxerBC3(file.name)) {
                notify('Al banc de preus només s\'hi poden deixar anar fitxers .bc3', 'error');
                return;
            }
            const text = new TextDecoder('windows-1252').decode(await file.arrayBuffer());
            const result = processBC3Data(text);
            if (!result) { notify('Format BC3 no reconegut', 'error'); return; }
            afegeixAlBanc(result.prices || {});
            return;
        }

        if (esFitxerProjecte(file.name)) {
            const projecte = llegeixProjecte(await file.text());
            if (!projecte) {
                notify(`"${file.name}" no sembla un projecte d'amidaments`, 'error');
                return;
            }
            adoptaProjecte(projecte.budget);
            setPriceDatabase(projecte.priceDatabase);
            notify('Projecte carregat correctament');
            return;
        }

        if (esFitxerBC3(file.name)) {
            // El BC3 és Windows-1252, no UTF-8: llegir-lo com a text el destrossaria.
            const text = new TextDecoder('windows-1252').decode(await file.arrayBuffer());
            const result = processBC3Data(text);
            if (result) startImportProcess(result, { replace });
            else notify('Format BC3 no reconegut', 'error');
            return;
        }

        notify(`Format no suportat. Fes servir ${EXTENSIO_PROJECTE} o .bc3`, 'error');
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    /**
     * Afegeix conceptes al banc de preus sense tocar l'arbre.
     *
     * Els que ja hi són **no es trepitgen**: el preu del projecte mana sobre el del fitxer que
     * arriba, que és el que espera qui ja ha ajustat un preu a mà.
     */
    const afegeixAlBanc = useCallback((nous) => {
        const entrades = Object.entries(nous || {}).filter(([codi]) => codi);
        if (entrades.length === 0) { notify('El fitxer no porta cap concepte amb preu', 'error'); return; }

        // El recompte es fa fora de l'updater: React el crida durant el render, no en
        // despatxar, de manera que llegir-lo tot seguit donava sempre zero (i amb StrictMode,
        // el doble). El mateix parany que ja hi havia a `importCertification`.
        let afegits = 0;
        let existents = 0;
        const seguent = { ...priceDatabase };
        entrades.forEach(([codi, dades]) => {
            if (seguent[codi]) { existents++; return; }
            seguent[codi] = dades;
            afegits++;
        });
        setPriceDatabase(seguent);
        notify(afegits > 0
            ? `${afegits} conceptes afegits al banc de preus${existents ? ` (${existents} ja hi eren)` : ''}`
            : `Tots els conceptes ja hi eren (${existents})`);
    }, [priceDatabase]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        obreFitxer(file);
        e.target.value = ''; // Reset input
    };

    const handleNewProject = () => {
        if (budget.chapters.length > 0 || Object.keys(priceDatabase).length > 0) {
            if (!confirm('Estàs segur que vols crear un nou projecte? Es perdran les dades no desades.')) {
                return;
            }
        }
        setBudget({ id: crypto.randomUUID(), name: 'Nou Projecte', chapters: [], certifications: [] });
        setPriceDatabase({});
        setSelectedId(null);
        historial.clear();
        notify("Nou projecte creat");
    };

    /** Cerca una partida per codi normalitzat a tot l'arbre. */
    const buscaPerCodi = (nodes, codi) => {
        for (const n of nodes || []) {
            if (n.unit && normalizeCode(n.code) === codi) return n;
            const dins = buscaPerCodi([...(n.subChapters || []), ...(n.items || [])], codi);
            if (dins) return dins;
        }
        return null;
    };

    /**
     * Incorpora un fitxer de certificació (`~V` amb TIPUS_INFORMACIO = 3) al projecte obert.
     *
     * La norma diu que el fitxer d'una certificació té la mateixa estructura que el del
     * pressupost i que els seus amidaments són els executats **a origen**, que és exactament
     * el que aquesta aplicació desa a `node.certifications[certId]`. Per tant no cal
     * reconstruir res: només fer coincidir els codis i penjar-hi les línies.
     *
     * El número de certificació és la posició de la fase (la primera és la 1). Si ja n'hi ha
     * una amb aquest número, es demana si es vol substituir; si no, s'afegeix al final.
     */
    const importCertification = (result) => {
        const num = result.info?.certNumber || (budget.certifications?.length || 0) + 1;
        const certs = budget.certifications || [];
        const existent = num >= 1 && num <= certs.length ? certs[num - 1] : null;

        if (existent) {
            const ok = window.confirm(
                `El fitxer és la certificació ${num} i el projecte ja en té una en aquesta posició ` +
                `("${existent.name}").\n\n[Accepta] Substituir-ne els amidaments\n[Cancel·la] No importar`
            );
            if (!ok) return;
            if (existent.approved) {
                notify(`"${existent.name}" està aprovada. Reobre-la abans d'importar-hi res.`, 'error');
                return;
            }
        }

        // Amidaments certificats del fitxer, indexats per codi.
        const perCodi = new Map();
        const recull = (nodes) => nodes.forEach(n => {
            if (n.unit && (n.measurements || []).length > 0) {
                perCodi.set(normalizeCode(n.code), n.measurements);
            }
            recull([...(n.subChapters || []), ...(n.items || [])]);
        });
        recull(result.chapters || []);

        const certId = existent ? existent.id : crypto.randomUUID();
        let trobades = 0;
        const desconegudes = [];

        const aplica = (nodes) => nodes.map(n => {
            const seguent = {
                ...n,
                subChapters: aplica(n.subChapters || []),
                items: aplica(n.items || []),
            };
            if (!n.unit) return seguent;

            const linies = perCodi.get(normalizeCode(n.code));
            const certifications = { ...(n.certifications || {}) };
            if (linies) {
                trobades++;
                certifications[certId] = {
                    quantity: linies.reduce((acc, m) => acc + (m.units || 0) * (m.length || 1) * (m.width || 1) * (m.height || 1), 0),
                    measurements: linies.map(m => ({ ...m, id: crypto.randomUUID() })),
                };
            } else if (existent) {
                // Substituir una certificació vol dir substituir-la sencera: el que el fitxer
                // no porta, no està certificat.
                delete certifications[certId];
            }
            return { ...seguent, certifications };
        });

        perCodi.forEach((_, codi) => { if (!buscaPerCodi(budget.chapters, codi)) desconegudes.push(codi); });

        // L'arbre es calcula aquí i no dins de l'updater: `aplica` compta les partides
        // trobades i el missatge de sota les ha de poder llegir.
        const nousChapters = aplica(budget.chapters);

        const fase = existent || {
            id: certId,
            name: result.info?.comment?.trim() || `Certificació ${num}`,
            date: result.info?.certDate || new Date().toISOString().split('T')[0],
            approved: false,
            method: 'origin',
        };

        setBudget(prev => ({
            ...prev,
            chapters: nousChapters,
            certifications: existent ? prev.certifications : [...(prev.certifications || []), fase],
        }));
        setAppMode('certification');
        setActiveCertId(certId);

        const avis = desconegudes.length > 0 ? ` (${desconegudes.length} codis del fitxer no són al pressupost)` : '';
        notify(`Certificació ${num} importada: ${trobades} partides${avis}`);
    };

    const startImportProcess = (result, options = {}) => {
        const { replace = false } = options;

        // Un fitxer de certificació sobre un projecte obert no és un projecte nou: són els
        // amidaments executats d'aquest mateix pressupost. Sense projecte obert s'importa com
        // qualsevol altre fitxer, que és el que es pot fer amb el que hi ha.
        if (result.info?.type === 3 && (budget.chapters || []).length > 0) {
            importCertification(result);
            return;
        }

        if (replace) {
            finalizeImport(result, { replace: true });
            return;
        }

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

    const finalizeImport = (result, options = {}) => {
        const { replace = false } = options;

        // El parser retorna les fases del BC3 sota la clau `phases`.
        const importedPhases = result.phases || [];

        if (replace) {
            setPriceDatabase(result.prices || {});
            setBudget(migrateBudget({
                id: crypto.randomUUID(),
                name: result.name || 'Projecte Importat',
                chapters: result.chapters,
                certifications: importedPhases
            }).budget);
            notify("Projecte obert correctament");
        } else {
            setPriceDatabase(prev => ({ ...prev, ...result.prices }));
            setBudget(prev => ({
                ...prev,
                chapters: mergeTreeBranches(prev.chapters, result.chapters),
                certifications: [...(prev.certifications || []), ...importedPhases]
            }));
            notify("Dades importades correctament");
        }
    };

    // --- BC3 URL Handlers (defined after dependencies) ---
    /**
     * Importa un BC3 des d'una URL: el cas de l'enllaç arrossegat del Generador de Preus.
     * La descàrrega i els proxys CORS viuen a `utils/corsProxy.js`.
     */
    const importFromUrl = useCallback(async (url, { nomesPreus = false } = {}) => {
        if (!url) return;
        try {
            notify('Descarregant la partida...');
            const { text, via } = await descarregaBC3(url);
            const result = processBC3Data(text);
            if (result) {
                // Sobre la pestanya del banc de preus, l'enllaç ha de fer el mateix que el
                // fitxer: ampliar el catàleg i no tocar el pressupost.
                if (nomesPreus) afegeixAlBanc(result.prices || {});
                else startImportProcess(result);
                console.log(`BC3 importat des de ${url} (via ${via})`);
            } else {
                notify('Format BC3 no reconegut', 'error');
            }
        } catch (err) {
            // El detall va a la consola i el missatge curt a la interfície: a l'usuari li
            // interessa què pot fer, no quin intermediari ha fallat.
            if (err.detall) console.error('Descàrrega fallida:', err.detall);
            else console.error('Error important dades:', err);
            notify(err.message, 'error');
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // --- Obrir des del sistema operatiu ---
    //
    // Dos camins, un per plataforma:
    //
    //   · Escriptori (Chromium): File Handling API. El manifest declara `file_handlers` amb
    //     .amid i .bc3, i el fitxer arriba pel `launchQueue`.
    //   · Android: Web Share Target. La File Handling API no hi existeix, així que la PWA es
    //     declara com a destinació del menú de compartir; el service worker rep el POST, desa
    //     el fitxer en un cache i ens redirigeix amb `?compartit=1`.
    //
    // iOS no en té cap dels dos: allà només queda obrir des de dins de l'aplicació.
    useEffect(() => {
        if ('launchQueue' in window) {
            window.launchQueue.setConsumer(async (launchParams) => {
                for (const handle of launchParams.files || []) {
                    await obreFitxer(await handle.getFile());
                }
            });
        }

        const recullCompartit = async () => {
            if (!new URLSearchParams(window.location.search).has('compartit')) return;
            // El paràmetre es treu de seguida perquè recarregar no reobri el mateix fitxer.
            window.history.replaceState({}, '', window.location.pathname);
            try {
                const cache = await caches.open('amidaments-compartit');
                const clau = `${window.location.pathname.replace(/[^/]*$/, '')}__compartit__`;
                const resposta = await cache.match(clau);
                if (!resposta) return;
                await cache.delete(clau);
                const nom = decodeURIComponent(resposta.headers.get('x-nom-fitxer') || 'compartit');
                await obreFitxer(new File([await resposta.blob()], nom));
            } catch (err) {
                notify('No s\'ha pogut llegir el fitxer compartit', 'error');
                console.error(err);
            }
        };
        recullCompartit();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
            } catch {
                // Tipus de dades no llegible del dataTransfer: l'ignorem.
            }
        }
        if (extractedUrl) candidates.unshift(extractedUrl);

        const url = candidates[0];
        if (url) {
            importFromUrl(url, { nomesPreus: activeTab === 'prices' });
            return;
        }

        // Arrossegar un fitxer accepta tant un projecte com un BC3. El BC3 es fusiona amb el
        // que hi ha —és el comportament de sempre— i un projecte substitueix, que és l'únic
        // que té sentit per a un fitxer que ja és un projecte sencer.
        //
        // Sobre la pestanya del banc de preus, però, el que es vol és ampliar el catàleg i no
        // tocar el pressupost: allà el fitxer només aporta conceptes.
        const file = e.dataTransfer.files[0];
        if (file) obreFitxer(file, { replace: false, nomesPreus: activeTab === 'prices' });
    };

    const handlePaste = useCallback((e) => {
        const text = e.clipboardData.getData('text/plain')?.trim();
        if (text && (text.toLowerCase().includes('.bc3') || text.toLowerCase().includes('generadordepreus'))) {
            importFromUrl(text, { nomesPreus: activeTab === 'prices' });
        }
        // `activeTab` ha d'anar a les dependències: sense ell el callback es quedaria amb la
        // pestanya que hi havia en muntar-se i enganxar un enllaç al banc de preus l'importaria
        // igualment al pressupost.
    }, [importFromUrl, activeTab]);


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

    const findNodeById = (nodes, id) => {
        for (const n of nodes) {
            if (n.id === id) return n;
            const trobat = findNodeById([...(n.subChapters || []), ...(n.items || [])], id);
            if (trobat) return trobat;
        }
        return null;
    };

    const addLinkedLine = (itemId, refCode, refLineId = null) => {
        // De la línia d'origen només se'n desa l'id: la descripció es resol a cada càlcul,
        // de manera que reanomenar-la a l'origen es reflecteix aquí.
        const origen = refLineId
            ? findNodeById(resolvedChapters, itemId) && buscaLinia(refCode, refLineId)
            : null;

        const updateInTree = (nodes) => nodes.map(node => {
            if (node.id === itemId) {
                return {
                    ...node,
                    measurements: [...(node.measurements || []), {
                        id: crypto.randomUUID(),
                        description: refLineId
                            ? `Igual que ${refCode} · ${origen?.description || 'una línia'}`
                            : `Igual que ${refCode}`,
                        refCode,
                        ...(refLineId ? { refLineId } : {}),
                        factor: 1,
                    }]
                };
            }
            return {
                ...node,
                subChapters: updateInTree(node.subChapters || []),
                items: updateInTree(node.items || [])
            };
        });
        setBudget(prev => ({ ...prev, chapters: updateInTree(prev.chapters) }));
        notify(refLineId ? `Amidament vinculat a una línia de ${refCode}` : `Amidament vinculat a ${refCode}`);
    };

    /** Troba una línia d'amidament dins de la partida amb aquest codi. */
    const buscaLinia = (code, lineId) => {
        const norm = normalizeCode(code);
        let trobada = null;
        const walk = (nodes) => nodes.forEach(n => {
            if (n.unit && normalizeCode(n.code) === norm) {
                const m = (n.measurements || []).find(x => x.id === lineId);
                if (m && !trobada) trobada = m;
            }
            walk([...(n.subChapters || []), ...(n.items || [])]);
        });
        walk(resolvedChapters);
        return trobada;
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

        // Si altres partides prenen l'amidament d'aquesta, avisar-ne abans: es quedarien a zero.
        const refs = resolt.refsPerCode.get(normalizeCode(node.code)) || 0;
        if (refs > 0) {
            const plural = refs === 1 ? 'línia d\'amidament vinculada' : 'línies d\'amidament vinculades';
            if (!confirm(`"${node.description}" té ${refs} ${plural} que hi apunten.\n\nSi l'elimines, aquelles línies es quedaran a zero. Pots desfer-ho amb Ctrl+Z.`)) {
                return;
            }
        }

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

    /**
     * @param {string} itemId partida a la qual s'afegeix la línia
     * @param {object} [concepte] concepte del banc de preus; sense ell, línia en blanc
     */
    const addBreakdownLine = (itemId, concepte = null) => {
        const linia = concepte
            ? { code: concepte.code, description: concepte.description, unit: concepte.unit || 'u', yield: 1, price: concepte.price || 0 }
            : { code: '', description: 'Nova línia', unit: 'u', yield: 1, price: 0 };
        const updateInTree = (nodes) => {
            return nodes.map(node => {
                if (node.id === itemId) {
                    return {
                        ...node,
                        breakdown: [...(node.breakdown || []), linia]
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
                // Només dividir per 100 si la unitat és '%' o el codi és '%'
                const unitFromDb = priceDatabase[normalizeCode(line.code)]?.unit;
                const isActuallyPercent = unitFromDb === '%' || line.unit === '%' || line.code === '%';
                if (isActuallyPercent) {
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
                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Justificació de Preu Unitari: {node.code}</span>
                    </div>
                    <button
                        onClick={() => setPicker({
                            titol: 'Afegir al descomposat',
                            subtitol: `${node.code} · ${node.description || ''}`.slice(0, 70),
                            onPick: (c) => { addBreakdownLine(node.id, c); setPicker(null); },
                            onCrearNou: () => { addBreakdownLine(node.id); setPicker(null); },
                        })}
                        className="text-[10px] bg-blue-600 text-white border border-blue-600 px-2 py-0.5 hover:bg-blue-500 flex items-center gap-1 uppercase font-bold"
                    >
                        <Database size={11} /> Del banc
                    </button>
                    <button onClick={() => addBreakdownLine(node.id)} className="text-[10px] bg-white border border-slate-300 px-2 py-0.5 hover:bg-slate-50 flex items-center gap-1 uppercase font-bold">
                        <Plus size={10} /> Afegir Component
                    </button>
                </div>

                {Object.entries(categories).map(([key, cat]) => (
                    cat.items.length > 0 && (
                        <div key={key}>
                            <div className={`${cat.bg} px-4 py-1 text-[10px] uppercase font-bold tracking-widest ${cat.color} border-y border-slate-100`}>
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
                                                    <NumberInput
                                                        className="w-full text-right font-mono bg-transparent outline-none border-b border-transparent focus:border-blue-300"
                                                        value={line.yield}
                                                        onChange={v => updateBreakdownLine(node.id, line.idx, 'yield', v)}
                                                    />
                                                    {line.isPercentage && <span className="absolute top-0 right-[-10px] text-[9px]">%</span>}
                                                </div>
                                            </td>
                                            <td className="p-2 text-right w-28">
                                                {line.isPercentage ? (
                                                    <span className="font-mono text-slate-400 italic text-[10px] cursor-help" title="Base de càlcul (MO + MT)">{formatCurrency(line.finalPrice)}</span>
                                                ) : (
                                                    <NumberInput
                                                        className="w-full text-right font-mono bg-transparent outline-none border-b border-transparent focus:border-blue-300 text-blue-600 font-bold"
                                                        value={line.finalPrice}
                                                        onChange={v => updateBreakdownLine(node.id, line.idx, 'price', v)}
                                                    />
                                                )}
                                            </td>
                                            <td className="p-2 text-right font-mono font-bold w-32">{formatCurrency(line.total)}</td>
                                            <td className="p-2 w-8 text-center opacity-60 md:opacity-0 md:group-hover:opacity-100">
                                                <button onClick={() => removeBreakdownLine(node.id, line.idx)} className="text-red-400 hover:text-red-600"><Trash2 size={12} /></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-white/50">
                                    <tr>
                                        <td colSpan={5} className="p-1 px-4 text-right text-[10px] md:text-[9px] uppercase opacity-50">Subtotal {cat.label}</td>
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
                        <span className="text-[11px] uppercase font-black text-slate-500 tracking-widest">Cost Directe Total</span>
                        <span className="font-mono font-bold text-blue-700">{formatCurrency(totalCost)}</span>
                    </div>
                </div>
            </div>
        );
    };

    // --- Renderitzadors ---
    const renderTableRows = (nodes, level = 0) => {
        return nodes.map((node) => {
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
                        className={`cursor-pointer transition-colors group [&>td]:py-2.5 md:[&>td]:py-0 ${selectedId === node.id ? 'bg-blue-50/50' : 'hover:bg-slate-50'} ${!node.unit
                            ? (level === 0 ? 'bg-emerald-100/60' : (level === 1 ? 'bg-emerald-50/60' : (level === 2 ? 'bg-emerald-50/30' : 'bg-slate-50/30')))
                            : 'bg-white'
                            } ${dropClass}`}
                        onClick={() => {
                            setSelectedId(node.id);
                            // Tocar un capítol el desplega: al mòbil, encertar el chevron de
                            // 24 px era l'única manera de navegar per l'arbre.
                            if (!node.unit) {
                                toggleChapter(node.id);
                                return;
                            }
                            if (window.innerWidth < 768) {
                                setShowMobileSidebar(true);
                            }
                        }}
                    >
                        <td className="p-1 md:p-2 w-8 md:w-10 text-center">
                            <div className="flex items-center justify-center gap-1">
                                <GripVertical size={10} className="hidden md:block text-slate-300 opacity-60 md:opacity-0 md:group-hover:opacity-100 cursor-grab active:cursor-grabbing" />
                                {!node.unit && (
                                    <div className="flex items-center justify-center text-slate-400 hover:text-blue-500 transition-colors">
                                        {expandedChapters[node.id] ? <ChevronDown size={12} className="md:w-3.5 md:h-3.5" /> : <ChevronRight size={12} className="md:w-3.5 md:h-3.5" />}
                                    </div>
                                )}
                                {node.unit && <FileText size={12} className="md:w-3.5 md:h-3.5 text-slate-300" />}
                            </div>
                        </td>
                        <td className="p-1 md:p-2 font-mono text-[10px] md:text-[10px] text-slate-400 w-16 md:w-28" style={{ paddingLeft: `${node.unit ? level * 8 + 4 : level * 8}px` }}>
                            {node.code}
                        </td>
                        <td className="p-1 md:p-2 text-slate-800 min-w-0">
                            <div className="flex flex-col min-w-0">
                                <span className={`text-[11px] md:text-[11px] ${!node.unit ? 'font-bold uppercase tracking-tight text-slate-600' : 'font-medium'} whitespace-normal break-words`}>
                                    {node.description}
                                </span>
                                {/* Mobile: Show unit, qty, price below description with labels */}
                                {appMode === 'budget' ? (
                                    <div className="md:hidden flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[10px] text-slate-500">
                                        {node.unit && (
                                            <>
                                                <div className="flex items-center gap-1">
                                                    <span className="text-[8px] uppercase font-bold text-slate-300">Ud</span>
                                                    <span className="italic">{node.unit}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <span className="text-[8px] uppercase font-bold text-slate-300">Q</span>
                                                    <span className="font-mono">{formatNumber(calcItemTotalQty(node), 2)}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <span className="text-[8px] uppercase font-bold text-slate-300">Pr</span>
                                                    <span className="font-mono">{formatPrice(getItemUnitPrice(node, priceDatabase))}</span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div className="md:hidden flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[10px] text-slate-500">
                                        {node.unit && (() => {
                                            const originQty = calcItemCertifiedQty(node, activeCertId);
                                            const prevCertId = getPreviousCertId(budget.certifications, activeCertId);
                                            const prevQty = prevCertId ? calcItemCertifiedQty(node, prevCertId) : 0;
                                            const actQty = round2(originQty - prevQty);
                                            return (
                                                <>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[8px] uppercase font-bold text-slate-300">Ud</span>
                                                        <span className="italic">{node.unit}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[8px] uppercase font-bold text-slate-300">Prev</span>
                                                        <span className="font-mono">{formatNumber(calcItemTotalQty(node), 2)}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1 text-emerald-600 font-bold">
                                                        <span className="text-[8px] uppercase font-bold text-emerald-300">Orig</span>
                                                        <span className="font-mono">{formatNumber(originQty, 2)}</span>
                                                    </div>
                                                    {actQty !== 0 && (
                                                        <div className={`flex items-center gap-1 ${actQty > 0 ? 'text-blue-600' : 'text-amber-600'}`}>
                                                            <span className="text-[8px] uppercase font-bold opacity-50">Act</span>
                                                            <span className="font-mono">{actQty > 0 ? '+' : ''}{formatNumber(actQty, 2)}</span>
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                )}
                            </div>
                        </td>
                        {/* Desktop: Separate columns */}
                        {appMode === 'budget' ? (
                            <>
                                <td className="hidden md:table-cell p-2 text-center text-slate-400 italic w-14 text-[10px]">{node.unit || ''}</td>
                                <td className="hidden md:table-cell p-2 text-right font-mono w-20 text-[11px] text-slate-500">{node.unit ? formatNumber(calcItemTotalQty(node), 2) : ''}</td>
                                <td className="hidden md:table-cell p-2 text-right font-mono w-28 text-[11px] text-slate-600">
                                    {node.unit ? formatPrice(getItemUnitPrice(node, priceDatabase)) : ''}
                                </td>
                            </>
                        ) : (() => {
                            const prevCertId = getPreviousCertId(budget.certifications, activeCertId);
                            const isChapter = !node.unit;

                            // Les partides es mesuren en quantitat; els capítols, en import
                            // (barrejar unitats no tindria sentit). El percentatge d'avenç,
                            // en canvi, és comparable en tots dos casos.
                            let antPct, actPct, originPct, originQty, actQty, prevQty, totalQty;

                            if (isChapter) {
                                const chBudget = calcChapterTotal(node, priceDatabase);
                                const chOrigin = calcChapterCertifiedTotal(node, activeCertId, priceDatabase);
                                const chPrev = prevCertId
                                    ? calcChapterCertifiedTotal(node, prevCertId, priceDatabase)
                                    : 0;
                                prevQty = chPrev;
                                actQty = round2(chOrigin - chPrev);
                                antPct = safePct(chPrev, chBudget);
                                actPct = safePct(actQty, chBudget);
                                originPct = safePct(chOrigin, chBudget);
                            } else {
                                originQty = calcItemCertifiedQty(node, activeCertId);
                                prevQty = prevCertId ? calcItemCertifiedQty(node, prevCertId) : 0;
                                actQty = round2(originQty - prevQty);
                                totalQty = calcItemTotalQty(node);
                                antPct = safePct(prevQty, totalQty);
                                actPct = safePct(actQty, totalQty);
                                originPct = safePct(originQty, totalQty);
                            }

                            return (
                                <>
                                    <td className="hidden md:table-cell p-2 text-center text-slate-400 italic w-10 text-[10px]">{node.unit || ''}</td>
                                    <td className="hidden md:table-cell p-2 text-right font-mono w-16 text-[10px] text-slate-400">{node.unit ? formatNumber(totalQty, 2) : ''}</td>
                                    <td className="hidden lg:table-cell p-2 text-right font-mono w-12 text-[10px] text-slate-400">
                                        {prevQty !== 0 ? `${formatNumber(antPct, 1)}%` : '-'}
                                    </td>
                                    <td className={`hidden lg:table-cell p-2 text-right font-mono w-12 text-[10px] ${actQty > 0 ? 'text-blue-600 font-bold' : 'text-slate-300'}`}>
                                        {actQty !== 0 ? `${actQty > 0 ? '+' : ''}${formatNumber(actPct, 1)}%` : '-'}
                                    </td>
                                    <td className="p-1 md:p-2 text-right font-mono w-16 md:w-20 text-[11px] text-emerald-600 font-bold bg-emerald-50/50">
                                        {node.unit ? formatNumber(originQty, 2) : ''}
                                    </td>
                                    <td className={`hidden md:table-cell p-2 text-right font-mono w-12 text-[10px] ${isChapter ? 'text-slate-600 font-bold' : 'text-slate-500'}`}>
                                        {`${formatNumber(originPct, 1)}%`}
                                    </td>
                                </>
                            );
                        })()}
                        {/* Total - Always visible */}
                        <td className="p-1 md:p-2 text-right font-mono font-bold text-slate-700 w-20 md:w-32 text-[11px] md:text-[11px]">
                            <div className="flex items-center justify-end gap-2">
                                {appMode === 'budget'
                                    ? (node.unit ? formatCurrency(calcItemTotalAmount(node, priceDatabase)) : formatCurrency(calcChapterTotal(node, priceDatabase)))
                                    : (node.unit ? formatCurrency(calcItemCertifiedAmount(node, activeCertId, priceDatabase)) : formatCurrency(calcChapterCertifiedTotal(node, activeCertId, priceDatabase)))
                                }
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        deleteNode(node.id);
                                    }}
                                    className="opacity-60 md:opacity-0 md:group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all ml-1 p-2 -m-1 touch-manipulation"
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



    /**
     * Residus de construcció i demolició, agregats per codi LER.
     *
     * Les dades vénen dels registres `~R` i `~X` del BC3 (els del Generador de Preus de CYPE
     * en porten) i són l'estimació que demana el RD 105/2008. Si el projecte no en porta cap,
     * val més dir-ho i explicar d'on surten que ensenyar una taula buida.
     */
    const renderWasteTable = () => {
        const { perLer, perTipus, partides, totals, ambDades, ambAportacio, senseAmidament, sense } = wasteSummary;

        // Un zero pot voler dir dues coses molt diferents —el fitxer no porta residus, o els
        // porta però l'amidament és zero— i des de fora no es distingeixen. Per això cada cas
        // té el seu missatge en comptes d'una taula buida.
        const buit = (titol, cos, peu) => (
            <div className="p-6 md:p-12">
                <div className="bg-white border border-slate-200 p-8 md:p-12 text-center max-w-2xl mx-auto">
                    <Recycle size={44} className="mx-auto text-slate-200 mb-4" />
                    <p className="text-sm font-bold text-slate-600 uppercase tracking-widest mb-3">{titol}</p>
                    <div className="text-[11px] text-slate-500 leading-relaxed space-y-2">{cos}</div>
                    {peu && <p className="text-[10px] text-slate-400 mt-4 italic">{peu}</p>}
                </div>
            </div>
        );

        if (ambDades === 0) {
            return buit(
                'Cap partida no porta dades de residus',
                <>
                    <p>
                        L&apos;estimació surt dels registres <span className="font-mono">~R</span> i{' '}
                        <span className="font-mono">~X</span> del fitxer BC3, que declaren quins components
                        generen residu, amb quin codi LER i amb quina massa i volum. Les partides creades a
                        mà no en tenen.
                    </p>
                    <p className="bg-amber-50 border border-amber-200 text-amber-800 p-2.5 text-left">
                        Del Generador de Preus de CYPE, només els porta l&apos;enllaç <b>BC3 estàndard</b>.
                        El <b>BC3 d&apos;Arquímedes</b> no du ni residus ni amidament: és una entrada de banc
                        de preus.
                    </p>
                </>,
                sense > 0 ? `${sense} ${sense === 1 ? 'partida al projecte' : 'partides al projecte'}, cap amb dades.` : null
            );
        }

        if (ambAportacio === 0) {
            return buit(
                'Les partides amb dades tenen l\'amidament a zero',
                <>
                    <p>
                        {ambDades === 1 ? 'Hi ha una partida' : `Hi ha ${ambDades} partides`} amb dades de
                        residus al fitxer, però {ambDades === 1 ? 'el seu amidament és' : 'els seus amidaments són'} zero,
                        de manera que no {ambDades === 1 ? 'aporta' : 'aporten'} massa ni volum. Les dades del
                        fitxer són correctes: el que falta és entrar l&apos;amidament.
                    </p>
                    <ul className="text-left bg-slate-50 border border-slate-200 p-2.5 font-mono text-[10px] space-y-1">
                        {senseAmidament.slice(0, 8).map(x => (
                            <li key={x.id} className="truncate">{x.code} · {x.description}</li>
                        ))}
                        {senseAmidament.length > 8 && <li className="italic">i {senseAmidament.length - 8} més…</li>}
                    </ul>
                </>
            );
        }

        const maxima = perLer[0]?.mass || 1;

        return (
            <div className="p-0 md:p-6 space-y-0 md:space-y-6">
                {/* Totals */}
                <div className="bg-slate-900 text-white p-4 md:p-5">
                    <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                        <div>
                            <div className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">Massa total</div>
                            <div className="text-2xl md:text-3xl font-black font-mono text-emerald-400">{formatMassa(totals.mass)}</div>
                        </div>
                        <div>
                            <div className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">Volum total</div>
                            <div className="text-2xl md:text-3xl font-black font-mono text-blue-400">
                                {formatNumber(totals.volume, 2)} <span className="text-base">m³</span>
                            </div>
                        </div>
                        <div className="ml-auto flex items-end gap-4">
                            <div className="text-right">
                                <div className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">Amb dades</div>
                                <div className="text-[11px] font-mono text-slate-300">
                                    {ambDades} de {ambDades + sense} partides
                                </div>
                            </div>
                            <button
                                onClick={() => setShowWasteStudy(true)}
                                className="bg-emerald-600 hover:bg-emerald-500 px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 touch-manipulation"
                                title="Estudi de gestió de residus (RD 105/2008)"
                            >
                                <FileDown size={13} /> <span className="hidden sm:inline">Estudi</span> PDF
                            </button>
                        </div>
                    </div>
                    {perTipus.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-white/10">
                            {perTipus.map(t => (
                                <span key={t.type} className="text-[10px] bg-white/10 px-2 py-1 rounded" title={TIPUS_RESIDU[String(t.type)]?.descripcio || ''}>
                                    {t.nom} <span className="font-mono text-emerald-300 ml-1">{formatMassa(t.mass)}</span>
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Per codi LER */}
                <div className="bg-white border border-slate-200">
                    <div className="bg-slate-800 p-3 text-white flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Recycle size={16} className="text-emerald-400" />
                            <span className="text-xs font-bold uppercase tracking-widest">Per codi LER</span>
                        </div>
                        <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-slate-300">{perLer.length} codis</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-50 border-b border-slate-200 text-[8px] md:text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                <tr>
                                    <th className="p-2 md:p-3 w-20 md:w-24 border-r border-slate-200">LER</th>
                                    <th className="p-2 md:p-3">Residu</th>
                                    <th className="hidden md:table-cell p-3 w-28">Origen</th>
                                    <th className="p-2 md:p-3 w-24 md:w-32 text-right">Massa</th>
                                    <th className="p-2 md:p-3 w-20 md:w-28 text-right bg-blue-50/50">Volum m³</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {perLer.map(f => (
                                    <tr key={f.ler || f.codis[0]} className="hover:bg-slate-50/70">
                                        <td className="p-2 md:p-3 border-r border-slate-100 font-mono text-[10px] md:text-[11px] text-slate-500 whitespace-nowrap">
                                            {f.ler || <span className="italic text-slate-300">sense</span>}
                                        </td>
                                        <td className="p-2 md:p-3">
                                            <div className="text-[11px] text-slate-700 leading-tight">{f.description}</div>
                                            {/* La barra dona la proporció d'un cop d'ull, que és el que es mira primer. */}
                                            <div className="h-1 bg-slate-100 mt-1.5 max-w-[220px]">
                                                <div className="h-full bg-emerald-500" style={{ width: `${Math.max(2, (f.mass / maxima) * 100)}%` }} />
                                            </div>
                                            <div className="md:hidden text-[9px] text-slate-400 uppercase mt-1">{nomTipus(f.type)}</div>
                                        </td>
                                        <td className="hidden md:table-cell p-3 text-[10px] text-slate-400 uppercase">{nomTipus(f.type)}</td>
                                        <td className="p-2 md:p-3 text-right font-mono text-[11px] text-slate-700 whitespace-nowrap">{formatMassa(f.mass)}</td>
                                        <td className="p-2 md:p-3 text-right font-mono text-[11px] text-slate-600 bg-blue-50/30 whitespace-nowrap">{formatNumber(f.volume, 2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold">
                                <tr>
                                    <td className="p-2 md:p-3 text-[10px] uppercase tracking-widest text-slate-600" colSpan={2}>Total</td>
                                    <td className="hidden md:table-cell" />
                                    <td className="p-2 md:p-3 text-right font-mono text-[11px]">{formatMassa(totals.mass)}</td>
                                    <td className="p-2 md:p-3 text-right font-mono text-[11px]">{formatNumber(totals.volume, 2)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                {/* Per partida */}
                <div className="bg-white border border-slate-200">
                    <div className="bg-slate-800 p-3 text-white flex items-center gap-2">
                        <Layers size={16} className="text-blue-400" />
                        <span className="text-xs font-bold uppercase tracking-widest">Per partida</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-50 border-b border-slate-200 text-[8px] md:text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                <tr>
                                    <th className="p-2 md:p-3 w-20 md:w-32 border-r border-slate-200">Codi</th>
                                    <th className="p-2 md:p-3">Partida</th>
                                    <th className="hidden md:table-cell p-3 w-28 text-right">Amidament</th>
                                    <th className="p-2 md:p-3 w-24 md:w-32 text-right">Massa</th>
                                    <th className="p-2 md:p-3 w-20 md:w-28 text-right bg-blue-50/50">Volum m³</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {partides.map(x => (
                                    <tr key={x.id} className="hover:bg-slate-50/70">
                                        <td className="p-2 md:p-3 border-r border-slate-100 font-mono text-[10px] text-slate-500 truncate">{x.code}</td>
                                        <td className="p-2 md:p-3">
                                            <div className="text-[11px] text-slate-700 leading-tight line-clamp-2">{x.description}</div>
                                            {x.capitol && <div className="text-[9px] text-slate-400 uppercase truncate">{x.capitol}</div>}
                                            <div className="md:hidden text-[9px] text-slate-400 font-mono mt-0.5">{formatNumber(x.quantity, 2)} {x.unit}</div>
                                        </td>
                                        <td className="hidden md:table-cell p-3 text-right font-mono text-[11px] text-slate-600">
                                            {formatNumber(x.quantity, 2)} <span className="text-slate-400">{x.unit}</span>
                                        </td>
                                        <td className="p-2 md:p-3 text-right font-mono text-[11px] text-slate-700 whitespace-nowrap">{formatMassa(x.mass)}</td>
                                        <td className="p-2 md:p-3 text-right font-mono text-[11px] text-slate-600 bg-blue-50/30 whitespace-nowrap">{formatNumber(x.volume, 2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {(sense > 0 || senseAmidament.length > 0) && (
                    <div className="text-[10px] text-slate-400 italic px-4 py-3 md:px-0 md:py-0 leading-relaxed space-y-1">
                        {sense > 0 && (
                            <p>
                                Hi ha {sense} {sense === 1 ? 'partida' : 'partides'} sense dades de residus al fitxer
                                d&apos;origen: no compten a l&apos;estimació. Les partides creades a mà i els BC3 que no
                                porten els registres <span className="font-mono">~R</span> i{' '}
                                <span className="font-mono">~X</span> no en tenen.
                            </p>
                        )}
                        {senseAmidament.length > 0 && (
                            <p>
                                {senseAmidament.length === 1 ? 'Una partida porta' : `${senseAmidament.length} partides porten`} dades
                                de residus però {senseAmidament.length === 1 ? 'té' : 'tenen'} l&apos;amidament a zero
                                ({senseAmidament.slice(0, 3).map(x => x.code).join(', ')}
                                {senseAmidament.length > 3 ? '…' : ''}): no {senseAmidament.length === 1 ? 'aporta' : 'aporten'} res
                                fins que no s&apos;hi entri.
                            </p>
                        )}
                    </div>
                )}
            </div>
        );
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
            <div className="p-0 md:p-6">
                <div className="bg-white border border-slate-200">
                    <div className="bg-slate-800 p-3 text-white flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Layers size={16} className="text-blue-400" />
                            <span className="text-xs font-bold uppercase tracking-widest">Llistat de Recursos</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Mobile: Total chip */}
                            <span className="md:hidden text-[10px] font-black bg-blue-500 text-white px-1.5 py-0.5 rounded">
                                {formatCurrency(totalAmount)}
                            </span>
                            <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-slate-300">
                                {totalCount} Recursos
                            </span>
                        </div>
                    </div>

                    <div className="overflow-visible">
                        <table className="w-full text-left border-collapse table-fixed md:table-auto">
                            <thead className="bg-slate-50 border-b border-slate-200 text-[8px] md:text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                <tr>
                                    <th className="p-2 md:p-3 w-16 md:w-32 border-r border-slate-200">Codi</th>
                                    <th className="p-2 md:p-3">Concepte</th>
                                    <th className="hidden md:table-cell p-3 w-16 text-center border-x border-slate-200">Ud.</th>
                                    <th className="hidden md:table-cell p-3 w-28 text-right">Quant. Total</th>
                                    <th className="hidden md:table-cell p-3 w-28 text-right">Preu</th>
                                    <th className="p-2 md:p-3 w-20 md:w-32 text-right bg-blue-50/50">Total</th>
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
                                                <td colSpan={window.innerWidth < 768 ? 3 : 6} className="p-2 pl-4 md:pl-4">
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
                                                    <td className="p-2 md:p-3 font-mono text-[9px] md:text-[11px] text-slate-400 border-r border-slate-200 pl-4 md:pl-8">{res.code}</td>
                                                    <td className="p-2 md:p-3 text-slate-700 min-w-0">
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="text-[9px] md:text-[11px] font-medium whitespace-normal break-words">{res.description}</span>
                                                            {/* Mobile stacked details */}
                                                            <div className="md:hidden flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[8px] text-slate-400">
                                                                <div className="flex items-center gap-1">
                                                                    <span className="text-[7px] uppercase font-bold text-slate-300">Ud</span>
                                                                    <span className="italic">{res.unit || '—'}</span>
                                                                </div>
                                                                <div className="flex items-center gap-1">
                                                                    <span className="text-[7px] uppercase font-bold text-slate-300">Q</span>
                                                                    <span className="font-mono">{formatNumber(res.quantity, 2)}</span>
                                                                </div>
                                                                <div className="flex items-center gap-1">
                                                                    <span className="text-[7px] uppercase font-bold text-slate-300">Pr</span>
                                                                    <span className="font-mono">{formatPrice(res.price)}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="hidden md:table-cell p-3 text-center text-slate-400 italic border-x border-slate-200">{res.unit || '—'}</td>
                                                    <td className="hidden md:table-cell p-3 text-right font-mono text-slate-600">{formatNumber(res.quantity, 2)}</td>
                                                    <td className="hidden md:table-cell p-3 text-right font-mono text-slate-600">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <NumberInput
                                                                className="bg-transparent text-right border-b border-transparent hover:border-blue-300 focus:border-blue-600 outline-none w-20 font-bold text-slate-600 focus:text-blue-600 px-1"
                                                                value={res.price}
                                                                onChange={(v) => updateGlobalPrice(res.code, v)}
                                                                onClick={(e) => e.stopPropagation()}
                                                            />
                                                            <span className="text-[10px] text-slate-400">€</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-2 md:p-3 text-right font-mono font-bold text-blue-800 bg-blue-50/10 group-hover:bg-blue-50/20 text-[9px] md:text-sm">
                                                        {formatCurrency(res.quantity * res.price)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                            <tfoot className="hidden md:table-footer-group bg-slate-900 text-white font-bold sticky bottom-0 z-10">
                                <tr>
                                    <td colSpan={window.innerWidth < 768 ? 2 : 5} className="p-3 text-right text-[10px] uppercase tracking-widest whitespace-nowrap">Total Recursos</td>
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
            <div className="p-0 md:p-6">
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
                    <table className="w-full text-left border-collapse table-fixed md:table-auto">
                        <thead className="bg-slate-50 border-b border-slate-200 text-[8px] md:text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                            <tr>
                                <th className="p-2 md:p-3 w-16 md:w-32 border-r border-slate-200">Codi</th>
                                <th className="p-2 md:p-3">Concepte</th>
                                <th className="hidden md:table-cell p-3 w-20 text-center border-x border-slate-200">Ud.</th>
                                <th className="p-2 md:p-3 w-20 md:w-48 text-right bg-blue-50/50">Preu</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm divide-y divide-slate-100">
                            {prices.map(([code, data]) => (
                                <tr key={code} className="hover:bg-slate-50 group">
                                    <td className="p-2 md:p-3 font-mono text-[10px] md:text-[11px] text-slate-400 border-r border-slate-200">{code}</td>
                                    <td className="p-2 md:p-3 text-slate-700 min-w-0">
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[11px] md:text-[11px] font-medium whitespace-normal break-words">{data.summary}</span>
                                            {/* Mobile stacked details */}
                                            <div className="md:hidden flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                                                <div className="flex items-center gap-1">
                                                    <span className="text-[8px] uppercase font-bold text-slate-300">Ud</span>
                                                    <span className="italic">{data.unit || '—'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="hidden md:table-cell p-3 text-center text-slate-400 italic border-x border-slate-200">{data.unit || '—'}</td>
                                    <td className="p-2 md:p-3 text-right font-mono font-bold text-blue-800 bg-blue-50/10 group-hover:bg-blue-50/30">
                                        <div className="flex items-center justify-end gap-1 md:gap-2">
                                            <span className="text-[11px] md:text-xs text-slate-300">€</span>
                                            <NumberInput
                                                className="bg-transparent text-right border-b border-transparent hover:border-blue-300 focus:border-blue-600 outline-none w-14 md:w-24 font-bold text-blue-700 text-[11px] md:text-sm"
                                                value={data.price}
                                                onChange={(v) => updateDbPrice(code, v)}
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
            {/* 1. DRIVE SETTINGS MODAL */}
            {picker && (
                <PriceBankPicker
                    priceDatabase={priceDatabase}
                    titol={picker.titol}
                    subtitol={picker.subtitol}
                    filtre={picker.filtre}
                    onPick={picker.onPick}
                    onCrearNou={picker.onCrearNou}
                    onClose={() => setPicker(null)}
                />
            )}

            {showWasteStudy && (
                <WasteStudyModal
                    summary={wasteSummary}
                    onGenerate={handleWasteStudy}
                    onClose={() => setShowWasteStudy(false)}
                />
            )}

            {showDriveSettings && (
                <DriveSettingsModal
                    config={driveConfig}
                    onSave={(newConfig) => {
                        setCredentials(newConfig);
                        setShowDriveSettings(false);
                        // Trigger sign in directly after saving if needed
                    }}
                    onClose={() => setShowDriveSettings(false)}
                />
            )}

            {/* 2. ITEM CREATOR MODAL */}
            {showCreator && (
                <ItemCreator
                    onClose={() => setShowCreator(false)}
                    onSave={handleSaveNewItem}
                    onTriarDelBanc={(omple) => setPicker({
                        titol: 'Crear una partida des del banc',
                        subtitol: 'Se n\'omplen codi, descripció, unitat i preu',
                        onPick: (c) => { omple(c); setPicker(null); },
                    })}
                    parentId={selectedId}
                    parentCode={selectedId ? (
                        // Find code by ID - basic search for standard hierarchy
                        [...budget.chapters, ...budget.chapters.flatMap(c => [...(c.subChapters || []), ...(c.items || [])])].find(n => n.id === selectedId)?.code
                    ) : null}
                />
            )}

            {isDragging && (
                <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-blue-600/10 backdrop-blur-sm pointer-events-none border-4 border-dashed border-blue-400 m-4">
                    <div className="bg-white p-12 border border-blue-200 flex flex-col items-center animate-in zoom-in duration-200">
                        <Upload size={48} className="text-blue-600 mb-4" />
                        <h2 className="text-2xl font-bold text-slate-800 tracking-tight uppercase">
                            {activeTab === 'prices' ? 'Ampliar el banc de preus' : 'Importació BC3'}
                        </h2>
                        <p className="text-slate-500 mt-2 text-center max-w-sm text-sm italic">
                            {activeTab === 'prices'
                                ? 'Els conceptes del fitxer s\'afegiran al banc. El pressupost no es tocarà.'
                                : 'Deixa anar per analitzar la jerarquia i descripcions.'}
                        </p>
                    </div>
                </div>
            )}

            {/* Header Flat */}
            <header className="bg-slate-950 text-white px-2 py-2.5 md:p-4 flex justify-between items-center gap-1 border-b border-slate-800 z-30">
                {/* Left: Logo + Title + Drive Status */}
                <div className="flex items-center gap-2 md:gap-4">
                    <div className="bg-blue-600 p-1.5 md:p-2">
                        <Calculator size={20} className="md:w-6 md:h-6 text-white" />
                    </div>
                    <div className="flex flex-col">
                        <h1 className="hidden sm:block font-bold text-xl tracking-tighter leading-none uppercase">PreuArq <span className="text-blue-400 font-light">BIM</span></h1>
                        {/* Drive Status Indicator */}
                        <div className="hidden sm:flex items-center gap-2 mt-1">
                            {drive.isSignedIn ? (
                                <div className="flex items-center gap-2 text-[10px]">
                                    <span className="text-blue-400 font-medium flex items-center gap-1" title={drive.userName}>
                                        <Cloud size={12} /> {drive.userName.split(' ')[0]}
                                    </span>
                                    {drive.currentFileName && (
                                        <span className="text-slate-400 max-w-[120px] truncate" title={drive.currentFileName}>
                                            | {drive.currentFileName}
                                        </span>
                                    )}
                                    <button onClick={drive.signOut} className="text-slate-500 hover:text-red-400 transition-colors ml-1" title="Desconnectar de Drive">
                                        <LogOut size={10} />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => requireDrive(drive.signIn)}
                                    className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-blue-400 transition-colors"
                                >
                                    <Cloud size={12} /> Connecta Drive
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Center: Mode Switch */}
                <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-lg">
                    <button
                        onClick={() => setAppMode('budget')}
                        className={`flex items-center gap-2 px-3 md:px-4 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${appMode === 'budget' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-slate-400 hover:text-white'}`}
                    >
                        <FileText size={14} /> <span className="hidden xs:inline">Pressupost</span>
                    </button>
                    <button
                        onClick={() => setAppMode('certification')}
                        className={`flex items-center gap-2 px-3 md:px-4 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${appMode === 'certification' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40' : 'text-slate-400 hover:text-white'}`}
                    >
                        <Layers size={14} /> <span className="hidden xs:inline">Certificació</span>
                    </button>
                </div>

                {/* Center/Right: Actions */}
                <div className="flex items-center gap-2 md:gap-6">
                    {/* Desfer / refer: també al mòbil, on no hi ha teclat per a Ctrl+Z */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={historial.undo}
                            disabled={!historial.canUndo}
                            title="Desfer (Ctrl+Z)"
                            className="p-3 md:p-2 rounded-md text-slate-400 enabled:hover:text-white enabled:hover:bg-slate-800 disabled:opacity-25 transition-colors touch-manipulation"
                        >
                            <Undo2 size={18} />
                        </button>
                        <button
                            onClick={historial.redo}
                            disabled={!historial.canRedo}
                            title="Refer (Ctrl+Maj+Z)"
                            className="p-3 md:p-2 rounded-md text-slate-400 enabled:hover:text-white enabled:hover:bg-slate-800 disabled:opacity-25 transition-colors touch-manipulation"
                        >
                            <Redo2 size={18} />
                        </button>
                    </div>

                    {/* Total PEM Display - Always visible */}
                    <button
                        onClick={() => appMode === 'budget' ? setShowPemModal(true) : setShowCertSummary(true)}
                        className="flex flex-col items-end gap-0.5 group cursor-pointer"
                        title={appMode === 'budget' ? "Ajustar PEM" : "Veure el resum de la certificació"}
                    >
                        <span className="text-[8px] md:text-[9px] uppercase text-slate-500 font-bold tracking-widest leading-none group-hover:text-blue-400 transition-colors">
                            {appMode === 'budget' ? 'Total PEM' : 'Total Certificat'}
                        </span>
                        <div className="flex items-baseline gap-2">
                            <span className={`text-sm md:text-xl font-mono font-bold tracking-tighter leading-none ${appMode === 'budget' ? 'text-emerald-400' : 'text-blue-400'}`}>
                                {formatCurrency(appMode === 'budget' ? budgetTotal : certifiedTotal)}
                            </span>
                            {appMode === 'certification' && activeCertId && (
                                <span className="text-[10px] md:text-xs font-mono font-bold text-emerald-400 leading-none">
                                    {formatNumber(certificationSummary.totals.originPct, 1)}%
                                </span>
                            )}
                        </div>
                    </button>

                    {/* Desktop: All buttons visible */}
                    <div className="hidden md:flex items-center gap-2 flex-wrap">
                        {/* Nou */}
                        <button onClick={handleNewProject} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 border border-slate-700 transition-colors" title="Nou Projecte">
                            <FilePlus size={16} className="text-slate-400" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Nou</span>
                        </button>

                        {/* Obrir (Dropdown) */}
                        <div className="relative">
                            <button
                                onClick={() => setShowOpenDropdown(!showOpenDropdown)}
                                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 border border-slate-700 transition-colors"
                                title="Obrir"
                            >
                                <FolderOpen size={16} className="text-slate-400" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">Obrir</span>
                                <ChevronDown size={12} className="text-slate-500" />
                            </button>
                            {showOpenDropdown && (
                                <div className="absolute top-full left-0 mt-1 bg-slate-900 border border-slate-700 shadow-2xl z-50 min-w-[180px]">
                                    <button
                                        onClick={() => { handleOpenProject(); setShowOpenDropdown(false); }}
                                        className="w-full text-left px-4 py-2 text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-colors flex items-center gap-2"
                                    >
                                        <FileText size={12} className="text-slate-400" />
                                        Des del disc local
                                    </button>
                                    <button
                                        onClick={() => { requireDrive(drive.openFromDrive); setShowOpenDropdown(false); }}
                                        className="w-full text-left px-4 py-2 text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-colors flex items-center gap-2 border-t border-slate-800"
                                    >
                                        <Cloud size={12} className="text-blue-400" />
                                        Des de Google Drive
                                    </button>
                                    <button
                                        onClick={() => { setShowLibrary(true); setShowOpenDropdown(false); }}
                                        className="w-full text-left px-4 py-2 text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-colors flex items-center gap-2 border-t border-slate-800"
                                    >
                                        <FolderOpen size={12} className="text-emerald-400" />
                                        Projectes recents
                                        <span className="ml-auto text-slate-500 font-mono">{library.length}</span>
                                    </button>
                                </div>
                            )}
                        </div>

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
                                <div className="absolute top-full right-0 mt-1 bg-slate-900 border border-slate-700 shadow-2xl z-50 min-w-[220px]">
                                    <div className="px-3 py-1 text-[8px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">Projecte ({EXTENSIO_PROJECTE})</div>
                                    <button
                                        onClick={() => { handleDownloadProject(); setShowSaveDropdown(false); }}
                                        className="w-full text-left px-4 py-2 text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-colors flex items-center gap-2"
                                    >
                                        <FileDown size={12} className="text-emerald-400" />
                                        Desar projecte (Disc)
                                    </button>
                                    <button
                                        onClick={() => { requireDrive(() => drive.saveToDrive(budget, priceDatabase)); setShowSaveDropdown(false); }}
                                        className="w-full text-left px-4 py-2 text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-colors flex items-center gap-2"
                                    >
                                        <Cloud size={12} className="text-blue-400" />
                                        Desar a Drive
                                    </button>
                                    {drive.currentFileType === 'json' && (
                                        <button
                                            onClick={() => { requireDrive(() => drive.saveAsToDrive(budget, priceDatabase)); setShowSaveDropdown(false); }}
                                            className="w-full text-left px-4 py-2 text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-colors flex items-center gap-2 italic"
                                        >
                                            <Cloud size={12} className="text-slate-400" />
                                            Desar còpia a Drive...
                                        </button>
                                    )}

                                    <div className="px-3 py-1 border-b border-t border-slate-800 mt-1">
                                        <div className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">FIEBDC-3 (BC3)</div>
                                        <div className="text-[9px] text-emerald-400/80 truncate normal-case">{etiquetaBC3}</div>
                                    </div>
                                    <button
                                        onClick={() => { handleExportBC3(); setShowSaveDropdown(false); }}
                                        className="w-full text-left px-4 py-2 text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-colors flex items-center gap-2"
                                    >
                                        <Download size={12} className="text-amber-400" />
                                        Exportar BC3 (Disc)
                                    </button>
                                    <button
                                        onClick={() => { handleExportBC3ToDrive(); setShowSaveDropdown(false); }}
                                        className="w-full text-left px-4 py-2 text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-colors flex items-center gap-2"
                                    >
                                        <Cloud size={12} className="text-amber-400" />
                                        Exportar BC3 a Drive
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

                        {/* Imprimir: segueix el mode actiu, com la resta de la interfície.
                            Abans sempre obria el pressupost, també quan s'estava certificant. */}
                        <button
                            onClick={obreImpressio}
                            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 border border-slate-700 transition-colors"
                            title={appMode === 'certification'
                                ? (activeCertId ? `Imprimir ${activeCert?.name || 'la certificació'}` : 'Cap certificació activa')
                                : 'Imprimir el pressupost i els amidaments'}
                        >
                            <Printer size={16} className="text-slate-300" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Imprimir</span>
                        </button>
                    </div>

                    {/* Mobile: Hamburger Menu */}
                    <div className="md:hidden relative">
                        <button
                            onClick={() => setShowMobileMenu(!showMobileMenu)}
                            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 p-2 border border-slate-700 transition-colors"
                            title="Menú"
                        >
                            <Menu size={20} className="text-slate-400" />
                        </button>

                        {showMobileMenu && (
                            <>
                                {/* Backdrop */}
                                <div
                                    className="fixed inset-0 bg-black/50 z-40"
                                    onClick={() => setShowMobileMenu(false)}
                                />

                                {/* Menu Dropdown */}
                                <div className="fixed top-14 right-2 bg-slate-900 border border-slate-700 shadow-2xl z-50 min-w-[200px] max-w-[90vw]">
                                    <button
                                        onClick={() => { handleNewProject(); setShowMobileMenu(false); }}
                                        className="w-full text-left px-4 py-3 text-sm hover:bg-slate-800 transition-colors flex items-center gap-3 border-b border-slate-800"
                                    >
                                        <FilePlus size={18} className="text-slate-400" />
                                        <span className="font-medium">Nou Projecte</span>
                                    </button>

                                    <div className="px-4 py-2 text-xs font-bold text-slate-500 border-b border-slate-800 bg-slate-800/50">OBRIR</div>
                                    <button
                                        onClick={() => { handleOpenProject(); setShowMobileMenu(false); }}
                                        className="w-full text-left px-4 py-3 text-sm hover:bg-slate-800 transition-colors flex items-center gap-3 border-b border-slate-800"
                                    >
                                        <FolderOpen size={18} className="text-slate-400" />
                                        <span className="font-medium">Disc Local</span>
                                    </button>
                                    <button
                                        onClick={() => { requireDrive(drive.openFromDrive); setShowMobileMenu(false); }}
                                        className="w-full text-left px-4 py-3 text-sm hover:bg-slate-800 transition-colors flex items-center gap-3 border-b border-slate-800"
                                    >
                                        <Cloud size={18} className="text-blue-400" />
                                        <span className="font-medium">Google Drive</span>
                                    </button>
                                    <button
                                        onClick={() => { setShowLibrary(true); setShowMobileMenu(false); }}
                                        className="w-full text-left px-4 py-3 text-sm hover:bg-slate-800 transition-colors flex items-center gap-3 border-b border-slate-800"
                                    >
                                        <FolderOpen size={18} className="text-emerald-400" />
                                        <span className="font-medium">Projectes recents</span>
                                        <span className="ml-auto text-xs text-slate-500 font-mono">{library.length}</span>
                                    </button>

                                    <div className="px-4 py-2 text-xs font-bold text-slate-500 border-b border-slate-800 bg-slate-800/50 mt-1">DESAR PROJECTE ({EXTENSIO_PROJECTE})</div>
                                    <button
                                        onClick={() => { handleDownloadProject(); setShowMobileMenu(false); }}
                                        className="w-full text-left px-4 py-3 text-sm hover:bg-slate-800 transition-colors flex items-center gap-3 border-b border-slate-800"
                                    >
                                        <FileDown size={18} className="text-emerald-400" />
                                        <span className="font-medium">A Disc Local</span>
                                    </button>
                                    <button
                                        onClick={() => { requireDrive(() => drive.saveToDrive(budget, priceDatabase)); setShowMobileMenu(false); }}
                                        className="w-full text-left px-4 py-3 text-sm hover:bg-slate-800 transition-colors flex items-center gap-3 border-b border-slate-800"
                                    >
                                        <Cloud size={18} className="text-blue-400" />
                                        <span className="font-medium">A Google Drive</span>
                                    </button>

                                    <div className="px-4 py-2 border-b border-slate-800 bg-slate-800/50 mt-1">
                                        <div className="text-xs font-bold text-slate-500">EXPORTAR BC3</div>
                                        <div className="text-[11px] text-emerald-400/80 truncate">{etiquetaBC3}</div>
                                    </div>
                                    <button
                                        onClick={() => { handleExportBC3(); setShowMobileMenu(false); }}
                                        className="w-full text-left px-4 py-3 text-sm hover:bg-slate-800 transition-colors flex items-center gap-3 border-b border-slate-800"
                                    >
                                        <Download size={18} className="text-amber-400" />
                                        <span className="font-medium">A Disc Local</span>
                                    </button>
                                    <button
                                        onClick={() => { handleExportBC3ToDrive(); setShowMobileMenu(false); }}
                                        className="w-full text-left px-4 py-3 text-sm hover:bg-slate-800 transition-colors flex items-center gap-3 border-b border-slate-800"
                                    >
                                        <Cloud size={18} className="text-amber-400" />
                                        <span className="font-medium">A Google Drive</span>
                                    </button>

                                    <div className="px-4 py-2 text-xs font-bold text-slate-500 border-b border-slate-800 bg-slate-800/50 mt-1">ALTRES</div>
                                    <button
                                        onClick={() => { document.getElementById('bc3-import-input')?.click(); setShowMobileMenu(false); }}
                                        className="w-full text-left px-4 py-3 text-sm hover:bg-slate-800 transition-colors flex items-center gap-3 border-b border-slate-800"
                                    >
                                        <Upload size={18} className="text-slate-400" />
                                        <span className="font-medium">Importar BC3</span>
                                    </button>

                                    <button
                                        onClick={() => { obreImpressio(); setShowMobileMenu(false); }}
                                        className="w-full text-left px-4 py-3 text-sm hover:bg-slate-800 transition-colors flex items-center gap-3"
                                    >
                                        <Printer size={18} className="text-slate-300" />
                                        <span className="font-medium">Imprimir</span>
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </header>

            {/* Certification Management Bar */}
            {appMode === 'certification' && (
                <CertificationBar
                    certifications={budget.certifications}
                    activeCertId={activeCertId}
                    setActiveCertId={setActiveCertId}
                    showNewCertInput={showNewCertInput}
                    setShowNewCertInput={setShowNewCertInput}
                    newCertName={newCertName}
                    setNewCertName={setNewCertName}
                    onCreateCertification={createCertification}
                    onApproveCertification={certActions.approveCertification}
                    onReopenCertification={certActions.reopenCertification}
                    onRenameCertification={certActions.renameCertification}
                    onUpdateCertificationDate={certActions.updateCertificationDate}
                    onDeleteCertification={handleDeleteCertification}
                    onToggleMethod={certActions.toggleCertificationMethod}
                />
            )}

            {/* Resum en viu de la certificació activa */}
            {appMode === 'certification' && activeCertId && (
                <CertificationSummary
                    totals={certificationSummary.totals}
                    certName={activeCert?.name}
                    onOpenDetail={() => setShowCertSummary(true)}
                />
            )}

            {/* Hidden file input for opening projects (JSON + BC3) */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".amid,.json,.bc3"
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
                                // Explicitly merge (not replace) for the "Import" button
                                startImportProcess(result, { replace: false });
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
                    <div className="border-b border-slate-200 p-2 bg-slate-50">
                        {/* Top row: Tabs + Search icon */}
                        <div className="flex justify-between items-center gap-2">
                            {/* Tabs - Wider on mobile */}
                            <div className="flex bg-white border border-slate-200 p-0.5 md:p-1 flex-1 md:flex-initial">
                                <button
                                    onClick={() => setActiveTab('editor')}
                                    className={`flex-1 md:flex-initial px-3 md:px-4 py-3.5 md:py-1.5 text-[10px] md:text-[10px] font-bold uppercase tracking-wider md:tracking-widest transition-colors ${activeTab === 'editor' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-100'}`}
                                >
                                    <span className="hidden md:inline">Editor de Partides</span>
                                    <span className="md:hidden">Editor</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab('prices')}
                                    className={`flex-1 md:flex-initial px-3 md:px-4 py-3.5 md:py-1.5 text-[10px] md:text-[10px] font-bold uppercase tracking-wider md:tracking-widest transition-colors ${activeTab === 'prices' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-100'}`}
                                >
                                    <span className="hidden md:inline">Base de Preus</span>
                                    <span className="md:hidden">Preus</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab('recursos')}
                                    className={`flex-1 md:flex-initial px-3 md:px-4 py-3.5 md:py-1.5 text-[10px] md:text-[10px] font-bold uppercase tracking-wider md:tracking-widest transition-colors ${activeTab === 'recursos' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-100'}`}
                                >
                                    <span className="hidden md:inline">Llistat de Recursos</span>
                                    <span className="md:hidden">Recursos</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab('residus')}
                                    className={`flex-1 md:flex-initial px-3 md:px-4 py-3.5 md:py-1.5 text-[10px] md:text-[10px] font-bold uppercase tracking-wider md:tracking-widest transition-colors ${activeTab === 'residus' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-100'}`}
                                >
                                    Residus
                                </button>
                            </div>

                            {/* Search */}
                            <div className="flex items-center gap-2">
                                {/* Mobile: Search icon only, expands downward */}
                                <div className="md:hidden relative">
                                    <button
                                        onClick={() => setShowSearchExpanded(!showSearchExpanded)}
                                        className="p-1.5 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
                                    >
                                        <Search size={14} className="text-slate-400" />
                                    </button>
                                </div>

                                {/* Desktop: Always visible search */}
                                <div className="hidden md:block relative">
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

                        {/* Mobile: Expanded search field below tabs */}
                        {showSearchExpanded && (
                            <div className="md:hidden mt-2 relative animate-in slide-in-from-top-2 duration-200">
                                <Search className="absolute left-2 top-2 text-slate-300" size={12} />
                                <input
                                    type="text"
                                    placeholder="Cerca codi..."
                                    className="pl-7 pr-7 py-1.5 bg-white border border-slate-200 text-xs focus:border-blue-500 outline-none w-full transition-all"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    autoFocus
                                />
                                <button
                                    onClick={() => { setSearchTerm(''); setShowSearchExpanded(false); }}
                                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Project Controls - Only in Editor View */}
                    {activeTab === 'editor' && (
                        <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-3 md:px-6 py-2 md:py-4 flex flex-row justify-between items-center gap-2">
                            <div className="flex flex-row items-center gap-3 md:gap-6 flex-1 min-w-0">
                                {/* Project Name */}
                                <div className="flex items-center gap-2 md:gap-3 group min-w-0 flex-1">
                                    <div className="bg-blue-600 p-1.5 md:p-2 rounded flex-shrink-0">
                                        <FileText size={16} className="md:w-5 md:h-5 text-white" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <label className="hidden md:block text-[9px] uppercase font-bold text-slate-400 tracking-widest mb-1">Projecte</label>
                                        <input
                                            className="text-sm md:text-xl font-bold text-slate-800 bg-transparent border-b-2 border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none transition-colors px-1 -ml-1 w-full truncate"
                                            value={budget.name}
                                            onChange={(e) => setBudget(prev => ({ ...prev, name: e.target.value }))}
                                            placeholder="Nom del Projecte"
                                        />
                                    </div>
                                </div>

                                {/* Nova Entrada Button */}
                                <button
                                    onClick={() => setShowCreator(true)}
                                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 md:px-6 py-3 md:py-3 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-blue-500/25 flex-shrink-0"
                                    title="Nova Entrada"
                                >
                                    <Plus size={16} className="md:w-4.5 md:h-4.5" />
                                    <span className="hidden md:inline text-[11px] font-bold uppercase tracking-widest">Nova Entrada</span>
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="flex-1 overflow-auto">
                        {activeTab === 'editor' && (
                            <table className="w-full text-left border-collapse table-fixed md:table-auto">
                                <thead className="sticky top-0 bg-white z-20 border-b border-slate-200 shadow-sm">
                                    <tr className="text-[8px] md:text-[9px] uppercase text-slate-400 font-black tracking-widest bg-white">
                                        <th className="p-1 md:p-2 w-6 md:w-10 text-center"></th>
                                        <th className="p-1 md:p-2 w-16 md:w-28 text-left">Codi</th>
                                        <th className="p-1 md:p-2 text-left">Descripció</th>

                                        {appMode === 'budget' ? (
                                            <>
                                                <th className="hidden md:table-cell p-2 w-14 text-center">Ud.</th>
                                                <th className="hidden md:table-cell p-2 w-20 text-right">Quantitat</th>
                                                <th className="hidden md:table-cell p-2 w-28 text-right">Preu Ud.</th>
                                            </>
                                        ) : (
                                            <>
                                                <th className="hidden md:table-cell p-2 w-10 text-center text-[7px]">Ud.</th>
                                                <th className="hidden md:table-cell p-2 w-16 text-right text-[7px]">Previst</th>
                                                <th className="hidden lg:table-cell p-2 w-12 text-right text-[7px]">Ant. %</th>
                                                <th className="hidden lg:table-cell p-2 w-12 text-right text-[7px]">Act. %</th>
                                                <th className="p-1 md:p-2 w-16 md:w-20 text-right text-[7px]">Cert. Origen</th>
                                                <th className="hidden md:table-cell p-2 w-12 text-right text-[7px]">%</th>
                                            </>
                                        )}

                                        <th className="p-1 md:p-2 w-20 md:w-32 text-right">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {renderTableRows(filteredChapters)}
                                </tbody>
                            </table>
                        )}
                        {activeTab === 'prices' && renderPricesTable()}
                        {activeTab === 'recursos' && renderResourcesTable()}
                        {activeTab === 'residus' && renderWasteTable()}

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

                {/* Mobile: Bottom Sheet Backdrop */}
                {showMobileSidebar && selectedId && (
                    <div
                        className="md:hidden fixed inset-0 bg-black/50 z-40"
                        onClick={() => setShowMobileSidebar(false)}
                    />
                )}

                {/* Mobile: Bottom Sheet Toggle Tab (only when item selected) */}
                {selectedId && !showMobileSidebar && (
                    <button
                        className="md:hidden fixed bottom-0 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white px-6 py-2 rounded-t-lg shadow-lg z-50 flex items-center gap-2"
                        onClick={() => setShowMobileSidebar(!showMobileSidebar)}
                    >
                        <ChevronDown className={showMobileSidebar ? 'rotate-180' : ''} size={16} />
                        <span className="text-xs font-bold uppercase tracking-wider">Detall</span>
                    </button>
                )}

                <aside
                    className={`
                        bg-slate-50 border-l border-slate-200 overflow-y-auto flex flex-col
                        ${selectedId ? 'fixed md:relative' : 'hidden md:block'}
                        ${showMobileSidebar ? 'max-md:bottom-0 max-md:left-0 max-md:right-0' : 'max-md:-bottom-full'}
                        transition-all duration-300 ease-in-out
                        z-50 md:z-auto
                        max-h-[80vh] md:max-h-none
                        rounded-t-2xl md:rounded-none
                        shadow-2xl md:shadow-none
                    `}
                    style={{ width: window.innerWidth < 768 ? '100%' : `${sidebarWidth}px` }}
                >
                    {/* Mobile: Close button */}
                    {selectedId && (
                        <button
                            className="md:hidden sticky top-0 bg-slate-200 p-3 flex items-center justify-center z-10"
                            onClick={() => setShowMobileSidebar(false)}
                        >
                            <div className="w-12 h-1 bg-slate-400 rounded-full"></div>
                        </button>
                    )}
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
                            const node = findNode(resolvedChapters);
                            if (!node) return <div className="p-8 text-center text-slate-400 text-xs italic">Element no trobat</div>;

                            return (
                                <div className="flex flex-col h-full animate-in fade-in duration-300">
                                    <header className="bg-white border-b border-slate-200 p-4 sticky top-0 z-10 shadow-sm">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[10px] font-black bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{node.code}</span>
                                            <h2 className="text-sm font-bold text-slate-800 truncate">{node.description}</h2>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">{node.unit ? 'Detall de Partida' : 'Detall de Capítol'}</p>
                                            <div className="flex items-center gap-1">
                                                <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                                                    {node.unit ? formatCurrency(calcItemTotalAmount(node, priceDatabase)) : formatCurrency(calcChapterTotal(node, priceDatabase))}
                                                </span>
                                                {node.unit && <span className="text-[10px] font-black bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{node.unit}</span>}
                                            </div>
                                        </div>
                                    </header>

                                    <div className="flex-1 p-4 space-y-4">
                                        {/* Certification Section - Only in Certification Mode */}
                                        {appMode === 'certification' && activeCertId && node.unit && (
                                            <CertificationSidebar
                                                node={node}
                                                activeCertId={activeCertId}
                                                certifications={budget.certifications}
                                                priceDatabase={priceDatabase}
                                                expanded={expandedSidebarSections.certification}
                                                onToggle={() => toggleSidebarSection('certification')}
                                                actions={certActions}
                                            />
                                        )}

                                        {/* Títol & Codi Section */}
                                        <div className="bg-white border border-slate-200 rounded shadow-sm overflow-hidden">
                                            <button
                                                onClick={() => toggleSidebarSection('title')}
                                                className="w-full px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between hover:bg-slate-100 transition-colors"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <Tag size={12} className="text-slate-400" />
                                                    <span className="text-[11px] md:text-[10px] font-bold uppercase text-slate-600 tracking-wider">Identificació</span>
                                                </div>
                                                {expandedSidebarSections.title ? <ChevronDown size={12} className="text-slate-400" /> : <ChevronRight size={12} className="text-slate-400" />}
                                            </button>
                                            {expandedSidebarSections.title && (
                                                <div className="p-3 space-y-3">
                                                    <div>
                                                        <label className="text-[10px] md:text-[9px] font-bold text-slate-400 uppercase mb-1 block">Concepte / Títol</label>
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
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Unitat</label>
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
                                                        <span className="text-[11px] md:text-[10px] font-bold uppercase text-slate-600 tracking-wider">Detall d'Amidament</span>
                                                    </div>
                                                    {expandedSidebarSections.measurements ? <ChevronDown size={12} className="text-slate-400" /> : <ChevronRight size={12} className="text-slate-400" />}
                                                </button>
                                                {expandedSidebarSections.measurements && (
                                                    <div className="p-0">
                                                        <table className="w-full text-xs md:text-[11px]">
                                                            <thead className="bg-slate-50 border-b border-slate-100 text-[10px] md:text-[9px] uppercase text-slate-400 font-bold">
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
                                                                {/* Línies vinculades: l'amidament ve d'una altra partida, així que
                                                                    no s'editen Ud/Ll/Am/Al sinó el factor. */}
                                                                {(node.measurements || []).filter(m => !m.isIncrement && isRefLine(m)).map(m => (
                                                                    <tr key={m.id} className="group bg-blue-50/40">
                                                                        <td className="p-1.5">
                                                                            <input type="text" value={m.description} onChange={(e) => updateMeasurement(node.id, m.id, 'description', e.target.value)} className="w-full bg-transparent border-none text-slate-600 outline-none p-0" />
                                                                            <span className="flex items-center gap-1 text-[9px] font-mono text-blue-600 mt-0.5">
                                                                                <LinkIcon size={9} /> {refLabel(m)}
                                                                            </span>
                                                                        </td>
                                                                        <td colSpan={3} className="p-1.5 text-right text-[9px] text-slate-400 uppercase tracking-widest">Factor</td>
                                                                        <td className="p-1.5">
                                                                            <NumberInput
                                                                                value={m.factor ?? 1}
                                                                                onChange={(v) => updateMeasurement(node.id, m.id, 'factor', v)}
                                                                                className="w-full text-right bg-transparent border-none font-mono text-blue-700 font-bold outline-none p-0"
                                                                            />
                                                                        </td>
                                                                        <td className="p-1.5 text-right font-bold text-blue-900">
                                                                            <div className="flex items-center justify-end gap-1">
                                                                                {formatNumber(calcMeasureTotal(m), 2)}
                                                                                <button
                                                                                    onClick={() => deleteMeasurementLine(node.id, m.id)}
                                                                                    className="opacity-60 md:opacity-0 md:group-hover:opacity-100 text-slate-400 hover:text-red-500 p-2 -m-1 ml-1 touch-manipulation"
                                                                                >
                                                                                    <X size={10} />
                                                                                </button>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                ))}

                                                                {/* Normal Lines */}
                                                                {(node.measurements || []).filter(m => !m.isIncrement && !isRefLine(m)).map(m => (
                                                                    <tr key={m.id} className="group">
                                                                        <td className="p-1.5"><input type="text" value={m.description} onChange={(e) => updateMeasurement(node.id, m.id, 'description', e.target.value)} className="w-full bg-transparent border-none text-slate-600 outline-none p-0" /></td>
                                                                        <td className="p-1.5"><NumberInput value={m.units} onChange={(v) => updateMeasurement(node.id, m.id, 'units', v)} className="w-full text-right bg-transparent border-none font-mono outline-none p-0" /></td>
                                                                        <td className="p-1.5"><NumberInput value={m.length} onChange={(v) => updateMeasurement(node.id, m.id, 'length', v)} className="w-full text-right bg-transparent border-none font-mono text-slate-400 outline-none p-0" /></td>
                                                                        <td className="p-1.5"><NumberInput value={m.width} onChange={(v) => updateMeasurement(node.id, m.id, 'width', v)} className="w-full text-right bg-transparent border-none font-mono text-slate-400 outline-none p-0" /></td>
                                                                        <td className="p-1.5"><NumberInput value={m.height} onChange={(v) => updateMeasurement(node.id, m.id, 'height', v)} className="w-full text-right bg-transparent border-none font-mono text-slate-400 outline-none p-0" /></td>
                                                                        <td className="p-1.5 text-right font-bold text-blue-900">
                                                                            <div className="flex items-center justify-end gap-1">
                                                                                {formatNumber(calcMeasureTotal(m), 2)}
                                                                                <button
                                                                                    onClick={() => deleteMeasurementLine(node.id, m.id)}
                                                                                    className="opacity-60 md:opacity-0 md:group-hover:opacity-100 text-slate-400 hover:text-red-500 p-2 -m-1 ml-1 touch-manipulation"
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
                                                                            <td className="p-1.5 text-right text-slate-500 text-[11px] md:text-[10px]">%</td>
                                                                            <td className="p-1.5"><NumberInput value={m.units} onChange={(v) => updateMeasurement(node.id, m.id, 'units', v)} className="w-full text-right bg-transparent border-none font-mono font-bold outline-none p-0" /></td>
                                                                            <td colSpan={2} className="p-1.5 text-center text-slate-300">-</td>
                                                                            <td className="p-1.5 text-right font-bold text-blue-900 bg-slate-50">
                                                                                <div className="flex items-center justify-end gap-1">
                                                                                    {formatNumber(partial, 2)}
                                                                                    <button
                                                                                        onClick={() => deleteMeasurementLine(node.id, m.id)}
                                                                                        className="opacity-60 md:opacity-0 md:group-hover:opacity-100 text-slate-400 hover:text-red-500 p-2 -m-1 ml-1 touch-manipulation"
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
                                                                <button onClick={() => addMeasurementLine(node.id)} className="text-[10px] md:text-[9px] bg-white border border-slate-200 px-2 py-1 flex items-center gap-1 hover:bg-slate-100 transition-colors uppercase font-bold text-slate-600">
                                                                    <Plus size={10} /> Afegir línia
                                                                </button>
                                                                <button onClick={() => setLinkTarget(node.id)} className="text-[10px] md:text-[9px] bg-white border border-blue-200 text-blue-700 px-2 py-1 flex items-center gap-1 hover:bg-blue-50 transition-colors uppercase font-bold" title="Prendre l'amidament d'una altra partida">
                                                                    <LinkIcon size={10} /> Vincular
                                                                </button>
                                                                <button onClick={() => addIncrementLine(node.id)} className="text-[10px] md:text-[9px] bg-white border border-slate-200 px-2 py-1 flex items-center gap-1 hover:bg-slate-100 transition-colors uppercase font-bold text-slate-600">
                                                                    <Percent size={10} /> Afegir %
                                                                </button>
                                                            </div>
                                                            <span className="text-[11px] md:text-[10px] font-mono font-bold text-blue-700">{formatNumber(calcItemTotalQty(node), 2)} {node.unit}</span>
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



            {notification && (
                <div className={`fixed bottom-16 left-1/2 -translate-x-1/2 px-8 py-4 border-2 text-white transition-all transform animate-in fade-in slide-in-from-bottom-8 flex items-center gap-4 z-[100] ${notification.type === 'error' ? 'bg-red-600 border-red-500' : 'bg-slate-950 border-slate-800'}`}>
                    <Info size={24} className="text-blue-400" />
                    <div className="flex flex-col">
                        <span className="text-sm font-bold tracking-tight leading-none mb-1">{notification.msg}</span>
                        <span className="text-[10px] opacity-60 font-bold uppercase">Sistema de gestió BC3</span>
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

            {linkTarget && (
                <LinkItemModal
                    chapters={resolvedChapters}
                    excludeCode={findNodeById(budget.chapters, linkTarget)?.code}
                    onPick={(code, lineId) => { addLinkedLine(linkTarget, code, lineId); setLinkTarget(null); }}
                    onClose={() => setLinkTarget(null)}
                />
            )}

            {showLibrary && (
                <ProjectLibraryModal
                    projects={library}
                    currentId={budget.id}
                    onOpen={handleOpenFromLibrary}
                    onDelete={handleDeleteFromLibrary}
                    onClose={() => setShowLibrary(false)}
                />
            )}

            {showCertSummary && appMode === 'certification' && (
                <CertificationSummaryModal
                    summary={certificationSummary}
                    cert={activeCert}
                    previousCert={previousCert}
                    config={printConfig}
                    setConfig={setPrintConfig}
                    onExportPdf={handleExportCertificationPDF}
                    onClose={() => setShowCertSummary(false)}
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
                    budget={{ ...budget, chapters: resolvedChapters }}
                    priceDatabase={priceDatabase}
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

            {drive.isLoading && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[110]">
                    <div className="bg-white p-6 rounded-lg shadow-xl flex flex-col items-center gap-4">
                        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-sm font-bold uppercase tracking-widest text-slate-600">Carregant de Drive...</span>
                    </div>
                </div>
            )}
        </div>
    );
}
