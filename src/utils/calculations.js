/**
 * Utilitats de càlcul per a Amidaments i Certificacions
 */

export const round2 = (val) => Math.round(((Number(val) || 0) + Number.EPSILON) * 100) / 100;

export const normalizeCode = (code) => code ? code.trim().replace(/#+$/, '') : '';

export const formatCurrency = (val) => 
    new Intl.NumberFormat('ca-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val || 0);

export const formatNumber = (val, decimals = 2) => 
    Number(val || 0).toLocaleString('ca-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export const getComponentCategory = (code) => {
    if (!code) return 'directCost';
    const c = code.toLowerCase();
    if (c.startsWith('mo')) return 'labor';
    if (c.startsWith('mt') || c.startsWith('mq')) return 'material';
    if (c.includes('%')) return 'percent';
    return 'directCost';
};

export const calcMeasureTotal = (m) => round2((m.units || 0) * (m.length || 1) * (m.width || 1) * (m.height || 1));

export const calcItemTotalQty = (item) => {
    if (!item.measurements || item.measurements.length === 0) return 0;

    let subtotal = 0;
    item.measurements.forEach(m => {
        if (!m.isIncrement) {
            subtotal += calcMeasureTotal(m);
        }
    });

    const incrementTotal = item.measurements
        .filter(m => m.isIncrement)
        .reduce((acc, m) => {
            const percentage = parseFloat(m.units) || 0;
            return acc + (subtotal * (percentage / 100));
        }, 0);

    return round2(subtotal + incrementTotal);
};

export const getItemUnitPrice = (item, priceDatabase = {}) => {
    if (item.breakdown && item.breakdown.length > 0) {
        let baseTotal = 0;
        item.breakdown.forEach(line => {
            const cat = getComponentCategory(line.code);
            if (cat !== 'percent') {
                const dbPrice = priceDatabase[normalizeCode(line.code)]?.price;
                const unitPrice = dbPrice !== undefined ? dbPrice : (line.price || 0);
                baseTotal = round2(baseTotal + round2(unitPrice * (line.yield || 0)));
            }
        });
        baseTotal = round2(baseTotal);

        return round2(item.breakdown.reduce((acc, line) => {
            const cat = getComponentCategory(line.code);

            if (cat === 'percent') {
                const percentage = line.yield || 0;
                const dbUnit = priceDatabase[normalizeCode(line.code)]?.unit;
                const isActuallyPercent = dbUnit === '%' || line.unit === '%' || line.code === '%';
                const lineTotal = round2(baseTotal * (isActuallyPercent ? percentage / 100 : percentage));
                return acc + lineTotal;
            }

            const dbPrice = priceDatabase[normalizeCode(line.code)]?.price;
            const unitPrice = dbPrice !== undefined ? dbPrice : (line.price || 0);
            return acc + round2(unitPrice * (line.yield || 0));
        }, 0));
    }
    const code = normalizeCode(item.code);
    return priceDatabase[code]?.price ?? item.price ?? 0;
};

/**
 * Càlcula la quantitat certificada a ORIGEN (acumulada) per a un ítem fins a una certificació donada.
 * Si el mètode de la certificació és 'partial', suma totes les parcials fins a certId.
 * Si és 'origin', assumeix que certId ja conté el total acumulat.
 */
export const calcItemCertifiedQty = (item, certId, certifications = []) => {
    if (!item.certifications || !certId) return 0;
    
    // Trobar l'índex de la certificació actual
    const currentCertIdx = certifications.length > 0 ? certifications.findIndex(c => c.id === certId) : -1;
    const currentCert = currentCertIdx !== -1 ? certifications[currentCertIdx] : null;
    const method = currentCert?.method || 'origin';

    const getCertQty = (id) => {
        const certData = item.certifications[id];
        if (!certData) return 0;
        if (certData.measurements && certData.measurements.length > 0) {
            let subtotal = 0;
            certData.measurements.forEach(m => {
                if (!m.isIncrement) subtotal += round2((m.units || 0) * (m.length || 1) * (m.width || 1) * (m.height || 1));
            });
            const incrementTotal = certData.measurements
                .filter(m => m.isIncrement)
                .reduce((acc, m) => acc + (subtotal * ((parseFloat(m.units) || 0) / 100)), 0);
            return round2(subtotal + incrementTotal);
        }
        return parseFloat(certData.quantity) || 0;
    };

    if (method === 'partial') {
        // Sumar totes les parcials fins a l'índex actual
        let total = 0;
        for (let i = 0; i <= currentCertIdx; i++) {
            total = round2(total + getCertQty(certifications[i].id));
        }
        return total;
    }

    // Per defecte ('origin'), retornem directament el valor de la certificació actual
    return getCertQty(certId);
};

export const calcItemCertifiedAmount = (item, certId, priceDatabase = {}, certifications = []) => {
    const qty = calcItemCertifiedQty(item, certId, certifications);
    const unitPrice = getItemUnitPrice(item, priceDatabase);
    const total = qty * unitPrice;
    const isSimplePercent = item.unit === '%' && (!item.breakdown || item.breakdown.length === 0);
    return round2(isSimplePercent ? total / 100 : total);
};

export const calcChapterCertifiedTotal = (chapter, certId, priceDatabase = {}, certifications = []) => {
    const itemsTotal = (chapter.items || []).reduce((acc, item) => acc + calcItemCertifiedAmount(item, certId, priceDatabase, certifications), 0);
    const subChaptersTotal = (chapter.subChapters || []).reduce((acc, sub) => acc + calcChapterCertifiedTotal(sub, certId, priceDatabase, certifications), 0);
    return round2(itemsTotal + subChaptersTotal);
};

export const calcItemTotalAmount = (item, priceDatabase = {}) => {
    const qty = calcItemTotalQty(item);
    const unitPrice = getItemUnitPrice(item, priceDatabase);
    const total = qty * unitPrice;
    const isSimplePercent = item.unit === '%' && (!item.breakdown || item.breakdown.length === 0);
    return round2(isSimplePercent ? total / 100 : total);
};

export const calcChapterTotal = (chapter, priceDatabase = {}) => {
    const itemsTotal = (chapter.items || []).reduce((acc, item) => acc + calcItemTotalAmount(item, priceDatabase), 0);
    const subChaptersTotal = (chapter.subChapters || []).reduce((acc, sub) => acc + calcChapterTotal(sub, priceDatabase), 0);
    return itemsTotal + subChaptersTotal;
};

export const getPreviousCertId = (certifications, certId) => {
    if (!certifications || !certId) return null;
    const idx = certifications.findIndex(c => c.id === certId);
    if (idx <= 0) return null;
    return certifications[idx - 1].id;
};
