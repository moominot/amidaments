;;; ============================================================================
;;; amidaments.lsp - Exporta entitats d'AutoCAD per enganxar-les a PreuArq BIM
;;; ============================================================================
;;;
;;; Ús:
;;;   1. APPLOAD i carrega aquest fitxer (o afegeix-lo al «Conjunt de càrrega»).
;;;   2. Escriu AMIDA, tria les unitats del dibuix i selecciona les entitats.
;;;      (Les cadenes que surten per pantalla van sense accents a posta: les
;;;      versions antigues d'AutoCAD llegeixen els .lsp en ANSI.)
;;;   3. A l'aplicació, selecciona la partida i fes Ctrl+V (o «Enganxa CAD»).
;;;      Sense cap partida seleccionada, l'aplicació proposa inserir un sistema
;;;      constructiu per a cada zona (sala): les entitats es poden agrupar pel
;;;      rètol que tenen a dins, per capa, o una zona per entitat.
;;;
;;; Es crea una línia d'amidament per entitat. Què s'agafa de cada una ho decideix
;;; l'aplicació segons la unitat de la partida:
;;;   m2  tancada -> àrea  | oberta -> llargada, i avisa que falta l'alçada
;;;   m   llargada (si és tancada, el perímetre)
;;;   ud  una unitat per entitat, sigui del tipus que sigui
;;;
;;; Entitats amb llargada: LINE, ARC, CIRCLE, ELLIPSE, SPLINE, LWPOLYLINE, POLYLINE.
;;; Amb àrea: les anteriors si són tancades, HATCH i REGION.
;;;
;;; Trames (HATCH): l'àrea és la neta, amb les illes (pilars, patis) ja descomptades,
;;; i la llargada és el perímetre de tots els contorns (l'exterior i els de les
;;; illes), llegit de les dades de la trama: no cal que sigui associativa. Les vores
;;; de tipus el·lipse o spline, rares en una trama de paviment, no s'hi sumen.
;;;
;;; Rètols: de cada entitat tancada (i de cada trama) s'envien els textos (TEXT i
;;; MTEXT) que tenen el punt d'inserció a dins, separats per " | ". L'aplicació en
;;; treu el nom de la sala. Es busquen a tot l'espai actual, no només a la vista.
;;; La resta (blocs, textos, punts...) només compten per a les partides en ud.
;;;
;;; Una polilínia oberta amb el darrer vèrtex damunt del primer es compta tancada.
;;;
;;; Format del porta-retalls (tabulat): una capçalera
;;;   AMIDAMENTS-CAD <tab> 2 <tab> <dibuix>
;;; i una fila per entitat
;;;   tipus <tab> tancada(0|1) <tab> llargada <tab> àrea <tab> capa <tab> bloc <tab> handle <tab> rètols
;;; amb les xifres ja en metres i en m2. (La versió 1 no tenia la columna de rètols.)
;;; ============================================================================

(vl-load-com)

(setq *amid:tab* (chr 9))

;; Unitats del dibuix -> metres. Es recorda la darrera resposta dins la sessió.
(defun amid:unitats-defecte ( / ins)
  (if *amid:unitats*
    *amid:unitats*
    (progn
      (setq ins (getvar "INSUNITS"))
      (cond ((= ins 4) "MIlimetres")
            ((= ins 5) "Centimetres")
            ((= ins 14) "Decimetres")
            (T "Metres")))))

(defun amid:factor (kw)
  (cond ((= kw "MIlimetres") 0.001)
        ((= kw "Centimetres") 0.01)
        ((= kw "Decimetres") 0.1)
        (T 1.0)))

(defun amid:num (x)
  (rtos x 2 4))

;; Retorna el valor d'una crida VLA, o nil si falla (propietat inexistent, etc.).
(defun amid:prova (fn args / r)
  (setq r (vl-catch-all-apply fn args))
  (if (vl-catch-all-error-p r) nil r))

(defun amid:es-corba (typ)
  (member typ '("LINE" "ARC" "CIRCLE" "ELLIPSE" "SPLINE" "LWPOLYLINE" "POLYLINE")))

;; --- Rètols de dins de cada contorn ---------------------------------------------

;; Text net per a una cel·la: sense tabuladors ni salts de línia.
(defun amid:net (s)
  (vl-string-translate (strcat (chr 9) (chr 13) (chr 10)) "   " s))

;; Uneix una llista de textos amb un separador.
(defun amid:uneix (lst sep / r)
  (setq r "")
  (foreach x lst
    (setq r (if (= r "") x (strcat r sep x))))
  r)

;; Tots els textos de l'espai actual: llista de (punt . text). Amb ssget "_X" i no
;; amb una finestra, que només troba el que es veu a la pantalla.
(defun amid:textos ( / ss i e ed txt lst)
  (if (setq ss (ssget "_X" (list '(0 . "TEXT,MTEXT") (cons 410 (getvar "CTAB")))))
    (progn
      (setq i 0)
      (while (< i (sslength ss))
        (setq e   (ssname ss i)
              ed  (entget e)
              txt (if (= (cdr (assoc 0 ed)) "MTEXT")
                    (amid:prova 'vla-get-TextString (list (vlax-ename->vla-object e)))
                    (cdr (assoc 1 ed))))
        (if (and txt (/= txt ""))
          (setq lst (cons (cons (cdr (assoc 10 ed)) (amid:net txt)) lst)))
        (setq i (1+ i)))))
  lst)

;; Si el punt és dins del polígon (llista de punts), pel mètode del raig.
(defun amid:dins (pt pol / x y n i j xi yi xj yj dins)
  (setq x (car pt) y (cadr pt) n (length pol) i 0 j (1- n) dins nil)
  (while (< i n)
    (setq xi (car (nth i pol)) yi (cadr (nth i pol))
          xj (car (nth j pol)) yj (cadr (nth j pol)))
    (if (and (/= (> yi y) (> yj y))
             (< x (+ xi (/ (* (- xj xi) (- y yi)) (- yj yi)))))
      (setq dins (not dins)))
    (setq j i i (1+ i)))
  dins)

;; Els textos que cauen dins del polígon, units amb " | ". Abans de la prova del
;; raig, es descarten els que són fora de la caixa del polígon: en un plànol amb
;; milers de textos, és el que la fa ràpida.
(defun amid:retols (pol textos / r x0 x1 y0 y1 pt)
  (if (> (length pol) 2)
    (progn
      (setq x0 (apply 'min (mapcar 'car pol))
            x1 (apply 'max (mapcar 'car pol))
            y0 (apply 'min (mapcar 'cadr pol))
            y1 (apply 'max (mapcar 'cadr pol)))
      (foreach tx textos
        (setq pt (car tx))
        (if (and (<= x0 (car pt) x1) (<= y0 (cadr pt) y1) (amid:dins pt pol))
          (setq r (cons (cdr tx) r))))))
  (amid:uneix (reverse r) " | "))

;; Polígon que segueix una corba tancada: punts per paràmetre. A les polilínies, els
;; vèrtexs cauen en paràmetres enters i se'n prenen 16 per tram; a la resta, 64.
(defun amid:poligon-corba (ent typ / p0 p1 m k p pts)
  (setq p0 (vlax-curve-getStartParam ent)
        p1 (vlax-curve-getEndParam ent)
        m  (if (member typ '("LWPOLYLINE" "POLYLINE"))
             (* 16 (max 1 (fix (+ (- p1 p0) 0.5))))
             64)
        k  0)
  (while (< k m)
    (setq p (amid:prova 'vlax-curve-getPointAtParam
                        (list ent (+ p0 (* (- p1 p0) (/ (float k) m))))))
    (if p (setq pts (cons p pts)))
    (setq k (1+ k)))
  (reverse pts))

;; --- Contorns d'una trama ------------------------------------------------------

;; Llargada d'un tram de polilínia amb curvatura (bulge).
(defun amid:tram (p q b / d th)
  (setq d (distance p q))
  (if (or (null b) (equal b 0.0 1e-12))
    d
    (progn
      (setq th (* 4.0 (atan (abs b))))
      (/ (* d th) (* 2.0 (sin (/ th 2.0)))))))

;; Perímetre i polígon exterior d'una trama, a partir de les seves dades DXF:
;; (perimetre punts-exteriors). Cada contorn comença amb el codi 92; si en té el
;; bit 2 és una polilínia (vèrtexs 10 i, si n'hi ha, curvatures 42), si no és una
;; llista de vores (72: 1 recta, 2 arc, 3 el·lipse, 4 spline).
(defun amid:contorns-trama (ent / ed l ncam c flag ambb nv vs v b i per pts ext exterior
                                 nv2 tipus p q r a0 a1 sw k para)
  (setq ed   (entget ent)
        l    (cdr (member (assoc 91 ed) ed))
        ncam (cdr (assoc 91 ed))
        per  0.0
        c    0
        para nil)
  (if (null ncam) (setq ncam 0))
  (while (and (< c ncam) (not para) (setq l (member (assoc 92 l) l)))
    (setq flag     (cdar l)
          l        (cdr l)
          pts      nil
          exterior (= 1 (logand flag 1)))
    (if (= 2 (logand flag 2))
      ;; Contorn polilínia.
      (progn
        (setq ambb (= 1 (cdr (assoc 72 l)))
              nv   (cdr (assoc 93 l))
              l    (cdr (member (assoc 93 l) l))
              vs   nil
              i    0)
        (while (and nv (< i nv) (setq l (member (assoc 10 l) l)))
          (setq v (cdar l) l (cdr l) b 0.0)
          (if (and ambb (= 42 (caar l))) (setq b (cdar l) l (cdr l)))
          (setq vs (cons (list v b) vs) i (1+ i)))
        (setq vs (reverse vs) i 0)
        (while (< i (length vs))
          (setq v (nth i vs)
                q (car (nth (rem (1+ i) (length vs)) vs)))
          (setq per (+ per (amid:tram (car v) q (cadr v)))
                pts (cons (car v) pts)
                i   (1+ i))))
      ;; Contorn de vores.
      (progn
        (setq nv2 (cdr (assoc 93 l))
              l   (cdr (member (assoc 93 l) l))
              i   0)
        (while (and nv2 (< i nv2) (not para) (setq l (member (assoc 72 l) l)))
          (setq tipus (cdar l) l (cdr l))
          (cond
            ((= tipus 1)
             (setq p (cdr (assoc 10 l)) q (cdr (assoc 11 l)))
             (setq per (+ per (distance p q)) pts (cons p pts)
                   l   (cdr (member (assoc 11 l) l))))
            ((= tipus 2)
             (setq p  (cdr (assoc 10 l)) r (cdr (assoc 40 l))
                   a0 (cdr (assoc 50 l)) a1 (cdr (assoc 51 l))
                   sw (- a1 a0))
             (if (<= sw 0.0) (setq sw (+ sw 360.0)))
             (setq per (+ per (* r sw (/ pi 180.0))) k 0)
             (while (< k 8)
               (setq pts (cons (polar p (* (+ a0 (* sw (/ k 8.0))) (/ pi 180.0)) r) pts)
                     k   (1+ k)))
             (setq l (cdr (member (assoc 73 l) l))))
            ((= tipus 3)
             (setq pts (cons (cdr (assoc 10 l)) pts)
                   l   (cdr (member (assoc 73 l) l))))
            (T
             ;; Spline: no es pot saltar amb seguretat; es deixa de llegir aquí.
             (setq para T)))
          (setq i (1+ i)))))
    (if (and pts (or exterior (null ext))) (setq ext (reverse pts)))
    (setq c (1+ c)))
  (list per ext))

;; Llista (tipus tancada llargada àrea capa bloc handle rètols) d'una entitat, en
;; unitats del dibuix. `textos` és la llista de amid:textos.
(defun amid:dades (ent textos / obj typ closed len area nom p0 p1 retols ct)
  (setq obj    (vlax-ename->vla-object ent)
        typ    (cdr (assoc 0 (entget ent)))
        closed nil
        len    0.0
        area   0.0
        nom    ""
        retols "")
  (cond
    ((amid:es-corba typ)
     (setq len (amid:prova 'vlax-curve-getDistAtParam
                           (list ent (vlax-curve-getEndParam ent))))
     (if (null len) (setq len 0.0))
     (setq p0 (vlax-curve-getStartPoint ent)
           p1 (vlax-curve-getEndPoint ent))
     (setq closed (or (vlax-curve-isClosed ent)
                      (and (/= typ "LINE") p0 p1 (equal p0 p1 1e-6))))
     (if closed
       (progn
         (setq area (amid:prova 'vlax-curve-getArea (list ent)))
         (if (null area) (setq area 0.0))
         (if textos
           (setq retols (amid:retols (amid:poligon-corba ent typ) textos))))))
    ((= typ "HATCH")
     ;; L'àrea de la trama ja és la neta, sense les illes.
     (setq closed T
           area (amid:prova 'vla-get-Area (list obj)))
     (if (null area) (setq area 0.0))
     (setq ct (vl-catch-all-apply 'amid:contorns-trama (list ent)))
     (if (not (vl-catch-all-error-p ct))
       (progn
         (setq len (car ct))
         (if (and textos (cadr ct))
           (setq retols (amid:retols (cadr ct) textos))))))
    ((= typ "REGION")
     (setq closed T
           area (amid:prova 'vla-get-Area (list obj))
           len  (amid:prova 'vla-get-Perimeter (list obj)))
     (if (null area) (setq area 0.0))
     (if (null len) (setq len 0.0)))
    ((= typ "INSERT")
     (setq nom (amid:prova 'vla-get-EffectiveName (list obj)))
     (if (null nom) (setq nom (cdr (assoc 2 (entget ent)))))))
  (list typ closed len (abs area)
        (cdr (assoc 8 (entget ent)))
        nom
        (cdr (assoc 5 (entget ent)))
        retols))

;; Posa el text al porta-retalls. Primer amb l'objecte htmlfile i, si no hi és,
;; amb PowerShell a partir d'un fitxer temporal.
(defun amid:porta-retalls (txt / html r fitxer f)
  (setq r (vl-catch-all-apply
            '(lambda ()
               (setq html (vlax-create-object "htmlfile"))
               (vlax-invoke (vlax-get (vlax-get html 'ParentWindow) 'ClipboardData)
                            'setData "Text" txt))))
  (if html (vl-catch-all-apply 'vlax-release-object (list html)))
  (if (or (vl-catch-all-error-p r) (= r :vlax-false))
    (progn
      (setq fitxer (vl-filename-mktemp "amid" nil ".txt")
            f      (open fitxer "w"))
      (if f
        (progn
          (princ txt f)
          (close f)
          (startapp "powershell.exe"
                    (strcat "-NoProfile -WindowStyle Hidden -Command \"Get-Content -Raw -LiteralPath '"
                            fitxer "' | Set-Clipboard\""))
          fitxer)
        nil))
    T))

(defun c:AMIDA ( / kw fac f2 ss i d txt n nt nl na nr res textos)
  (initget "MIlimetres Centimetres Decimetres Metres")
  (setq kw (getkword (strcat "\nUnitats del dibuix [MIlimetres/Centimetres/Decimetres/Metres] <"
                             (amid:unitats-defecte) ">: ")))
  (if (null kw) (setq kw (amid:unitats-defecte)))
  (setq *amid:unitats* kw
        fac (amid:factor kw)
        f2  (* fac fac))

  (princ "\nSelecciona les entitats a amidar: ")
  (if (setq ss (ssget))
    (progn
      (setq txt    (strcat "AMIDAMENTS-CAD" *amid:tab* "2" *amid:tab* (getvar "DWGNAME"))
            i      0
            n      (sslength ss)
            nt     0
            nl     0
            na     0
            nr     0
            textos (amid:textos))
      (while (< i n)
        (setq d (amid:dades (ssname ss i) textos))
        (if (/= (nth 7 d) "") (setq nr (1+ nr)))
        (if (nth 1 d) (setq nt (1+ nt)))
        (if (> (nth 2 d) 0) (setq nl (1+ nl)))
        (if (> (nth 3 d) 0) (setq na (1+ na)))
        (setq txt (strcat txt "\r\n"
                          (nth 0 d) *amid:tab*
                          (if (nth 1 d) "1" "0") *amid:tab*
                          (amid:num (* (nth 2 d) fac)) *amid:tab*
                          (amid:num (* (nth 3 d) f2)) *amid:tab*
                          (nth 4 d) *amid:tab*
                          (nth 5 d) *amid:tab*
                          (nth 6 d) *amid:tab*
                          (nth 7 d)))
        (setq i (1+ i)))
      (setq res (amid:porta-retalls txt))
      (princ (strcat "\n" (itoa n) " entitats: " (itoa nt) " tancades, "
                     (itoa nl) " amb llargada, " (itoa na) " amb area, "
                     (itoa nr) " amb retol a dins."))
      (cond
        ((= res T)
         (princ "\nCopiat al porta-retalls. A l'aplicacio, selecciona la partida i fes Ctrl+V; sense partida, et proposara un sistema per zones."))
        (res
         (princ (strcat "\nCopiat amb PowerShell. Si no arriba, el text es a " res)))
        (T
         (princ "\nNo s'ha pogut copiar al porta-retalls."))))
    (princ "\nCap entitat seleccionada."))
  (princ))

(princ "\nPreuArq BIM: escriu AMIDA per exportar entitats a les linies d'amidament.")
(princ)
