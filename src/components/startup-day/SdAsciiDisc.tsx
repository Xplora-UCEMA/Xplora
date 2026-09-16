import { useEffect, useRef } from 'react';
import { construirAtlas, RAMP, smoothstep } from './ascii';

/**
 * Disco ASCII — canvas 2D puro.
 *
 * Traduce a la web la portada del evento en Luma: un disco de caracteres sobre fondo casi negro
 * con el mark de Xplora calado en negativo. Acá el campo está vivo — anillos que respiran,
 * rotación lenta, reacción al cursor — en vez de ser una imagen plana.
 *
 * Deliberadamente en canvas 2D y no en WebGL: un disco de ASCII no justifica una librería 3D, y
 * así el hero no depende de nada que no sea el navegador.
 */

type Props = {
  className?: string;
  /** Opacidad global del campo. En mobile el disco pasa a fondo y baja. */
  opacity?: number;
};

export function SdAsciiDisc({ className, opacity = 1 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const motionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const fineMq = window.matchMedia('(pointer: fine)');

    /* Todo el cálculo va en píxeles de dispositivo y sin transform en el contexto principal: así
       cada sprite se pega 1:1 sobre coordenadas enteras. Con `setTransform(dpr,…)` los destinos
       caen en píxeles fraccionarios, el navegador toma el camino de resampleo bilineal y los
       glifos salen borrosos además de más lentos. */
    let W = 0;
    let H = 0;
    let cellW = 0;
    let cellH = 0;
    let cols = 0;
    let rows = 0;
    let cx = 0;
    let cy = 0;
    let R = 0;
    let dpr = 1;
    /** Alpha del mark por celda (0..1). Se recalcula sólo en resize. */
    let mask = new Float32Array(0);
    /** Ruido fijo por celda: rompe el bandeado sin costar nada por frame. */
    let jitter = new Float32Array(0);
    let atlas: HTMLCanvasElement | null = null;

    let raf = 0;
    let t = 0;
    let last = 0;
    let running = false;
    let onScreen = true;
    const pointer = { x: -9999, y: -9999, gain: 0, live: false };

    /**
     * Mark de Xplora: el rombo tipo aguja de brújula con el hueco central, tomado de
     * `/images/logo sin fondo.webp`. Se dibuja con primitivas en vez de cargar el archivo — no hay
     * decode que esperar, no hay intrinsic sizing de SVG, no hay canvas contaminado.
     *
     * (Ojo: `favicon.svg` NO sirve como fuente. Es un stub con un `<rect>` opaco que cubre todo el
     * viewBox, así que su alpha es un cuadrado lleno; y dibuja una X, que no es el mark.)
     */
    const buildMask = () => {
      const off = document.createElement('canvas');
      off.width = cols;
      off.height = rows;
      const octx = off.getContext('2d', { willReadFrequently: true });
      if (!octx) {
        mask = new Float32Array(cols * rows);
        return;
      }

      /* Se dibuja en coordenadas de píxel y la transform lo baja a la grilla. */
      octx.setTransform(1 / cellW, 0, 0, 1 / cellH, 0, 0);
      octx.translate(cx, cy);
      octx.rotate(-Math.PI / 4);

      const L = R * 0.66;
      const S = L * 0.396;

      octx.fillStyle = '#fff';
      octx.beginPath();
      octx.moveTo(L, 0);
      octx.lineTo(0, S);
      octx.lineTo(-L, 0);
      octx.lineTo(0, -S);
      octx.closePath();
      octx.fill();

      /* El hueco del logo vuelve a llenarse de caracteres: el calado reproduce el mark en negativo,
         incluido su ojo. */
      octx.globalCompositeOperation = 'destination-out';
      octx.beginPath();
      octx.arc(0, 0, L * 0.15, 0, Math.PI * 2);
      octx.fill();

      const data = octx.getImageData(0, 0, cols, rows).data;
      mask = new Float32Array(cols * rows);
      for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3]! / 255;
    };

    /* La tira de sprites, una por nivel de la rampa. Vive en `ascii.ts` porque `SdAsciiCampo`
       necesita exactamente la misma —y sobre todo los mismos tonos. */
    const buildAtlas = () => {
      atlas = construirAtlas(cellW, cellH);
    };

    const measure = () => {
      const coarse = !fineMq.matches;
      dpr = coarse ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      const wCss = wrap.clientWidth;
      const hCss = wrap.clientHeight;
      if (!wCss || !hCss) return false;

      W = Math.round(wCss * dpr);
      H = Math.round(hCss * dpr);
      canvas.width = W;
      canvas.height = H;
      canvas.style.width = `${wCss}px`;
      canvas.style.height = `${hCss}px`;

      /* Celda en px CSS: apunta a ~86 columnas y se frena en los extremos para que la grilla siga
         legible tanto en 360 px como en 2560 px. */
      let cellCss = Math.min(13, Math.max(6, wCss / 86));
      cellW = Math.max(2, Math.round(cellCss * dpr));
      cellH = Math.max(3, Math.round(cellCss * 1.9 * dpr));
      cols = Math.ceil(W / cellW);
      rows = Math.ceil(H / cellH);

      /* Techo duro: en pantallas raras (ultrawide, portrait muy alto) el producto se dispara. */
      const CAP = coarse ? 3600 : 6000;
      while (cols * rows > CAP && cellCss < 26) {
        cellCss *= 1.15;
        cellW = Math.max(2, Math.round(cellCss * dpr));
        cellH = Math.max(3, Math.round(cellCss * 1.9 * dpr));
        cols = Math.ceil(W / cellW);
        rows = Math.ceil(H / cellH);
      }

      cx = W / 2;
      cy = H / 2;
      R = Math.min(W, H) * 0.46;

      jitter = new Float32Array(cols * rows);
      for (let i = 0; i < jitter.length; i++) {
        const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
        jitter[i] = s - Math.floor(s);
      }

      buildMask();
      buildAtlas();
      return true;
    };

    const draw = (time: number) => {
      if (running) raf = requestAnimationFrame(draw);

      /* 30 fps a propósito: el ASCII se lee mejor entrecortado, parece una terminal, y deja la
         mitad del presupuesto de frame libre para el resto de la página. */
      if (time - last < 32) return;
      const dt = last ? Math.min(0.1, (time - last) / 1000) : 0.033;
      last = time;
      t += dt;

      if (!atlas) return;

      /* El puntero se suaviza una vez por frame, no por celda. */
      pointer.gain += ((pointer.live ? 1 : 0) - pointer.gain) * 0.08;

      const tw = Math.ceil(cellW * 1.15);
      const th = Math.ceil(cellH * 1.15);
      const nGlyph = RAMP.length - 1;

      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = opacity;

      for (let row = 0; row < rows; row++) {
        const y = row * cellH + cellH / 2;
        const dy = (y - cy) / R;
        for (let col = 0; col < cols; col++) {
          const idx = row * cols + col;

          const carved = mask[idx] ?? 0;
          if (carved > 0.5) continue;

          const x = col * cellW + cellW / 2;
          const dx = (x - cx) / R;
          const r = Math.hypot(dx, dy);
          if (r > 1.02) continue;

          const a = Math.atan2(dy, dx);

          /* Brazos en espiral que salen del centro: el `r * 7.5` es lo que los curva en vez de
             dejarlos como un molinete. Una vuelta completa cada ~114 s, casi subliminal. */
          const spiral = Math.sin(3 * (a + 0.055 * t) + r * 7.5 - t * 0.9);

          /* Ruido barato: tres senos cruzados más una onda concéntrica. */
          const n =
            (Math.sin(dx * 5.1 + t * 0.61) +
              Math.cos(dy * 4.3 - t * 0.47) +
              Math.sin((dx + dy) * 3.2 + t * 0.33) +
              0.6 * Math.sin((dx * dx + dy * dy) * 9 - t * 1.1)) *
            0.27;

          let v = 0.5 + 0.34 * spiral + 0.3 * n;

          if (pointer.gain > 0.01) {
            const md = Math.hypot(x - pointer.x, y - pointer.y) / R;
            if (md < 0.42) {
              const bump = (1 - md / 0.42) ** 2;
              v += pointer.gain * (bump * Math.sin(md * 26 - t * 4.2) * 0.55 + 0.22 * bump);
            }
          }

          /* Borde blando y centro un punto más denso. */
          v *= 1 - smoothstep(0.86, 1.0, r);
          v *= 0.55 + 0.45 * smoothstep(0, 0.35, r);
          v += (jitter[idx]! - 0.5) * 0.06;

          /* El calado se desvanece en su borde en vez de cortar en seco: 1-2 celdas de caída son
             las que lo hacen leer como negativo de ASCII y no como troquel. */
          v *= 1 - carved * 2;

          if (v <= 0.05) continue;
          const gi = Math.min(nGlyph, (v * RAMP.length) | 0);
          if (gi <= 0) continue;

          ctx.drawImage(atlas, gi * tw, 0, tw, th, col * cellW, row * cellH, tw, th);
        }
      }

      ctx.globalAlpha = 1;
    };

    const paintOnce = () => {
      last = 0;
      draw(performance.now());
    };

    const start = () => {
      if (running || motionMq.matches) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(draw);
    };

    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    /** Con la pestaña oculta o el hero fuera de pantalla el bucle se apaga: debajo del hero hay una
     *  escena WebGL, dejar un rAF girando ahí abajo es el error más caro disponible. */
    const sync = () => {
      if (onScreen && !document.hidden && !motionMq.matches) start();
      else stop();
    };

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      pointer.x = (e.clientX - rect.left) * dpr;
      pointer.y = (e.clientY - rect.top) * dpr;
      pointer.live =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
    };

    if (!measure()) return;

    /* El canvas queda `pointer-events: none` y el listener va en window: encima del disco hay
       contenido con `pointer-events: none` y un cursor custom que fuerza `cursor: none !important`,
       así que un listener sobre el canvas sólo dispararía en los huecos. */
    if (fineMq.matches) window.addEventListener('pointermove', onMove, { passive: true });

    const io = new IntersectionObserver(
      ([e]) => {
        onScreen = Boolean(e?.isIntersecting);
        sync();
      },
      { rootMargin: '10% 0px' },
    );
    io.observe(wrap);

    let resizeTimer = 0;
    const ro = new ResizeObserver(() => {
      /* El backing store se ajusta enseguida; el atlas y la máscara se debouncean porque en iOS el
         colapso de la barra de URL dispara `resize` en ráfaga. */
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (measure() && !running) paintOnce();
      }, 150);
    });
    ro.observe(wrap);

    const onMotionChange = () => {
      if (motionMq.matches) {
        stop();
        paintOnce();
      } else sync();
    };

    document.addEventListener('visibilitychange', sync);
    motionMq.addEventListener('change', onMotionChange);

    if (motionMq.matches) paintOnce();
    else sync();

    return () => {
      stop();
      window.clearTimeout(resizeTimer);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', sync);
      motionMq.removeEventListener('change', onMotionChange);
    };
  }, [opacity]);

  return (
    <div ref={wrapRef} className={`sd-ascii${className ? ` ${className}` : ''}`} aria-hidden>
      <canvas ref={canvasRef} className="sd-ascii__canvas" />
    </div>
  );
}
