import { calcChapterTotal, calcItemTotalAmount } from './calculations';

// Amb «amagar import 0», ni les partides ni els capítols amb import 0 surten a la impressió.
// Tots els camins (previsualització, PDF d'amidaments i de resum) han de passar per aquí.
export const ambImport = (nodes, config, priceDatabase) => (config.hideZeroItems
    ? nodes.filter(n => (n.unit ? calcItemTotalAmount(n, priceDatabase) : calcChapterTotal(n, priceDatabase)) !== 0)
    : nodes);

/**
 * Recorre l'arbre de pressupost exactament igual per a totes les sortides d'impressió
 * (previsualització HTML i PDF d'amidaments): aplica `ambImport`, decideix amb
 * `config.maxLevels` quins capítols mostren capçalera pròpia i porta la numeració
 * correlativa (`currentRef`/`counterObj`). Abans cada sortida reimplementava aquesta lògica
 * pel seu compte i van acabar divergint dues vegades (veure `docs/estat-actual.md` § 32):
 * una amb les columnes desplaçades, l'altra perdent el subarbre sencer d'un capítol aplanat.
 * Qualsevol sortida nova hi ha de cridar a sobre en lloc de tornar-la a escriure.
 *
 * Quan un capítol supera `maxLevels` i no mostra capçalera pròpia, els seus fills es
 * continuen recorrent (mai es perden), però al mateix nivell i amb el mateix comptador, en
 * lloc d'obrir-ne un de nou — així és com s'«aplana».
 *
 * `onChapterHeader`/`onChapterFooter` només es criden quan el capítol mostra capçalera;
 * `onItem` es crida sempre per a una partida (una partida sempre en mostra una).
 */
export const walkPrintTree = (
    nodes,
    config,
    priceDatabase,
    { onChapterHeader, onChapterFooter, onItem },
    level = 0,
    parentRef = '',
    counterObj = { val: 0 }
) => {
    ambImport(nodes, config, priceDatabase).forEach((node) => {
        const isChapter = !node.unit;
        const shouldShowHeader = !isChapter || (level < config.maxLevels);

        let displayCode = node.code;
        let currentRef = parentRef;

        if (shouldShowHeader) {
            counterObj.val++;
            currentRef = parentRef ? `${parentRef}.${counterObj.val}` : `${counterObj.val}`;
            displayCode = config.useCorrelativeCodes ? currentRef : node.code;
        }

        const totalAmount = isChapter ? calcChapterTotal(node, priceDatabase) : calcItemTotalAmount(node, priceDatabase);
        const ctx = { node, level, displayCode, totalAmount };

        if (shouldShowHeader && isChapter && onChapterHeader) onChapterHeader(ctx);
        if (shouldShowHeader && !isChapter && onItem) onItem(ctx);

        const children = [...(node.subChapters || []), ...(node.items || [])];
        if (children.length > 0) {
            walkPrintTree(
                children,
                config,
                priceDatabase,
                { onChapterHeader, onChapterFooter, onItem },
                isChapter ? (shouldShowHeader ? level + 1 : level) : level + 1,
                currentRef,
                isChapter && shouldShowHeader ? { val: 0 } : counterObj
            );
        }

        if (isChapter && shouldShowHeader && onChapterFooter) onChapterFooter(ctx);
    });
};
