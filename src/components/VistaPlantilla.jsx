/**
 * Sota un camp de text amb variables (`utils/plantilles.js`): com queda amb els valors d'ara
 * dels paràmetres. No surt si el text no en porta.
 */
const VistaPlantilla = ({ plantilla, resolt }) => {
    if (!plantilla) return null;
    return (
        <div className="mt-1 border-l-2 border-violet-300 bg-violet-50/60 px-2 py-1 text-[11px] text-slate-600 leading-snug whitespace-pre-wrap break-words">
            <span className="block text-[9px] font-black uppercase tracking-widest text-violet-500">Amb els valors d&apos;ara</span>
            {resolt}
        </div>
    );
};

export default VistaPlantilla;
