import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { formatNumber } from './calculations';
import { numberToTextCatalan } from './numberToText';
import { safeFileName } from './fileName';

/**
 * Certificació d'obra en PDF.
 *
 * Estructura del document:
 *   1. Resum per capítols (pressupost, anterior, període, origen, %, pendent).
 *   2. Quadre de liquidació del període, amb G.G., B.I. i IVA si estan activats.
 *   3. Import a certificar en lletres.
 *   4. Signatures.
 *   5. Detall per partides, opcional, a partir de pàgina nova.
 *
 * Els percentatges s'apliquen sobre l'import DEL PERÍODE, que és el que es factura.
 * Com que són lineals, és equivalent a restar les cascades a origen i anterior.
 */

const MARGIN = 14;
const RIGHT = 196;
const BOTTOM = 280;

const num = (v) => formatNumber(v || 0, 2);

/** Capçalera repetida a cada pàgina. */
const drawHeader = (doc, { budget, cert, certIndex, dateStr }) => {
    const page = doc.internal.getNumberOfPages();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(page === 1 ? 15 : 10);
    doc.text(`CERTIFICACIÓ D'OBRA Núm. ${certIndex}`, MARGIN, page === 1 ? 18 : 14);

    doc.setFontSize(page === 1 ? 10 : 8);
    doc.text((budget.name || '').toUpperCase(), MARGIN, page === 1 ? 25 : 19);

    if (page === 1) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        const method = cert?.method === 'partial' ? 'Parcial (per períodes)' : 'A origen (acumulat)';
        doc.text(`${cert?.name || ''}  ·  Mesurament: ${method}`, MARGIN, 31);
        doc.text(`Data: ${dateStr}`, RIGHT, 31, { align: 'right' });
    }

    doc.setLineWidth(0.5);
    doc.line(MARGIN, page === 1 ? 34 : 22, RIGHT, page === 1 ? 34 : 22);

    // Peu
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.text(dateStr, MARGIN, 287);
    doc.text(`Pàgina ${page}`, RIGHT, 287, { align: 'right' });
};

/** Línia del quadre de liquidació: etiqueta a l'esquerra, import a la dreta. */
const drawTotalLine = (doc, label, value, y, { bold = false, rule = true, size = 9 } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.text(label, 148, y, { align: 'right' });
    doc.text(num(value), RIGHT, y, { align: 'right' });
    if (rule) {
        doc.setLineWidth(bold ? 0.4 : 0.15);
        doc.line(152, y + 1.2, RIGHT, y + 1.2);
    }
};

export const buildCertificationPdf = ({
    budget,
    summary,
    detail = [],
    cert,
    certIndex = 1,
    config = {},
    date = new Date(),
}) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const dateStr = date.toLocaleDateString('ca-ES');
    const { totals } = summary;
    const ge = config.ge || { enabled: false, percentage: 0 };
    const ip = config.ip || { enabled: false, percentage: 0 };
    const iva = config.iva || { enabled: false, percentage: 0 };

    // ── 1. Resum per capítols ────────────────────────────────────────────────
    autoTable(doc, {
        head: [[
            'Capítol',
            'Descripció',
            { content: 'Pressupost', styles: { halign: 'right' } },
            { content: 'Anterior', styles: { halign: 'right' } },
            { content: 'Període', styles: { halign: 'right' } },
            { content: 'Origen', styles: { halign: 'right' } },
            { content: '%', styles: { halign: 'right' } },
            { content: 'Pendent', styles: { halign: 'right' } },
        ]],
        body: summary.rows.map(r => [
            r.code,
            (r.description || '').toUpperCase(),
            num(r.budget),
            r.previous ? num(r.previous) : '—',
            r.period ? num(r.period) : '—',
            num(r.origin),
            formatNumber(r.originPct, 1),
            num(r.pending),
        ]),
        foot: [[
            { content: 'TOTAL CERTIFICACIÓ', colSpan: 2, styles: { halign: 'right' } },
            num(totals.budget),
            num(totals.previous),
            num(totals.period),
            num(totals.origin),
            formatNumber(totals.originPct, 1),
            num(totals.pending),
        ]],
        startY: 40,
        margin: { top: 28, left: MARGIN, right: 14 },
        theme: 'plain',
        styles: { fontSize: 8, cellPadding: 1.4, font: 'helvetica', overflow: 'linebreak' },
        headStyles: {
            fontStyle: 'bold', fontSize: 7.5, textColor: [0, 0, 0],
            lineWidth: { bottom: 0.5 }, lineColor: [0, 0, 0],
        },
        footStyles: {
            fontStyle: 'bold', fontSize: 8.5, textColor: [0, 0, 0], fillColor: [240, 240, 240],
            lineWidth: { top: 0.5 }, lineColor: [0, 0, 0],
        },
        columnStyles: {
            0: { cellWidth: 16 },
            1: { cellWidth: 'auto' },
            2: { cellWidth: 23, halign: 'right' },
            3: { cellWidth: 22, halign: 'right' },
            4: { cellWidth: 22, halign: 'right' },
            5: { cellWidth: 23, halign: 'right' },
            6: { cellWidth: 12, halign: 'right' },
            7: { cellWidth: 22, halign: 'right' },
        },
        didDrawPage: () => drawHeader(doc, { budget, cert, certIndex, dateStr }),
    });

    // ── 2. Quadre de liquidació del període ──────────────────────────────────
    const periodBase = totals.period;
    const GE = ge.enabled ? periodBase * (ge.percentage / 100) : 0;
    const IP = ip.enabled ? periodBase * (ip.percentage / 100) : 0;
    const pec = periodBase + GE + IP;
    const VAT = iva.enabled ? pec * (iva.percentage / 100) : 0;
    const totalACertificar = pec + VAT;

    // Alçada que necessita el bloc: liquidació + text en lletres + signatures.
    const linies = 3 + (ge.enabled ? 1 : 0) + (ip.enabled ? 1 : 0)
        + (ge.enabled || ip.enabled ? 1 : 0) + (iva.enabled ? 1 : 0) + 1;
    const alturaBloc = linies * 7 + 60;

    let y = doc.lastAutoTable.finalY + 12;
    if (y + alturaBloc > BOTTOM) {
        doc.addPage();
        drawHeader(doc, { budget, cert, certIndex, dateStr });
        y = 32;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text('LIQUIDACIÓ DE LA CERTIFICACIÓ', MARGIN, y);
    y += 7;

    drawTotalLine(doc, "Certificat a origen (P.E.M.)", totals.origin, y);
    y += 7;
    drawTotalLine(doc, 'Certificat anterior a origen (P.E.M.)', totals.previous, y);
    y += 7;
    drawTotalLine(doc, "IMPORT D'AQUESTA CERTIFICACIÓ (P.E.M.)", periodBase, y, { bold: true });
    y += 8;

    if (ge.enabled) {
        drawTotalLine(doc, `${formatNumber(ge.percentage, 2)} % Despeses Generals`, GE, y);
        y += 7;
    }
    if (ip.enabled) {
        drawTotalLine(doc, `${formatNumber(ip.percentage, 2)} % Benefici Industrial`, IP, y);
        y += 7;
    }
    if (ge.enabled || ip.enabled) {
        drawTotalLine(doc, 'Pressupost d\'Execució per Contracta (P.E.C.)', pec, y, { bold: true });
        y += 7;
    }
    if (iva.enabled) {
        drawTotalLine(doc, `${formatNumber(iva.percentage, 2)} % I.V.A.`, VAT, y);
        y += 7;
    }

    y += 2;
    drawTotalLine(doc, 'TOTAL A CERTIFICAR', totalACertificar, y, { bold: true, size: 11 });
    y += 12;

    // ── 3. Import en lletres ─────────────────────────────────────────────────
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const verbal = `Import d'aquesta certificació: ${numberToTextCatalan(totalACertificar)}.`;
    const linesVerbal = doc.splitTextToSize(verbal, RIGHT - MARGIN);
    doc.text(linesVerbal, MARGIN, y);
    y += linesVerbal.length * 5 + 10;

    // ── 4. Signatures ────────────────────────────────────────────────────────
    if (y + 34 > BOTTOM) {
        doc.addPage();
        drawHeader(doc, { budget, cert, certIndex, dateStr });
        y = 40;
    }
    doc.setFontSize(8);
    doc.text(`A ${dateStr}`, MARGIN, y);
    y += 26;

    const cols = [
        { label: 'LA PROPIETAT', x: 42 },
        { label: 'LA DIRECCIÓ FACULTATIVA', x: 105 },
        { label: "L'EMPRESA CONSTRUCTORA", x: 168 },
    ];
    doc.setLineWidth(0.2);
    cols.forEach(c => {
        doc.line(c.x - 26, y, c.x + 26, y);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text(c.label, c.x, y + 4, { align: 'center' });
    });

    // ── 5. Detall per partides (opcional) ────────────────────────────────────
    if (config.showItemDetail && detail.length > 0) {
        doc.addPage();

        autoTable(doc, {
            head: [[
                'Codi',
                'Descripció',
                { content: 'Ud', styles: { halign: 'center' } },
                { content: 'Previst', styles: { halign: 'right' } },
                { content: 'Anterior', styles: { halign: 'right' } },
                { content: 'Període', styles: { halign: 'right' } },
                { content: 'Origen', styles: { halign: 'right' } },
                { content: '%', styles: { halign: 'right' } },
                { content: 'Import', styles: { halign: 'right' } },
            ]],
            body: detail.map(r => r.isChapter
                ? [
                    r.code,
                    { content: (r.description || '').toUpperCase(), colSpan: 6 },
                    formatNumber(r.originPct, 1),
                    num(r.originAmount),
                ]
                : [
                    r.code,
                    r.description,
                    r.unit || '',
                    formatNumber(r.budgetQty, 2),
                    r.previousQty ? formatNumber(r.previousQty, 2) : '—',
                    r.periodQty ? formatNumber(r.periodQty, 2) : '—',
                    formatNumber(r.originQty, 2),
                    formatNumber(r.originPct, 1),
                    num(r.originAmount),
                ]),
            startY: 28,
            margin: { top: 28, left: MARGIN, right: 14 },
            theme: 'plain',
            styles: { fontSize: 7, cellPadding: 1.1, font: 'helvetica', overflow: 'linebreak', valign: 'top' },
            headStyles: {
                fontStyle: 'bold', fontSize: 6.5, textColor: [0, 0, 0],
                lineWidth: { bottom: 0.5 }, lineColor: [0, 0, 0],
            },
            columnStyles: {
                0: { cellWidth: 20 },
                1: { cellWidth: 'auto' },
                2: { cellWidth: 8, halign: 'center' },
                3: { cellWidth: 17, halign: 'right' },
                4: { cellWidth: 17, halign: 'right' },
                5: { cellWidth: 17, halign: 'right' },
                6: { cellWidth: 17, halign: 'right' },
                7: { cellWidth: 11, halign: 'right' },
                8: { cellWidth: 21, halign: 'right' },
            },
            didParseCell: (data) => {
                const row = detail[data.row.index];
                if (row?.isChapter && data.section === 'body') {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fillColor = [242, 242, 242];
                }
            },
            didDrawPage: () => {
                drawHeader(doc, { budget, cert, certIndex, dateStr });
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.text('DETALL PER PARTIDES', MARGIN, 27);
            },
        });
    }

    return doc;
};

/** Genera i descarrega la certificació. */
export const exportCertificationPDF = (params) => {
    const doc = buildCertificationPdf(params);
    doc.save(`${safeFileName(params.budget?.name, 'projecte')} - ${safeFileName(params.cert?.name, 'certificacio')}.pdf`);
};
