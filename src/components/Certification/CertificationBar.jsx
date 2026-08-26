import { useState, useEffect, useRef } from 'react';
import { Layers, Plus, Save, X, Lock, Unlock, Pencil, Trash2, Calendar } from 'lucide-react';

/**
 * Barra de gestió de certificacions.
 *
 * Al mòbil les pestanyes se sortien de pantalla sense cap indici que n'hi hagués més,
 * i la fase activa podia quedar amagada. Ara la fase activa es desplaça sola a la vista
 * i les accions sobre la fase (data, reanomenar, esborrar, aprovar o reobrir) viuen en
 * una segona línia, que és l'única manera que hi càpiguen en una pantalla estreta.
 */

/** La data pot venir com a ISO complet (creada a la UI) o com a YYYY-MM-DD (importada del BC3). */
const aDataInput = (valor) => {
    if (!valor) return '';
    const text = String(valor);
    return text.length >= 10 ? text.substring(0, 10) : '';
};

const CertificationBar = ({
    certifications = [],
    activeCertId,
    setActiveCertId,
    showNewCertInput,
    setShowNewCertInput,
    newCertName,
    setNewCertName,
    onCreateCertification,
    onApproveCertification,
    onReopenCertification,
    onRenameCertification,
    onUpdateCertificationDate,
    onDeleteCertification,
    onToggleMethod,
}) => {
    const activeCert = certifications.find(c => c.id === activeCertId);
    const isApproved = activeCert?.approved;
    const method = activeCert?.method || 'origin';

    const [editantNom, setEditantNom] = useState(false);
    const [nomEsborrany, setNomEsborrany] = useState('');
    const pestanyes = useRef(null);

    // Que la fase activa es vegi encara que la llista sigui més ampla que la pantalla.
    // Es desplaça el contenidor a mà: `scrollIntoView` arrossega també els contenidors
    // superiors i desplaçava tota la interfície uns quants píxels cap a l'esquerra.
    useEffect(() => {
        const caixa = pestanyes.current;
        const actiu = caixa?.querySelector('[data-activa="true"]');
        if (!caixa || !actiu) return;
        const desti = actiu.offsetLeft - (caixa.clientWidth - actiu.offsetWidth) / 2;
        caixa.scrollTo({ left: Math.max(0, desti), behavior: 'smooth' });
    }, [activeCertId, certifications.length]);

    const confirmarNom = () => {
        onRenameCertification?.(activeCertId, nomEsborrany);
        setEditantNom(false);
    };

    return (
        <div className="bg-slate-900 border-b border-emerald-500/20">
            {/* Línia 1: les fases */}
            <div className="flex items-center gap-2 px-2 md:px-3 pt-2 pb-1.5">
                <div className="hidden md:flex items-center gap-2 bg-emerald-900/40 text-emerald-300 px-3 py-1.5 rounded-md border border-emerald-500/30 whitespace-nowrap flex-shrink-0">
                    <Layers size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-widest leading-none">Certificacions</span>
                </div>
                <Layers size={16} className="md:hidden text-emerald-400 flex-shrink-0" />

                <div ref={pestanyes} className="flex gap-1.5 items-center overflow-x-auto no-scrollbar flex-1 min-w-0 py-0.5">
                    {certifications.map(cert => (
                        <button
                            key={cert.id}
                            data-activa={cert.id === activeCertId}
                            onClick={() => { setActiveCertId(cert.id); setEditantNom(false); }}
                            className={`px-3.5 py-3 md:py-2 rounded-md text-[11px] md:text-[10px] font-bold uppercase transition-all whitespace-nowrap flex items-center gap-1.5 flex-shrink-0 touch-manipulation ${activeCertId === cert.id
                                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30'
                                : 'bg-slate-800 text-slate-400 hover:text-emerald-300 border border-slate-700'
                                }`}
                        >
                            {cert.name}
                            {cert.approved && <Lock size={10} className="opacity-70" />}
                        </button>
                    ))}

                    {showNewCertInput ? (
                        <form
                            onSubmit={(e) => { e.preventDefault(); onCreateCertification(); }}
                            className="flex gap-1 flex-shrink-0"
                        >
                            <input
                                autoFocus
                                className="bg-slate-800 border border-emerald-500/50 text-white text-[11px] px-3 py-2 rounded-md outline-none focus:ring-1 ring-emerald-500 w-32 md:w-48"
                                placeholder="Nom de la fase..."
                                value={newCertName}
                                onChange={e => setNewCertName(e.target.value)}
                            />
                            <button type="submit" className="bg-emerald-600 text-white p-2 rounded-md hover:bg-emerald-500 touch-manipulation"><Save size={14} /></button>
                            <button type="button" onClick={() => setShowNewCertInput(false)} className="bg-slate-800 text-slate-400 p-2 rounded-md hover:text-white touch-manipulation"><X size={14} /></button>
                        </form>
                    ) : (
                        <button
                            onClick={() => setShowNewCertInput(true)}
                            className="flex items-center gap-1.5 px-3.5 py-3 md:py-2 rounded-md text-[11px] md:text-[10px] font-bold uppercase bg-slate-800 text-emerald-400 hover:bg-emerald-900/30 border border-emerald-500/30 transition-all whitespace-nowrap flex-shrink-0 touch-manipulation"
                        >
                            <Plus size={14} /> Nova
                        </button>
                    )}
                </div>
            </div>

            {/* Línia 2: accions sobre la fase activa */}
            {activeCert && (
                <div className="flex items-center gap-2 px-2 md:px-3 pb-2 overflow-x-auto no-scrollbar">
                    {editantNom ? (
                        <form
                            onSubmit={(e) => { e.preventDefault(); confirmarNom(); }}
                            className="flex gap-1 flex-shrink-0"
                        >
                            <input
                                autoFocus
                                className="bg-slate-800 border border-blue-500/50 text-white text-[11px] px-2 py-1.5 rounded-md outline-none w-36"
                                value={nomEsborrany}
                                onChange={e => setNomEsborrany(e.target.value)}
                            />
                            <button type="submit" className="bg-blue-600 text-white p-1.5 rounded-md touch-manipulation"><Save size={13} /></button>
                            <button type="button" onClick={() => setEditantNom(false)} className="bg-slate-800 text-slate-400 p-1.5 rounded-md touch-manipulation"><X size={13} /></button>
                        </form>
                    ) : (
                        <button
                            onClick={() => { setNomEsborrany(activeCert.name); setEditantNom(true); }}
                            title="Reanomenar la fase"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase bg-slate-800 text-slate-400 hover:text-white border border-slate-700 whitespace-nowrap flex-shrink-0 touch-manipulation"
                        >
                            <Pencil size={12} /> <span className="hidden sm:inline">Nom</span>
                        </button>
                    )}

                    {/* La data encapçala el document de certificació; abans quedava fixada
                        al dia en què es creava la fase i no es podia canviar. */}
                    <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-800 border border-slate-700 text-slate-400 whitespace-nowrap flex-shrink-0 cursor-pointer">
                        <Calendar size={12} />
                        <input
                            type="date"
                            value={aDataInput(activeCert.date)}
                            onChange={(e) => onUpdateCertificationDate?.(activeCertId, e.target.value)}
                            className="bg-transparent text-[10px] font-mono text-slate-200 outline-none w-[6.5rem]"
                        />
                    </label>

                    <button
                        onClick={() => onToggleMethod(activeCertId)}
                        disabled={isApproved}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase bg-slate-800 text-slate-400 hover:text-white border border-slate-700 whitespace-nowrap flex-shrink-0 disabled:opacity-50 touch-manipulation"
                        title={method === 'origin' ? 'Entrada a ORIGEN (acumulat)' : 'Entrada PARCIAL (període)'}
                    >
                        <span className="hidden sm:inline">Mesurament:</span>
                        <span className={method === 'origin' ? 'text-blue-400' : 'text-amber-400'}>
                            {method === 'origin' ? 'A ORIGEN' : 'PARCIAL'}
                        </span>
                    </button>

                    <div className="flex items-center gap-2 order-first md:order-none md:ml-auto flex-shrink-0">
                        <button
                            onClick={() => onDeleteCertification?.(activeCertId)}
                            title="Eliminar aquesta fase"
                            className="order-last md:order-first flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase bg-slate-800 text-slate-500 hover:text-red-400 border border-slate-700 whitespace-nowrap touch-manipulation"
                        >
                            <Trash2 size={12} />
                        </button>

                        {isApproved ? (
                            <button
                                onClick={() => onReopenCertification?.(activeCertId)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase bg-emerald-900/60 text-emerald-300 hover:bg-emerald-800 border border-emerald-500/30 whitespace-nowrap touch-manipulation"
                                title="Tornar a obrir la fase per poder-hi fer canvis"
                            >
                                <Unlock size={12} /> Reobrir
                            </button>
                        ) : (
                            <button
                                onClick={() => onApproveCertification(activeCertId)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase bg-amber-600 text-white hover:bg-amber-500 transition-all shadow-lg shadow-amber-900/20 whitespace-nowrap touch-manipulation"
                            >
                                <Lock size={12} /> Aprovar
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default CertificationBar;
