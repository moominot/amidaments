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
;;;
;;; Es crea una línia d'amidament per entitat. Què s'agafa de cada una ho decideix
;;; l'aplicació segons la unitat de la partida:
;;;   m2  tancada -> àrea  | oberta -> llargada, i avisa que falta l'alçada
;;;   m   llargada (si és tancada, el perímetre)
;;;   ud  una unitat per entitat, sigui del tipus que sigui
;;;
;;; Entitats amb llargada: LINE, ARC, CIRCLE, ELLIPSE, SPLINE, LWPOLYLINE, POLYLINE.
;;; Amb àrea: les anteriors si són tancades, HATCH i REGION.
;;; La resta (blocs, textos, punts...) només compten per a les partides en ud.
;;;
;;; Una polilínia oberta amb el darrer vèrtex damunt del primer es compta tancada.
;;;
;;; Format del porta-retalls (tabulat): una capçalera
;;;   AMIDAMENTS-CAD <tab> 1 <tab> <dibuix>
;;; i una fila per entitat
;;;   tipus <tab> tancada(0|1) <tab> llargada <tab> àrea <tab> capa <tab> bloc <tab> handle
;;; amb les xifres ja en metres i en m2.
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

;; Llista (tipus tancada llargada àrea capa bloc handle) d'una entitat, en unitats del dibuix.
(defun amid:dades (ent / obj typ closed len area nom p0 p1)
  (setq obj    (vlax-ename->vla-object ent)
        typ    (cdr (assoc 0 (entget ent)))
        closed nil
        len    0.0
        area   0.0
        nom    "")
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
         (if (null area) (setq area 0.0)))))
    ((= typ "HATCH")
     (setq closed T
           area (amid:prova 'vla-get-Area (list obj)))
     (if (null area) (setq area 0.0)))
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
        (cdr (assoc 5 (entget ent)))))

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

(defun c:AMIDA ( / kw fac f2 ss i d txt n nt nl na res)
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
      (setq txt (strcat "AMIDAMENTS-CAD" *amid:tab* "1" *amid:tab* (getvar "DWGNAME"))
            i   0
            n   (sslength ss)
            nt  0
            nl  0
            na  0)
      (while (< i n)
        (setq d (amid:dades (ssname ss i)))
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
                          (nth 6 d)))
        (setq i (1+ i)))
      (setq res (amid:porta-retalls txt))
      (princ (strcat "\n" (itoa n) " entitats: " (itoa nt) " tancades, "
                     (itoa nl) " amb llargada, " (itoa na) " amb area."))
      (cond
        ((= res T)
         (princ "\nCopiat al porta-retalls. Selecciona la partida a l'aplicacio i fes Ctrl+V."))
        (res
         (princ (strcat "\nCopiat amb PowerShell. Si no arriba, el text es a " res)))
        (T
         (princ "\nNo s'ha pogut copiar al porta-retalls."))))
    (princ "\nCap entitat seleccionada."))
  (princ))

(princ "\nPreuArq BIM: escriu AMIDA per exportar entitats a les linies d'amidament.")
(princ)
