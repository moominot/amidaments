import { useCallback } from 'react';
import { round2, calcItemTotalQty } from '../utils/calculations';

/**
 * Hook per gestionar les actualitzacions d'estat de les certificacions
 */
export const useCertification = (budget, setBudget, notify) => {

    const updateCertificationQty = useCallback((nodeId, certId, qty) => {
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
    }, [setBudget]);

    const updateCertificationMeasurement = useCallback((nodeId, certId, lineId, field, value) => {
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
    }, [setBudget]);

    const addCertificationLine = useCallback((nodeId, certId) => {
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
    }, [setBudget]);

    const removeCertificationLine = useCallback((nodeId, certId, lineId) => {
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
    }, [setBudget]);

    const copyBudgetToCertification = useCallback((nodeId, certId) => {
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
    }, [setBudget, notify]);

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
        toggleCertificationMethod
    };
};
