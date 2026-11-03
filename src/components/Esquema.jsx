import { useState } from 'react';
import { X, Maximize2 } from 'lucide-react';

/**
 * L'esquema d'un sistema (`utils/esquema.js`): la imatge, i en tocar-la es veu a pantalla
 * completa. Es mostra amb `<img>`: un SVG dins d'una imatge no executa res.
 */
const Esquema = ({ esquema, className = 'max-h-56', titol }) => {
    const [gran, setGran] = useState(false);
    if (!esquema?.dades) return null;
    return (
        <>
            <button
                type="button"
                onClick={() => setGran(true)}
                className="relative group block w-full bg-white border border-slate-200 hover:border-violet-400 p-1 touch-manipulation"
                title="Amplia l'esquema"
            >
                <img src={esquema.dades} alt={titol || esquema.nom || 'Esquema del sistema'} className={`mx-auto w-auto max-w-full object-contain ${className}`} />
                <span className="absolute top-1.5 right-1.5 bg-white/90 border border-slate-200 p-1 text-slate-500 opacity-60 md:opacity-0 md:group-hover:opacity-100">
                    <Maximize2 size={12} />
                </span>
            </button>
            {gran && (
                <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4" onClick={() => setGran(false)}>
                    <img src={esquema.dades} alt={titol || esquema.nom || 'Esquema del sistema'} className="max-w-full max-h-full object-contain bg-white" />
                    <button onClick={() => setGran(false)} className="absolute top-3 right-3 bg-white/90 p-2 text-slate-700 touch-manipulation" title="Tanca" aria-label="Tanca l'esquema">
                        <X size={18} />
                    </button>
                </div>
            )}
        </>
    );
};

export default Esquema;
