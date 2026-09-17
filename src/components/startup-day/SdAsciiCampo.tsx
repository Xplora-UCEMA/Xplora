import { useEffect, useRef } from 'react';
import { construirAtlas, PATRONES, RAMP, type PatronAscii } from './ascii';

/**
 * Campo de ASCII — canvas 2D, hermano chico de `SdAsciiDisc`.
 *
 * El disco es una pieza: tiene el mark de Xplora calado en negativo, reacciona al cursor y es el
 * protagonista del hero. Esto es textura: llena una caja con un patrón de `ascii.ts` y no hace
 * nada más. Por eso no comparten componente —el disco tendría que aprender a no ser un disco— sino
 * la rampa, la paleta y el atlas de glifos, que es lo que no puede divergir.
 *
 * ## El presupuesto, que es el punto
 *
 * La página ya se comió una sección 3D que hubo que sacar por lenta, así que esto se mide:
 *
 * - **`animado={false}` pinta UN frame y no vuelve a dibujar nunca.** Es el modo de las celdas del
 *   bento: cuatro canvas que después de montarse cuestan exactamente lo que cuesta un `<img>`.
 * - Animado va a **30 fps** (como el disco: el ASCII se lee mejor entrecortado) y un
 *   `IntersectionObserver` apaga el bucle apenas la caja sale de pantalla.
 * - Con `prefers-reduced-motion` no hay bucle en ningún caso: pinta una vez y listo.
 *
 * ## Por qué canvas y no una imagen
 *
 * Una textura de ASCII exportada a PNG pesa más que este archivo y hay que re-exportarla cada vez
 * que cambia la caja. Acá la grilla se recalcula con `ResizeObserver` y siempre cae en píxeles
 * enteros, que es lo que hace que los glifos salgan nítidos (ver el comentario del dpr).
 */

type Props = {
  className?: string;
  /** Qué dibuja. Ver `PATRONES` en `ascii.ts`. */
  patron: PatronAscii;
  /** Opacidad global del campo. */
  opacity?: number;
  /** `false` pinta un solo frame y no monta ningún bucle. */
  animado?: boolean;
  /**
   * Lado de la celda en px CSS. Más grande = menos celdas = más barato, y el ASCII se lee más
   * como tipografía que como trama.
   */
  celda?: number;
  /** Semilla del reloj: dos campos con el mismo patrón no arrancan sincronizados. */
  fase?: number;
  /**
   * Piso de densidad: por debajo de esto la celda queda vacía.
   *
   * Es lo que decide si el campo se lee como TEXTURA o como ATMÓSFERA. Con el piso bajo (0,05) se
   * dibuja casi toda la grilla y el resultado es una trama pareja —bien para una celda del bento,
   * que quiere fondo—. Subiéndolo sólo sobreviven las crestas del patrón, así que quedan glifos
   * sueltos sobre el fondo y el rectángulo del canvas deja de notarse — que es lo que hace falta
   * en el hero, donde el campo se va a sangre contra el borde de la pantalla.
   *
   * De paso es la palanca más barata que hay: cada celda por debajo del piso es un `drawImage`
   * que no se ejecuta.
   */
  corte?: number;
  /**
   * Glifo más pesado que se puede dibujar: un índice en `RAMP` (`' .:-=+*#%@'`).
   *
   * Existe porque `corte` solo hace lo contrario de lo que parece. La densidad elige **las tres
   * cosas a la vez**: si la celda se dibuja, con qué carácter, y de qué tono —el color sale del
   * mismo índice—. Así que subir el piso para ralear el campo deja únicamente las crestas, o sea
   * `#`, `%` y `@` en el lavanda más claro de la paleta: queda más ralo y MUCHO más pesado.
   *
   * Con `pico` la densidad que sobrevive al corte se reescala sobre el tramo `1..pico` en vez de
   * sobre la rampa entera. `pico` bajo = puntos y guiones en un tono apagado, que es lo que se lee
   * como textura fina. Alto = la rampa completa, para cuando el campo es el motivo y no el fondo.
   */
  pico?: number;
  /**
   * Tope de celdas de la grilla. Pasado el tope el componente agranda la celda hasta entrar.
   *
   * El default es para las cajas chicas —las del bento—, donde una celda fina sobre un panel de
   * 300px ya son miles de `drawImage` por nada. Una forma grande necesita muchas más: si el tope
   * la alcanza, le sube el lado de la celda y le deshace el dibujo.
   */
  techoCeldas?: number;
};

export function SdAsciiCampo({
  className,
  patron,
  opacity = 1,
  animado = true,
  celda = 9,
  fase = 0,
  corte = 0.05,
  pico,
  techoCeldas = 4200,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const motionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const campo = PATRONES[patron];

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
    let dpr = 1;
    let atlas: HTMLCanvasElement | null = null;

    let raf = 0;
    let t = fase;
    let last = 0;
    let corriendo = false;
    let enPantalla = true;

    const medir = () => {
      const wCss = wrap.clientWidth;
      const hCss = wrap.clientHeight;
      if (!wCss || !hCss) return false;

      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.round(wCss * dpr);
      H = Math.round(hCss * dpr);
      canvas.width = W;
      canvas.height = H;
      canvas.style.width = `${wCss}px`;
      canvas.style.height = `${hCss}px`;

      cellW = Math.max(2, Math.round(celda * dpr));
      /* 1,9 es la proporción de una celda de terminal: más alta que ancha. */
      cellH = Math.max(3, Math.round(celda * 1.9 * dpr));
      cols = Math.ceil(W / cellW);
      rows = Math.ceil(H / cellH);

      /* Techo de celdas. Una caja grande con celda chica se dispara y este componente es
         decoración: nunca puede costar más que el contenido que decora. Ver `techoCeldas`. */
      let lado = celda;
      while (cols * rows > techoCeldas && lado < 30) {
        lado *= 1.15;
        cellW = Math.max(2, Math.round(lado * dpr));
        cellH = Math.max(3, Math.round(lado * 1.9 * dpr));
        cols = Math.ceil(W / cellW);
        rows = Math.ceil(H / cellH);
      }

      atlas = construirAtlas(cellW, cellH);
      return Boolean(atlas);
    };

    const dibujar = (time: number) => {
      if (corriendo) raf = requestAnimationFrame(dibujar);

      /* 30 fps a propósito: el ASCII se lee mejor entrecortado, parece una terminal, y deja la
         mitad del presupuesto de frame libre para el resto de la página. */
      if (corriendo) {
        if (time - last < 32) return;
        t += last ? Math.min(0.1, (time - last) / 1000) : 0.033;
        last = time;
      }

      if (!atlas) return;

      const tw = Math.ceil(cellW * 1.15);
      const th = Math.ceil(cellH * 1.15);
      const nGlyph = RAMP.length - 1;
      /* El tramo de rampa disponible, y cuánto queda de densidad por encima del corte para
         repartir en él. Los dos se calculan una vez por frame y no por celda. */
      const techo = Math.min(nGlyph, Math.max(1, pico ?? nGlyph));
      const sobra = Math.max(1e-6, 1 - corte);

      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = opacity;

      for (let row = 0; row < rows; row++) {
        const v = (row * cellH + cellH / 2) / H;
        for (let col = 0; col < cols; col++) {
          const u = (col * cellW + cellW / 2) / W;
          const d = campo(u, v, t);
          if (d <= corte) continue;
          /* Lo que sobrevivió al corte se reescala sobre `1..techo`: sin esto, cortar alto sería
             quedarse sólo con los glifos más pesados. Ver `pico`. */
          const gi = Math.min(techo, 1 + (((d - corte) / sobra) * techo) | 0);
          ctx.drawImage(atlas, gi * tw, 0, tw, th, col * cellW, row * cellH, tw, th);
        }
      }

      ctx.globalAlpha = 1;
    };

    const pintarUnaVez = () => {
      last = 0;
      dibujar(performance.now());
    };

    const arrancar = () => {
      if (corriendo || !animado || motionMq.matches) return;
      corriendo = true;
      last = 0;
      raf = requestAnimationFrame(dibujar);
    };

    const frenar = () => {
      corriendo = false;
      cancelAnimationFrame(raf);
    };

    /** Fuera de pantalla o con la pestaña oculta no se dibuja: no hay excusa para un rAF girando
     *  sobre una textura que nadie está mirando. */
    const sincronizar = () => {
      if (enPantalla && !document.hidden) arrancar();
      else frenar();
    };

    if (!medir()) return;

    const io = new IntersectionObserver(
      ([e]) => {
        enPantalla = Boolean(e?.isIntersecting);
        /* En estático alcanza con pintar la primera vez que entra: antes de eso la caja puede
           medir 0 y no habría nada que dibujar. */
        if (!animado || motionMq.matches) {
          if (enPantalla) pintarUnaVez();
          return;
        }
        sincronizar();
      },
      { rootMargin: '10% 0px' },
    );
    io.observe(wrap);

    let resizeTimer = 0;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (medir() && !corriendo) pintarUnaVez();
      }, 150);
    });
    ro.observe(wrap);

    const onMotionChange = () => {
      if (motionMq.matches) {
        frenar();
        pintarUnaVez();
      } else sincronizar();
    };

    document.addEventListener('visibilitychange', sincronizar);
    motionMq.addEventListener('change', onMotionChange);

    if (!animado || motionMq.matches) pintarUnaVez();
    else sincronizar();

    return () => {
      frenar();
      window.clearTimeout(resizeTimer);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', sincronizar);
      motionMq.removeEventListener('change', onMotionChange);
    };
  }, [patron, opacity, animado, celda, fase, corte, pico, techoCeldas]);

  return (
    <div ref={wrapRef} className={`sd-ascii${className ? ` ${className}` : ''}`} aria-hidden>
      <canvas ref={canvasRef} className="sd-ascii__canvas" />
    </div>
  );
}
