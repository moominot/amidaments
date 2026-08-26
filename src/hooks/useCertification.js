import { useCallback } from 'react';
import { round2, calcItemTotalQty } from '../utils/calculations';

/**
 * Hook per gestionar les actualitzacions d'estat de les certificacions
 */
export const useCertification = (budget, setBudget, notify) => {

    /**
     * Una fase aprovada no admet canvis. Fins ara el bloqueig era només visual —
     * el component amagava els controls— però el hook no el comprovava enlloc.
     */
    const bloquejada = useCallback((certId) => {
        const cert = (budget.certifications || []).find(c => c.id === certId);
        if (!cert?.approved) return false;
        notify?.(`"${cert.name}" està aprovada. Reobre-la per poder-hi fer canvis.`, 'error');
        return true;
    }, [budget.certifications, notify]);

    const updateCertificationQty = useCallback((nodeId, certId, qty) => {
        if (bloquejada(certId)) return;
        setBudget(prev => {
            const updateNodes = (nodes) => nodes.map(n => {
                if (n.id === nodeId) {
                    const certifications = { ...(n.certifications || {}) };
                    certifications[certId] = {
                        ...(certifications[certId] || {}),
                        quantity: parseFloat(qty) || 0,
                        measurements: [] // Clear detail when setting manual quantity
                    };
                    return { ...n, certifications };
                }
                return {
                    ...n,
                    subChapters: updateNodes(n.subChapters || []),
                    items: updateNodes(n.items || [])
                };
            });
            return { ...prev, chapters: updateNodes(prev.chapters) };
        });
    }, [setBudget, bloquejada]);

    const updateCertificationMeasurement = useCallback((nodeId, certId, lineId, field, value) => {
        if (bloquejada(certId)) return;
        const isNumeric = ['units', 'length', 'width', 'height'].includes(field);
        const finalValue = isNumeric ? parseFloat(value) || 0 : value;

        setBudget(prev => {
            const updateNodes = (nodes) => nodes.map(n => {
                if (n.id === nodeId) {
                    const certifications = { ...(n.certifications || {}) };
                    const certData = { ...(certifications[certId] || { measurements: [], quantity: 0 }) };
                    certData.measurements = (certData.measurements || []).map(m =>
                        m.id === lineId ? { ...m, [field]: finalValue } : m
                    );
                    certifications[certId] = certData;
                    return { ...n, certifications };
                }
                return {
                    ...n,
                    subChapters: updateNodes(n.subChapters || []),
                    items: updateNodes(n.items || [])
                };
            });
            return { ...prev, chapters: updateNodes(prev.chapters) };
        });
    }, [setBudget, bloquejada]);

    const addCertificationLine = useCallback((nodeId, certId) => {
        if (bloquejada(certId)) return;
        setBudget(prev => {
            const updateNodes = (nodes) => nodes.map(n => {
                if (n.id === nodeId) {
                    const certifications = { ...(n.certifications || {}) };
                    const certData = { ...(certifications[certId] || { measurements: [], quantity: 0 }) };
                    certData.measurements = [...(certData.measurements || []), { 
                        id: Date.now().toString() + Math.random(), 
                        description: 'Nova línia', 
                        units: 1, 
                        length: 1, 
                        width: 1, 
                        height: 1 
                    }];
                    certifications[certId] = certData;
                    return { ...n, certifications };
                }
                return {
                    ...n,
                    subChapters: updateNodes(n.subChapters || []),
                    items: updateNodes(n.items || [])
                };
            });
            return { ...prev, chapters: updateNodes(prev.chapters) };
        });
    }, [setBudget, bloquejada]);

    const removeCertificationLine = useCallback((nodeId, certId, lineId) => {
        if (bloquejada(certId)) return;
        setBudget(prev => {
            const updateNodes = (nodes) => nodes.map(n => {
                if (n.id === nodeId) {
                    const certifications = { ...(n.certifications || {}) };
                    const certData = { ...(certifications[certId] || {}) };
                    certData.measurements = (certData.measurements || []).filter(m => m.id !== lineId);
                    certifications[certId] = certData;
                    return { ...n, certifications };
                }
                return {
                    ...n,
                    subChapters: updateNodes(n.subChapters || []),
                    items: updateNodes(n.items || [])
                };
            });
            return { ...prev, chapters: updateNodes(prev.chapters) };
        });
    }, [setBudget, bloquejada]);

    const copyBudgetToCertification = useCallback((nodeId, certId) => {
        if (bloquejada(certId)) return;
        setBudget(prev => {
            const updateNodes = (nodes) => nodes.map(n => {
                if (n.id === nodeId) {
                    const certifications = { ...(n.certifications || {}) };
                    const certData = {
                        measurements: (n.measurements || []).map(m => ({ ...m, id: Date.now().toString() + Math.random() })),
                        quantity: calcItemTotalQty(n)
                    };
                    certifications[certId] = certData;
                    return { ...n, certifications };
                }
                return {
                    ...n,
                    subChapters: updateNodes(n.subChapters || []),
                    items: updateNodes(n.items || [])
                };
            });
            return { ...prev, chapters: updateNodes(prev.chapters) };
        });
        notify('Amidament copiat correctament', 'success');
    }, [setBudget, notify, bloquejada]);

    // --- Noves Funcions Presto ---

    const updateCertificationPercentage = useCallback((nodeId, certId, percentage, node) => {
        const totalQty = calcItemTotalQty(node);
        const qty = round2(totalQty * (parseFloat(percentage) / 100));
        updateCertificationQty(nodeId, certId, qty);
    }, [updateCertificationQty]);

    const approveCertification = useCallback((certId) => {
        setBudget(prev => {
            const certifications = (prev.certifications || []).map(c =>
                c.id === certId ? { ...c, approved: true } : c
            );
            return { ...prev, certifications };
        });
        notify('Certificació aprovada i bloquejada', 'success');
    }, [setBudget, notify]);

    /** Torna a obrir una fase aprovada. Abans, aprovar era irreversible des de la interfície. */
    const reopenCertification = useCallback((certId) => {
        setBudget(prev => ({
            ...prev,
            certifications: (prev.certifications || []).map(c =>
                c.id === certId ? { ...c, approved: false } : c
            )
        }));
        notify('Fase reoberta: torna a admetre canvis');
    }, [setBudget, notify]);

    const renameCertification = useCallback((certId, name) => {
        const net = (name || '').trim();
        if (!net) return;
        setBudget(prev => ({
            ...prev,
            certifications: (prev.certifications || []).map(c =>
                c.id === certId ? { ...c, name: net } : c
            )
        }));
    }, [setBudget]);

    const updateCertificationDate = useCallback((certId, date) => {
        setBudget(prev => ({
            ...prev,
            certifications: (prev.certifications || []).map(c =>
                c.id === certId ? { ...c, date } : c
            )
        }));
    }, [setBudget]);

    /**
     * Esborra una fase. Cal treure-la també de tots els nodes de l'arbre: `node.certifications`
     * és un mapa per certId i, si no, hi quedarien dades orfes que es tornarien a escriure al BC3.
     */
    const deleteCertification = useCallback((certId) => {
        setBudget(prev => {
            const netejaNodes = (nodes) => nodes.map(n => {
                const seguent = {
                    ...n,
                    subChapters: netejaNodes(n.subChapters || []),
                    items: netejaNodes(n.items || [])
                };
                if (n.certifications && n.certifications[certId] !== undefined) {
                    const { [certId]: descartat, ...resta } = n.certifications; // eslint-disable-line no-unused-vars
                    seguent.certifications = resta;
                }
                return seguent;
            });
            return {
                ...prev,
                chapters: netejaNodes(prev.chapters),
                certifications: (prev.certifications || []).filter(c => c.id !== certId)
            };
        });
        notify('Certificació eliminada');
    }, [setBudget, notify]);

    const toggleCertificationMethod = useCallback((certId) => {
        setBudget(prev => {
            const certifications = (prev.certifications || []).map(c => 
                c.id === certId ? { ...c, method: c.method === 'partial' ? 'origin' : 'partial' } : c
            );
            return { ...prev, certifications };
        });
    }, [setBudget]);

    return {
        updateCertificationQty,
        updateCertificationMeasurement,
        addCertificationLine,
        removeCertificationLine,
        copyBudgetToCertification,
        updateCertificationPercentage,
        approveCertification,
        reopenCertification,
        renameCertification,
        updateCertificationDate,
        deleteCertification,
        toggleCertificationMethod
    };
};
