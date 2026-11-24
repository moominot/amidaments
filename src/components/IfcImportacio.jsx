import { useMemo, useState } from 'react';
import IfcImportModal from './IfcImportModal';
import IfcActualitzaModal from './IfcActualitzaModal';
import { teLiniesIfc, planificaActualitzacio } from '../utils/ifc/actualitza';

/**
 * Tria entre importar un IFC com a nou o actualitzar el que ja se n'ha importat.
 *
 * Si el projecte té línies amb `GlobalId`, s'ofereix actualitzar-les (el pla es calcula aquí, amb
 * el projecte d'ara: `obreFitxer` no el veu, perquè és un `useCallback` sense dependències).
 */
const IfcImportacio = ({ nom, model, chapters, priceDatabase, onInsereix, onActualitza, onTanca }) => {
    const [comNou, setComNou] = useState(false);
    const actualitza = !comNou && teLiniesIfc(chapters);
    const pla = useMemo(() => (actualitza ? planificaActualitzacio(chapters, model) : null), [actualitza, chapters, model]);

    if (actualitza) {
        return <IfcActualitzaModal nom={nom} pla={pla} onAplica={(o, r) => onActualitza(pla, o, r)} onComNou={() => setComNou(true)} onTanca={onTanca} />;
    }
    return <IfcImportModal nom={nom} model={model} priceDatabase={priceDatabase} onInsereix={onInsereix} onTanca={onTanca} />;
};

export default IfcImportacio;
