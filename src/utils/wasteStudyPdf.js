import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { formatNumber } from './calculations';
import { safeFileName } from './fileName';
import { nomTipus } from './waste';
import { FRACCIONS_RD105 } from './wasteStudy';

/**
 * Estudi de gestió de residus de construcció i demolició, en PDF.
 *
 * Segueix els set apartats de l'article 4.1.a) del RD 105/2008, en aquest ordre i amb aquests
 * títols, perquè és així com el revisa qui el visa:
 *
 *   1. Estimació de la quantitat, en tones i m³, codificada segons la LER.
 *   2. Mesures per a la prevenció de residus.
 *   3. Operacions de reutilització, valorització o eliminació.
 *   4. Mesures per a la separació en obra (article 5.5).
 *   5. Plànols de les instal·lacions.
 *   6. Prescripcions del plec de condicions tècniques particulars.
 *   7. Valoració del cost previst de la gestió.
 *
 * Els apartats 1, 4 i 7 surten de l'amidament; la resta són text, i el que s'hi escriu és el
 * redactat estàndard perquè l'autor el pugui ajustar al seu projecte. **No substitueix el
 * criteri de qui signa**: el document ho diu, i el peu de cada pàgina també.
 *
 * L'apartat 5 no es pot generar: els plànols són del projecte. S'hi deixa la remissió, que és
 * el que la norma demana que hi consti.
 */

const MARGIN = 16;
const RIGHT = 194;
const PEU = 282;
const FI_UTIL = 268;

const num = (v, d = 2) => formatNumber(v || 0, d);

const capcalera = (doc, { budget, dataText }) => {
    const pagina = doc.internal.getCurrentPageInfo().pageNumber;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(pagina === 1 ? 14 : 9);
    doc.text('ESTUDI DE GESTIÓ DE RESIDUS', MARGIN, pagina === 1 ? 20 : 13);

    doc.setFontSize(pagina === 1 ? 9.5 : 8);
    doc.setFont('helvetica', pagina === 1 ? 'bold' : 'normal');
    doc.text((budget.name || '').toUpperCase(), MARGIN, pagina === 1 ? 27 : 18);

    if (pagina === 1) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text('Construcció i demolició · Reial decret 105/2008, article 4.1.a)', MARGIN, 33);
        doc.text(dataText, RIGHT, 33, { align: 'right' });
    }
    doc.setLineWidth(0.4);
    doc.line(MARGIN, pagina === 1 ? 36 : 21, RIGHT, pagina === 1 ? 36 : 21);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.8);
    doc.text('Estimació calculada a partir dels amidaments del projecte. Requereix la revisió del tècnic que la signa.', MARGIN, PEU);
    doc.text(`Pàgina ${pagina}`, RIGHT, PEU, { align: 'right' });
};

/** Estat del cursor vertical amb salt de pàgina automàtic. */
const fesCursor = (doc, dibuixaCapcalera) => {
    let y = 44;
    return {
        get y() { return y; },
        set y(v) { y = v; },
        espai(alcada) {
            if (y + alcada > FI_UTIL) {
                doc.addPage();
                dibuixaCapcalera(doc);
                y = 30;
            }
        },
        titol(text) {
            this.espai(16);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10.5);
            doc.text(text, MARGIN, y);
            doc.setLineWidth(0.25);
            doc.line(MARGIN, y + 1.6, RIGHT, y + 1.6);
            y += 8;
        },
        paragraf(text, { mida = 8.5, estil = 'normal', sagnat = 0 } = {}) {
            doc.setFont('helvetica', estil);
            doc.setFontSize(mida);
            const linies = doc.splitTextToSize(text, RIGHT - MARGIN - sagnat);
            linies.forEach(linia => {
                this.espai(5);
                doc.text(linia, MARGIN + sagnat, y);
                y += mida * 0.47 + 1.1;
            });
            y += 2;
        },
        punts(items) {
            items.forEach(t => {
                this.espai(6);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8.5);
                doc.text('·', MARGIN + 2, y);
                const linies = doc.splitTextToSize(t, RIGHT - MARGIN - 8);
                linies.forEach((linia, i) => {
                    if (i > 0) this.espai(5);
                    doc.text(linia, MARGIN + 6, y);
                    y += 5;
                });
            });
            y += 2;
        },
        taula(opcions) {
            autoTable(doc, {
                startY: y,
                margin: { left: MARGIN, right: 210 - RIGHT, top: 28 },
                styles: { fontSize: 7.6, cellPadding: 1.7, lineColor: [210, 214, 220], lineWidth: 0.1 },
                headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 7.2, fontStyle: 'bold' },
                didDrawPage: () => dibuixaCapcalera(doc),
                ...opcions,
            });
            y = doc.lastAutoTable.finalY + 7;
        },
    };
};

const PREVENCIO = [
    'Es preveurà a l\'obra un espai per a l\'emmagatzematge dels materials i les eines, protegit de la intempèrie, per evitar que es facin malbé abans de posar-los en obra.',
    'Els materials es demanaran a la mida i en la quantitat estrictament necessàries, per reduir els retalls i els sobrants.',
    'Es prioritzaran els subministraments a granel o amb embalatges retornables, i es tornaran els palets i els envasos reutilitzables al proveïdor.',
    'La demolició es farà de manera selectiva, separant en origen els materials susceptibles de valorització abans de l\'enderroc general.',
    'Les terres procedents de l\'excavació que compleixin les condicions de l\'article 3 del RD 105/2008 es reutilitzaran a la mateixa obra sempre que sigui possible.',
    'S\'informarà el personal d\'obra dels punts de recollida i de la separació que cal fer, i s\'hi farà un seguiment periòdic.',
];

const PLEC = [
    'El posseïdor dels residus és el contractista, que ha de complir les obligacions de l\'article 5 del RD 105/2008 i lliurar-los a un gestor autoritzat, conservant-ne els documents acreditatius durant cinc anys.',
    'Els contenidors estaran senyalitzats amb la fracció que hi correspon i el codi LER, i romandran tapats fora de les hores de treball.',
    'Es prohibeix l\'abocament, la crema i l\'enterrament de residus a l\'obra, i el dipòsit en solars o vials no autoritzats.',
    'Els residus perillosos que apareguin —envasos contaminats, aïllaments amb amiant, fibrociment— es retiraran amb el procediment específic i per un gestor autoritzat, i mai no es barrejaran amb la resta.',
    'La direcció facultativa podrà exigir la separació addicional de qualsevol fracció quan les condicions de l\'obra ho permetin, encara que no en superi el llindar.',
    'El contractista lliurarà a la propietat, en acabar l\'obra, el certificat de gestió emès pel gestor autoritzat de cada fracció.',
];

/**
 * @param {object} params
 * @param {object} params.budget         projecte (només se'n fa servir el nom)
 * @param {object} params.summary        el que retorna `buildWasteSummary`
 * @param {object} params.study          el que retorna `buildWasteStudy`
 * @param {object} [params.dades]        { emplacament, promotor, autor }
 * @returns {jsPDF}
 */
export const buildWasteStudyPdf = ({ budget, summary, study, dades = {} }) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const dataText = new Date().toLocaleDateString('ca-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    // `didDrawPage` d'autoTable es dispara a cada taula, també quan la pàgina ja existeix, de
    // manera que sense portar el compte la capçalera i el peu es dibuixaven una vegada per
    // taula i quedaven sobreimpresos.
    const pintades = new Set();
    const dibuixa = (d) => {
        const pagina = d.internal.getCurrentPageInfo().pageNumber;
        if (pintades.has(pagina)) return;
        pintades.add(pagina);
        capcalera(d, { budget, dataText });
    };
    dibuixa(doc);
    const c = fesCursor(doc, dibuixa);

    // Dades de l'obra, si se n'han donat
    const identificacio = [
        ['Obra', budget.name || ''],
        ...(dades.emplacament ? [['Emplaçament', dades.emplacament]] : []),
        ...(dades.promotor ? [['Promotor', dades.promotor]] : []),
        ...(dades.autor ? [['Autor del projecte', dades.autor]] : []),
    ];
    c.taula({
        body: identificacio,
        theme: 'plain',
        styles: { fontSize: 8.5, cellPadding: 1.2 },
        columnStyles: { 0: { cellWidth: 42, fontStyle: 'bold', textColor: [90, 100, 115] } },
    });

    // ── 1 ────────────────────────────────────────────────────────────────────────
    c.titol('1. Estimació de la quantitat de residus');
    c.paragraf(
        'S\'estimen a continuació les quantitats de residus de construcció i demolició que es preveu '
        + 'generar a l\'obra, expressades en tones i en metres cúbics i codificades segons la Llista '
        + 'Europea de Residus (Ordre MAM/304/2002). Les xifres provenen dels amidaments del projecte i '
        + 'de les dades de residus associades a cada partida.'
    );
    c.taula({
        head: [['Codi LER', 'Descripció del residu', 'Origen', 'Tones', 'm³']],
        body: summary.perLer.map(f => [
            f.ler || '—', f.description, nomTipus(f.type),
            num(f.mass / 1000, 3), num(f.volume),
        ]),
        foot: [['', 'TOTAL', '', num(summary.totals.mass / 1000, 3), num(summary.totals.volume)]],
        columnStyles: {
            0: { cellWidth: 20, fontStyle: 'bold' },
            2: { cellWidth: 24 },
            3: { cellWidth: 22, halign: 'right' },
            4: { cellWidth: 20, halign: 'right' },
        },
        footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' },
    });
    c.paragraf(
        `L'estimació prové ${summary.ambDades === 1 ? "d'una partida" : `de ${summary.ambDades} partides`} amb dades de residus.`
        + (summary.sense > 0
            ? ` Les altres ${summary.sense} no en porten al fitxer d'origen i no s'han comptabilitzat, `
              + 'de manera que l\'estimació queda del costat de la seguretat.'
            : ''),
        { mida: 7.5, estil: 'italic' }
    );

    // ── 2 ────────────────────────────────────────────────────────────────────────
    c.titol('2. Mesures per a la prevenció de residus');
    c.punts(PREVENCIO);

    // ── 3 ────────────────────────────────────────────────────────────────────────
    c.titol('3. Operacions de reutilització, valorització o eliminació');
    c.paragraf(
        'Els residus generats es destinaran a les operacions que s\'indiquen. Els que siguin susceptibles '
        + 'de valorització es lliuraran a un gestor autoritzat per a la seva reciclatge; només es destinaran '
        + 'a dipòsit controlat els que no admetin cap altra operació.'
    );
    c.taula({
        head: [['Fracció', 'Tones', 'Operació prevista']],
        body: study.fraccions.map(f => [
            f.nom, num(f.tones, 3),
            f.id === 'formigo' || f.id === 'ceramic'
                ? 'Valorització: matxucat i reutilització com a àrid reciclat'
                : f.id === 'altres'
                    ? 'Separació en planta de tractament i valorització de les fraccions recuperables'
                    : 'Valorització per gestor autoritzat',
        ]),
        columnStyles: { 1: { cellWidth: 22, halign: 'right' }, 2: { cellWidth: 84 } },
    });

    // ── 4 ────────────────────────────────────────────────────────────────────────
    c.titol('4. Mesures per a la separació dels residus en obra');
    c.paragraf(
        'L\'article 5.5 del RD 105/2008 obliga a separar en fraccions els residus quan la quantitat '
        + 'prevista per al total de l\'obra superi els llindars següents. La comparació amb l\'estimació '
        + 'de l\'apartat 1 dona el resultat de l\'última columna.'
    );
    c.taula({
        head: [['Fracció', 'Llindar (t)', 'Estimació (t)', 'Separació obligatòria']],
        body: FRACCIONS_RD105.map(fr => {
            const f = study.fraccions.find(x => x.id === fr.id);
            return [fr.nom, num(fr.llindar, fr.llindar < 1 ? 1 : 0), f ? num(f.tones, 3) : '—', f?.calSeparar ? 'SÍ' : 'No'];
        }),
        columnStyles: {
            1: { cellWidth: 24, halign: 'right' },
            2: { cellWidth: 28, halign: 'right' },
            3: { cellWidth: 34, halign: 'center', fontStyle: 'bold' },
        },
        didParseCell: (dades) => {
            if (dades.section === 'body' && dades.column.index === 3 && dades.cell.raw === 'SÍ') {
                dades.cell.styles.textColor = [180, 30, 30];
            }
        },
    });
    c.paragraf(
        study.calSepararAlguna
            ? 'Per a les fraccions marcades amb SÍ es disposaran contenidors independents i senyalitzats a '
              + 'l\'obra, amb el codi LER visible. Quan la manca d\'espai físic no permeti la separació en '
              + 'origen, el posseïdor podrà encomanar-la a un gestor autoritzat en una instal·lació externa, '
              + 'fent-ho constar documentalment tal com preveu el mateix article 5.5.'
            : 'Cap fracció no supera el llindar, de manera que la separació en obra no és obligatòria. Es '
              + 'recomana igualment separar les fraccions valoritzables sempre que l\'espai de l\'obra ho permeti.'
    );

    // ── 5 ────────────────────────────────────────────────────────────────────────
    c.titol('5. Plànols de les instal·lacions de gestió');
    c.paragraf(
        'La ubicació dels contenidors, de la zona d\'aplec i dels accessos per a la retirada dels residus '
        + 'es grafia als plànols del projecte. Aquesta documentació gràfica és part del projecte i no es '
        + 'genera en aquest document; s\'hi ha de remetre expressament. La direcció facultativa podrà '
        + 'modificar-ne la posició durant l\'obra segons l\'evolució dels treballs, deixant-ne constància.'
    );

    // ── 6 ────────────────────────────────────────────────────────────────────────
    c.titol('6. Prescripcions del plec de condicions tècniques particulars');
    c.punts(PLEC);

    // ── 7 ────────────────────────────────────────────────────────────────────────
    c.titol('7. Valoració del cost previst de la gestió');
    if (study.valorada) {
        c.paragraf(
            'La valoració següent s\'obté aplicant a l\'estimació de l\'apartat 1 les tarifes de gestió '
            + 'introduïdes per l\'autor del projecte. Aquest import ha de figurar al pressupost del projecte '
            + 'en capítol independent, tal com estableix l\'article 4.1.a).7 del RD 105/2008.'
        );
        c.taula({
            head: [['Fracció', 'Tones', 'Tarifa (€/t)', 'Import (€)']],
            body: study.fraccions.map(f => [f.nom, num(f.tones, 3), num(f.tarifa), num(f.cost)]),
            foot: [['TOTAL', num(study.totals.tones, 3), '', num(study.totals.cost)]],
            columnStyles: {
                1: { cellWidth: 24, halign: 'right' },
                2: { cellWidth: 26, halign: 'right' },
                3: { cellWidth: 30, halign: 'right' },
            },
            footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' },
        });
    } else {
        c.paragraf(
            'No s\'han introduït les tarifes de gestió, de manera que aquest apartat queda pendent de '
            + 'completar. L\'article 4.1.a).7 del RD 105/2008 exigeix que el cost previst de la gestió '
            + 'figuri al pressupost del projecte en capítol independent: cal introduir les tarifes del '
            + 'gestor autoritzat i tornar a generar el document.',
            { estil: 'italic' }
        );
    }

    // Signatura
    c.espai(30);
    c.y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`${dades.lloc || ''}${dades.lloc ? ', ' : ''}${dataText}`, MARGIN, c.y);
    c.y += 20;
    doc.setLineWidth(0.3);
    doc.line(MARGIN, c.y, MARGIN + 62, c.y);
    doc.setFontSize(7.5);
    doc.text(dades.autor || 'L\'autor del projecte', MARGIN, c.y + 4);

    return doc;
};

export const exportWasteStudyPDF = (params) => {
    const doc = buildWasteStudyPdf(params);
    doc.save(`${safeFileName(`Estudi de residus ${params.budget?.name || ''}`, 'estudi-residus')}.pdf`);
};
