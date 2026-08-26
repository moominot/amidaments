import { Layers, Plus, Save, X, Lock } from 'lucide-react';

/**
 * Barra de gestió de certificacions
 */
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
    onToggleMethod
}) => {
    const activeCert = certifications.find(c => c.id === activeCertId);
    const isApproved = activeCert?.approved;
    const method = activeCert?.method || 'origin';

    return (
        <div className="bg-slate-900 border-b border-emerald-500/20 p-2 md:p-3 flex items-center justify-between gap-4 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-1 md:pb-0">
                <div className="flex items-center gap-2 bg-emerald-900/40 text-emerald-300 px-3 py-1.5 rounded-md border border-emerald-500/30 whitespace-nowrap">
                    <Layers size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-widest leading-none">Certificacions</span>
                </div>

                <div className="flex gap-1 items-center">
                    {certifications.map(cert => (
                        <button
                            key={cert.id}
                            onClick={() => setActiveCertId(cert.id)}
                            className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all whitespace-nowrap flex items-center gap-2 ${activeCertId === cert.id
                                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30'
                                : 'bg-slate-900 text-slate-400 hover:text-emerald-300 border border-slate-700'
                                }`}
                        >
                            {cert.name}
                            {cert.approved && <Lock size={10} className="text-emerald-200" />}
                        </button>
                    ))}

                    {showNewCertInput ? (
                        <form
                            onSubmit={(e) => { e.preventDefault(); onCreateCertification(); }}
                            className="flex gap-1 animate-in slide-in-from-left-2 duration-200"
                        >
                            <input
                                autoFocus
                                className="bg-slate-900 border border-emerald-500/50 text-white text-[10px] px-3 py-1.5 rounded-md outline-none focus:ring-1 ring-emerald-500 w-32 md:w-48"
                                placeholder="Nom..."
                                value={newCertName}
                                onChange={e => setNewCertName(e.target.value)}
                            />
                            <button type="submit" className="bg-emerald-600 text-white p-1.5 rounded-md hover:bg-emerald-500"><Save size={14} /></button>
                            <button type="button" onClick={() => setShowNewCertInput(false)} className="bg-slate-800 text-slate-400 p-1.5 rounded-md hover:text-white"><X size={14} /></button>
                        </form>
                    ) : (
                        <button
                            onClick={() => setShowNewCertInput(true)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase bg-slate-900 text-emerald-400 hover:bg-emerald-900/30 border border-emerald-500/30 transition-all whitespace-nowrap"
                        >
                            <Plus size={14} /> Nova
                        </button>
                    )}
                </div>
            </div>

            {activeCertId && !isApproved && (
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => onToggleMethod(activeCertId)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase bg-slate-800 text-slate-300 hover:text-white border border-slate-700 transition-all whitespace-nowrap"
                        title={method === 'origin' ? "Entrada a ORIGEN (Acumulat)" : "Entrada PARCIAL (Període)"}
                    >
                        Mesurament: <span className={method === 'origin' ? 'text-blue-400' : 'text-amber-400'}>{method === 'origin' ? 'A ORIGEN' : 'PARCIAL'}</span>
                    </button>

                    <button
                        onClick={() => onApproveCertification(activeCertId)}
                        className="flex items-center gap-2 px-4 py-1.5 rounded-md text-[10px] font-bold uppercase bg-amber-600 text-white hover:bg-amber-500 transition-all shadow-lg shadow-amber-900/20 whitespace-nowrap"
                    >
                        <Lock size={12} /> Aprovar FASE
                    </button>
                </div>
            )}

            {isApproved && (
                <div className="flex items-center gap-4">
                    <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                        Mètode: <span className="text-slate-400">{method === 'origin' ? 'A ORIGEN' : 'PARCIAL'}</span>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-1.5 rounded-md text-[10px] font-bold uppercase bg-emerald-900/60 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
                        <Lock size={12} /> Fase Aprovada
                    </div>
                </div>
            )}
        </div>
    );
};

export default CertificationBar;
