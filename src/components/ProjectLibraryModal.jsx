import { X, FolderOpen, Trash2, FileText } from 'lucide-react';
import { formatCurrency } from '../utils/calculations';

/**
 * Llista dels projectes desats al navegador, per poder tornar a una obra anterior
 * sense haver d'anar a buscar el fitxer JSON.
 */

const quan = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('ca-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const ProjectLibraryModal = ({ projects, currentId, onOpen, onDelete, onClose }) => (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 backdrop-blur-md p-2 md:p-8">
        <div className="bg-white shadow-2xl border border-slate-300 w-full max-w-2xl max-h-full flex flex-col animate-in zoom-in-95 duration-200">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-600 p-1.5"><FolderOpen size={16} /></div>
                    <div>
                        <h3 className="font-bold uppercase tracking-widest text-xs">Projectes recents</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5">Desats en aquest navegador</p>
                    </div>
                </div>
                <button onClick={onClose} className="hover:text-red-400 transition-colors p-2 -m-2 touch-manipulation">
                    <X size={18} />
                </button>
            </div>

            <div className="overflow-auto flex-1 divide-y divide-slate-100">
                {projects.length === 0 && (
                    <div className="p-12 text-center">
                        <FileText size={40} className="mx-auto text-slate-200 mb-3" />
                        <p className="text-xs text-slate-400 italic">
                            Encara no hi ha cap projecte desat. El projecte actual s&apos;hi afegirà tot sol.
                        </p>
                    </div>
                )}

                {projects.map(p => {
                    const actual = p.id === currentId;
                    return (
                        <div key={p.id} className={`flex items-center gap-3 p-3 md:p-4 ${actual ? 'bg-blue-50/60' : 'hover:bg-slate-50'}`}>
                            <button
                                onClick={() => !actual && onOpen(p.id)}
                                disabled={actual}
                                className="flex-1 min-w-0 text-left touch-manipulation"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="text-[13px] font-bold text-slate-800 truncate">{p.name}</span>
                                    {actual && (
                                        <span className="text-[9px] uppercase font-bold tracking-widest text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded flex-shrink-0">
                                            obert
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[10px] text-slate-400 font-mono">
                                    <span>{p.chapterCount} capítols</span>
                                    <span>{formatCurrency(p.total)}</span>
                                    <span>{quan(p.updatedAt)}</span>
                                </div>
                            </button>

                            <button
                                onClick={() => onDelete(p.id)}
                                title="Treure de la llista"
                                className="p-2.5 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0 touch-manipulation"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    );
                })}
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-shrink-0 gap-3">
                <p className="text-[10px] text-slate-400 italic leading-tight">
                    Es guarden al navegador. Per conservar-los de veritat, exporta el projecte o desa&apos;l a Drive.
                </p>
                <button
                    onClick={onClose}
                    className="bg-slate-800 text-white hover:bg-slate-700 px-5 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors flex-shrink-0 touch-manipulation"
                >
                    Tancar
                </button>
            </div>
        </div>
    </div>
);

export default ProjectLibraryModal;
