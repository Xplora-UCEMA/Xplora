import { useCallback, useEffect, useId, useRef, useState } from 'react';

export type RecapMedia = {
  id: string;
  kind: 'image' | 'video';
  src: string;
  poster?: string;
  alt: string;
  caption?: string;
  credit?: string;
};

export type RecapMediaDialogProps = {
  media: RecapMedia | null;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
};

function DialogIcon({ direction }: { direction: 'left' | 'right' | 'close' }) {
  const path = direction === 'close' ? 'm6 6 12 12M18 6 6 18' : direction === 'left' ? 'M19 12H5m7-7-7 7 7 7' : 'M5 12h14m-7-7 7 7-7 7';
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={path} />
    </svg>
  );
}

/** Native modal: the browser owns focus trapping and makes the page behind it inert. */
export function RecapMediaDialog({ media, onClose, onNext, onPrevious }: RecapMediaDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const unlockScrollRef = useRef<(() => void) | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCloseRef = useRef(onClose);
  const closingRef = useRef(false);
  const [shownMedia, setShownMedia] = useState<RecapMedia | null>(null);
  const [phase, setPhase] = useState<'closed' | 'open' | 'closing'>('closed');
  const [mediaError, setMediaError] = useState(false);
  const titleId = useId();
  const captionId = useId();
  onCloseRef.current = onClose;

  const finishClose = useCallback((notify: boolean) => {
    if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
    videoRef.current?.pause();
    dialogRef.current?.close();
    unlockScrollRef.current?.();
    unlockScrollRef.current = null;
    setShownMedia(null);
    setPhase('closed');
    closingRef.current = false;
    if (openerRef.current?.isConnected) openerRef.current.focus({ preventScroll: true });
    openerRef.current = null;
    if (notify) onCloseRef.current();
  }, []);

  const requestClose = useCallback((notify = true) => {
    if (!dialogRef.current?.open || closingRef.current) return;
    closingRef.current = true;
    videoRef.current?.pause();
    setPhase('closing');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const token = getComputedStyle(dialogRef.current).getPropertyValue('--sr-dialog-close-duration').trim();
    const parsed = Number.parseFloat(token);
    const duration = Number.isFinite(parsed) ? parsed * (token.endsWith('ms') ? 1 : 1000) : 180;
    closeTimerRef.current = setTimeout(() => finishClose(notify), reducedMotion ? 0 : Math.min(duration, 500));
  }, [finishClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!media) {
      requestClose(false);
      return;
    }

    if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
    closingRef.current = false;
    setShownMedia(media);
    setMediaError(false);
    setPhase('open');

    if (!dialog.open) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const bodyOverflow = document.body.style.overflow;
      const rootOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      unlockScrollRef.current = () => {
        document.body.style.overflow = bodyOverflow;
        document.documentElement.style.overflow = rootOverflow;
      };
      dialog.showModal();
      closeButtonRef.current?.focus({ preventScroll: true });
    }
  }, [media, requestClose]);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    dialogRef.current?.close();
    unlockScrollRef.current?.();
    unlockScrollRef.current = null;
    if (openerRef.current?.isConnected) openerRef.current.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (shownMedia?.kind !== 'video' || !video) return;
    video.muted = true;
    video.defaultMuted = true;
    // Native controls remain available if the browser declines automatic playback.
    void video.play().catch(() => {});
    return () => video.pause();
  }, [shownMedia?.id, shownMedia?.kind, shownMedia?.src]);

  return (
    <dialog
      ref={dialogRef}
      className={`sr-dialog t-modal${phase === 'open' ? ' is-open' : ''}${phase === 'closing' ? ' is-closing' : ''}`}
      aria-labelledby={titleId}
      aria-describedby={shownMedia?.caption ? captionId : undefined}
      onCancel={(event) => { event.preventDefault(); requestClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) requestClose(); }}
      onKeyDown={(event) => {
        if (shownMedia?.kind !== 'image' || closingRef.current) return;
        if (event.key === 'ArrowRight' && onNext) { event.preventDefault(); onNext(); }
        if (event.key === 'ArrowLeft' && onPrevious) { event.preventDefault(); onPrevious(); }
      }}
    >
      <div className="sr-dialog-panel">
        <div className="sr-dialog-toolbar">
          <p id={titleId} className="sr-dialog-title">{shownMedia?.kind === 'video' ? 'Startup Day en video' : 'El día, en imágenes'}</p>
          <button ref={closeButtonRef} type="button" className="sr-dialog-close" onClick={() => requestClose()} aria-label="Cerrar contenido">
            <span>Cerrar</span><DialogIcon direction="close" />
          </button>
        </div>
        {shownMedia ? (
          <figure className="sr-dialog-figure">
            <div className="sr-dialog-stage">
              {mediaError ? (
                <p className="sr-dialog-error" role="status">No se pudo cargar este archivo. Probá abrirlo de nuevo.</p>
              ) : shownMedia.kind === 'video' ? (
                <video
                  key={shownMedia.id}
                  ref={videoRef}
                  className="sr-dialog-media sr-dialog-video"
                  src={shownMedia.src}
                  poster={shownMedia.poster}
                  aria-label={shownMedia.alt}
                  controls
                  playsInline
                  autoPlay
                  muted
                  preload="metadata"
                  onError={() => setMediaError(true)}
                >Tu navegador no puede reproducir este video.</video>
              ) : (
                <img
                  key={shownMedia.id}
                  className="sr-dialog-media sr-dialog-image"
                  src={shownMedia.src}
                  alt={shownMedia.alt}
                  decoding="async"
                  onError={() => setMediaError(true)}
                />
              )}
            </div>
            <figcaption className="sr-dialog-caption" aria-live="polite" aria-atomic="true">
              <div>
                <p id={captionId}>{shownMedia.caption || shownMedia.alt}</p>
                {shownMedia.credit ? <p className="sr-dialog-credit">{shownMedia.credit}</p> : null}
              </div>
              {shownMedia.kind === 'image' && (onPrevious || onNext) ? (
                <div className="sr-dialog-navigation" aria-label="Recorrer las fotos">
                  <button type="button" className="sr-dialog-arrow" onClick={onPrevious} disabled={!onPrevious} aria-label="Foto anterior"><DialogIcon direction="left" /></button>
                  <button type="button" className="sr-dialog-arrow" onClick={onNext} disabled={!onNext} aria-label="Foto siguiente"><DialogIcon direction="right" /></button>
                </div>
              ) : null}
            </figcaption>
          </figure>
        ) : null}
      </div>
    </dialog>
  );
}

export default RecapMediaDialog;
