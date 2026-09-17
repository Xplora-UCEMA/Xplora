import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export type RecapVideoPreviewProps = {
  src: string;
  poster: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  onOpen?: () => void;
  openLabel?: string;
  /** Suspends previews while the full-screen player is open. */
  disabled?: boolean;
  /** Non-interactive artwork or copy inside the full-area open button. */
  children?: ReactNode;
};

type PreviewConnection = EventTarget & { saveData?: boolean; effectiveType?: string };

function connectionInfo() {
  return (navigator as Navigator & { connection?: PreviewConnection }).connection;
}

function automaticPlaybackAllowed() {
  if (typeof window === 'undefined') return false;
  const connection = connectionInfo();
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    && !connection?.saveData && !/2g/.test(connection?.effectiveType || '');
}

function PreviewIcon({ kind }: { kind: 'play' | 'pause' | 'open' }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {kind === 'play' ? <path d="m9 5 10 7-10 7V5Z" /> : kind === 'pause' ? <><path d="M8 5v14M16 5v14" /></> : <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />}
    </svg>
  );
}

/** Silent, viewport-owned playback. Native intersection accounts for clipped horizontal rails. */
export function RecapVideoPreview({
  src, poster, alt, width = 540, height = 960, className = '', onOpen,
  openLabel = `Abrir video: ${alt}`, disabled = false, children,
}: RecapVideoPreviewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackAttempt = useRef(0);
  const [viewport, setViewport] = useState({ intersects: false, autoplay: false });
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  const [allowAutomatic, setAllowAutomatic] = useState(automaticPlaybackAllowed);
  const [intent, setIntent] = useState<'automatic' | 'play' | 'pause'>('automatic');
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [failed, setFailed] = useState(false);
  const sourceEnabled = viewport.intersects && (viewport.autoplay || intent !== 'automatic')
    && pageVisible && !disabled && !failed && (allowAutomatic || intent !== 'automatic');
  const shouldPlay = sourceEnabled && intent !== 'pause';

  const playSilently = useCallback((video: HTMLVideoElement) => {
    const attempt = ++playbackAttempt.current;
    video.muted = true;
    video.defaultMuted = true;
    void video.play().catch(() => {
      if (attempt !== playbackAttempt.current) return;
      // A browser may decline autoplay. Keep the poster and the manual play action available.
      setIsPlaying(false);
    });
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    if (!('IntersectionObserver' in window)) {
      setViewport({ intersects: true, autoplay: false });
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      const intersects = entry.isIntersecting && entry.intersectionRatio > 0;
      const autoplay = intersects && entry.intersectionRatio >= .3;
      setViewport(previous => previous.intersects === intersects && previous.autoplay === autoplay
        ? previous : { intersects, autoplay });
    }, { threshold: [0, .3], rootMargin: '0px' });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = connectionInfo();
    const updatePreferences = () => setAllowAutomatic(automaticPlaybackAllowed());
    const updateVisibility = () => setPageVisible(!document.hidden);
    motion.addEventListener('change', updatePreferences);
    connection?.addEventListener('change', updatePreferences);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      motion.removeEventListener('change', updatePreferences);
      connection?.removeEventListener('change', updatePreferences);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);

  useEffect(() => {
    setIntent('automatic');
    setFailed(false);
    setHasPlayed(false);
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (shouldPlay) playSilently(video);
    else {
      playbackAttempt.current += 1;
      video.pause();
      setIsPlaying(false);
    }
    if (!sourceEnabled) {
      setHasPlayed(false);
      // Abort the pending resource request as well as pausing its decoder.
      video.removeAttribute('src');
      video.load();
    }
    return () => {
      playbackAttempt.current += 1;
      video.pause();
    };
  }, [playSilently, shouldPlay, sourceEnabled, src]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video || disabled || failed) return;
    if (isPlaying) {
      playbackAttempt.current += 1;
      setIntent('pause');
      video.pause();
      setIsPlaying(false);
      return;
    }
    setIntent('play');
    if (viewport.intersects && pageVisible) {
      // Attach and start inside the gesture, including on data-saving and reduced-motion devices.
      if (!video.getAttribute('src')) video.src = src;
      playSilently(video);
    }
  };

  return (
    <div
      ref={wrapperRef}
      className={`sr-video-preview${className ? ` ${className}` : ''}`}
      data-playing={isPlaying ? 'true' : 'false'}
      data-ready={hasPlayed && sourceEnabled ? 'true' : 'false'}
      data-failed={failed ? 'true' : 'false'}
    >
      <img className="sr-preview-poster" src={poster} alt={alt} width={width} height={height} loading="lazy" decoding="async" />
      <video
        ref={videoRef}
        className="sr-preview-video"
        src={sourceEnabled ? src : undefined}
        poster={poster}
        width={width}
        height={height}
        muted
        loop
        playsInline
        autoPlay={shouldPlay}
        preload="none"
        aria-hidden="true"
        tabIndex={-1}
        onPlaying={() => { setIsPlaying(true); setHasPlayed(true); }}
        onPause={() => setIsPlaying(false)}
        onError={() => { setFailed(true); setIsPlaying(false); setHasPlayed(false); }}
      />
      {onOpen ? (
        <button className="sr-preview-open" type="button" onClick={onOpen} aria-label={openLabel}>
          {children || <PreviewIcon kind="open" />}
        </button>
      ) : children}
      <button
        className="sr-preview-toggle"
        type="button"
        onClick={togglePlayback}
        disabled={disabled || failed}
        aria-label={`${isPlaying ? 'Pausar' : 'Reproducir'} vista previa de ${alt}`}
        title={isPlaying ? 'Pausar vista previa' : 'Reproducir sin sonido'}
      >
        <PreviewIcon kind={isPlaying ? 'pause' : 'play'} />
      </button>
      {failed ? <span className="sr-preview-error" role="status">Vista previa no disponible.</span> : null}
    </div>
  );
}

export default RecapVideoPreview;
