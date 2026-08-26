import { BarChart3, ChevronRight } from 'lucide-react';
import { formatCurrency, formatNumber } from '../../utils/calculations';

/**
 * Resum en viu de la certificació activa.
 *
 * Es manté visible mentre s'edita perquè el percentatge total certificat s'actualitzi
 * a cada canvi. El mesurador és d'un sol to (verd maragda, de clar a fosc): la pista
 * és el pendent, el tram fosc l'anterior i el clar el període actual.
 */

// Trams del mesurador. Ramp monòton clar → fosc, validat per a daltonisme i contrast.
const TRAM_ANTERIOR = '#047857'; // emerald-700
const TRAM_PERIODE = '#10b981';  // emerald-500

const Tile = ({ label, value, hint, swatch, emphasis = false }) => (
    <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-1.5">
            {swatch && (
                <span
                    className="w-2 h-2 rounded-[2px] flex-shrink-0"
                    style={{ backgroundColor: swatch }}
                    aria-hidden="true"
                />
            )}
            <span className="text-[8px] md:text-[9px] uppercase font-bold tracking-widest text-slate-500 leading-none truncate">
                {label}
            </span>
        </div>
        <span className={`font-mono leading-none truncate ${emphasis
            ? 'text-sm md:text-base font-bold text-emerald-300'
            : 'text-[11px] md:text-xs font-semibold text-slate-200'}`}>
            {value}
        </span>
        {hint && (
            <span className="text-[9px] font-mono text-slate-500 leading-none truncate">{hint}</span>
        )}
    </div>
);

const CertificationSummary = ({ totals, certName, onOpenDetail }) => {
    // El pressupost és el límit del mesurador; per damunt del 100% el tram es satura
    // però el percentatge textual segueix mostrant el valor real.
    const previousWidth = Math.max(0, Math.min(100, totals.previousPct));
    const periodWidth = Math.max(0, Math.min(100 - previousWidth, totals.periodPct));
    const excedit = totals.originPct > 100.005;

    return (
        <div className="bg-slate-900 border-b border-emerald-500/20 px-3 md:px-4 py-2.5">
            <div className="flex items-center gap-4 md:gap-8">
                {/* Xifra principal: % certificat a origen */}
                <div className="flex flex-col gap-1 flex-shrink-0">
                    <span className="text-[8px] md:text-[9px] uppercase font-bold tracking-widest text-slate-500 leading-none">
                        Certificat a origen
                    </span>
                    <div className="flex items-baseline gap-2">
                        <span className={`font-mono font-bold leading-none tracking-tighter text-2xl md:text-3xl ${excedit ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {formatNumber(totals.originPct, 1)}<span className="text-base md:text-lg">%</span>
                        </span>
                        <span className="font-mono text-[11px] md:text-xs text-slate-400 truncate">
                            {formatCurrency(totals.origin)}
                        </span>
                    </div>
                </div>

                {/* Mesurador: anterior + període sobre el pressupost */}
                <div className="flex-1 min-w-0 hidden sm:flex flex-col gap-1.5">
                    <div
                        className="h-2.5 w-full bg-emerald-900/60 rounded-sm overflow-hidden flex"
                        role="img"
                        aria-label={`Certificat ${formatNumber(totals.originPct, 1)}% del pressupost: anterior ${formatNumber(totals.previousPct, 1)}%, període ${formatNumber(totals.periodPct, 1)}%`}
                    >
                        <div style={{ width: `${previousWidth}%`, backgroundColor: TRAM_ANTERIOR }} />
                        {periodWidth > 0 && (
                            <>
                                {/* Separador de 2 px entre trams perquè es llegeixin com a dos */}
                                {previousWidth > 0 && <div className="w-[2px] bg-slate-900 flex-shrink-0" />}
                                <div style={{ width: `${periodWidth}%`, backgroundColor: TRAM_PERIODE }} />
                            </>
                        )}
                    </div>
                    <div className="flex justify-between text-[9px] font-mono text-slate-500 leading-none">
                        <span>0%</span>
                        <span className="truncate px-2">
                            Pressupost {formatCurrency(totals.budget)}
                        </span>
                        <span>100%</span>
                    </div>
                </div>

                {/* Desglossament */}
                <div className="hidden md:grid grid-cols-3 gap-6 flex-shrink-0">
                    <Tile
                        label="Anterior"
                        swatch={TRAM_ANTERIOR}
                        value={formatCurrency(totals.previous)}
                        hint={`${formatNumber(totals.previousPct, 1)}%`}
                    />
                    <Tile
                        label="Període"
                        swatch={TRAM_PERIODE}
                        value={formatCurrency(totals.period)}
                        hint={`${formatNumber(totals.periodPct, 1)}%`}
                    />
                    <Tile
                        label="Pendent"
                        value={formatCurrency(totals.pending)}
                        hint={`${formatNumber(100 - totals.originPct, 1)}%`}
                    />
                </div>

                <button
                    onClick={onOpenDetail}
                    className="flex items-center gap-2 px-3 py-3 md:py-2 rounded-md text-[10px] font-bold uppercase tracking-widest bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700 transition-colors whitespace-nowrap flex-shrink-0"
                    title={certName ? `Detall per capítols de ${certName}` : 'Detall per capítols'}
                >
                    <BarChart3 size={14} className="text-emerald-400" />
                    <span className="hidden lg:inline">Detall</span>
                    <ChevronRight size={12} className="text-slate-500" />
                </button>
            </div>

            {/* Xifres essencials en mòbil, on el desglossament no hi cap */}
            <div className="md:hidden flex items-center gap-4 mt-2 pt-2 border-t border-slate-800 text-[10px] font-mono">
                <span className="text-slate-500">
                    Ant. <span className="text-slate-300">{formatNumber(totals.previousPct, 1)}%</span>
                </span>
                <span className="text-slate-500">
                    Període <span className="text-emerald-400">{formatCurrency(totals.period)}</span>
                </span>
                <span className="text-slate-500 ml-auto">
                    Pendent <span className="text-slate-300">{formatCurrency(totals.pending)}</span>
                </span>
            </div>
        </div>
    );
};

export default CertificationSummary;
