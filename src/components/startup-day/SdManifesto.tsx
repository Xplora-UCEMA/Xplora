/**
 * "Para quién es" — lámina técnica (Figma `Zettios` 368:83).
 *
 * Quinta dirección de arte para esta sección (1: tipografía cinética con ScrollTrigger; 2:
 * sistema modular de bit-patterns; 3: mapa de coordenadas de 7 nodos — descartada por
 * sobrecargada; 4: poster editorial con rutas/nodos hacia un destino). Ésta viene de un diseño
 * cerrado, así que la composición es la del Figma: titular a la izquierda, copy de apoyo + CTAs
 * a la derecha, y una banda de logos al pie, todo dentro de un marco de hairlines con marcas de
 * esquina sobre negro casi total.
 *
 * Lo que cambia respecto de la 4ª: se van las rutas/nodos SVG y el par titular soft/bold con
 * palabra en violeta. El titular ahora es un solo bloque en una sola caja tipográfica, como está
 * diseñado.
 *
 * El "papel" de fondo es el compás de Xplora tramado en ASCII (`bg-ascii.webp`, el mismo asset
 * del Figma reescalado de 2508px/8,2 MB a 1100px/59 KB — va al 20% de opacidad sobre negro, así
 * que la diferencia no se ve). Es imagen y no un canvas como `SdAsciiDisc` a propósito: acá es
 * textura quieta, no un elemento vivo, y no justifica un segundo canvas animado en la página.
 *
 * Mismo criterio de motion que las direcciones anteriores: un solo árbol JSX ya en su posición
 * final y el timeline sólo toca opacity/transform. Sin JS — mobile, `prefers-reduced-motion`, o
 * el primer frame — la lámina ya está completa. Dispara una vez con IntersectionObserver.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';

import { sdInscripcionUrl } from '../../data/startupDay';
import { standsConMarca } from '../../data/startupDayStands';

/**
 * Las marcas de la banda: exactamente las que tienen mesa en el piso, en el orden del
 * recorrido —las aulas L, N, O y P primero, después las sueltas del hall— y con el mismo
 * archivo de logo que muestran las insignias del render 3D.
 *
 * Antes salía de `SD_STARTUPS` con una lista de exclusiones a mano y un mapa de reemplazos
 * `quien/*`. Las dos cosas sobran ahora: la lista de exclusiones porque la fuente ya es el
 * piso —una marca sin mesa no aparece—, y los reemplazos porque existían para esquivar
 * assets con placa de fondo, y los monocromos nuevos no la traen.
 *
 * Una marca con dos mesas entra una sola vez.
 */
const MARCAS = (() => {
  const vistas = new Set<string>();
  return standsConMarca()
    .map((s) => s.marca)
    .filter((m) => {
      if (vistas.has(m.id)) return false;
      vistas.add(m.id);
      return true;
    });
})();

/**
 * Las que el blanqueo por filtro arruinaría, y que por eso se muestran tal cual sobre su chip:
 * Datricas es bitono —su círculo se aplastaría contra el wordmark— y Renderahouse trae fondo
 * negro propio, que quedaría como un bloque blanco.
 *
 * Salió de medir alfa y luminancia de los 42 archivos del piso, no de mirarlos: el resto ya es
 * blanco sobre transparente, o es oscuro y se blanquea sin perder nada.
 */
const SIN_BLANQUEO = new Set(['datricas', 'renderahouse']);

const LOGOS = MARCAS.map((m) => ({
  id: m.id,
  name: m.name,
  /** Vacío para las que todavía no tienen archivo: se cae al nombre en texto. */
  src: m.logoUrl,
  chip: SIN_BLANQUEO.has(m.id),
  href: m.href,
}));

/**
 * Cuántos segundos tarda el track en recorrerse solo, media vuelta. Escala con la cantidad de
 * marcas para que la velocidad de paso no dependa de cuántas haya en la data.
 */
const SEGUNDOS_POR_VUELTA = LOGOS.length * 3.2;

/**
 * Radio del foco, en fracción del ancho visible: a esa distancia del centro la marca ya está
 * apagada del todo. Con 0,32 hay siempre dos o tres encendiéndose y apagándose a la vez, que es
 * lo que hace que la banda parezca viva y no una fila que pasa.
 */
const RADIO_FOCO = 0.32;
/** Grados que se inclina una marca a velocidad de tirón fuerte. */
const INCLINACION_MAX = 5;
/** Velocidad (px/s) a partir de la cual la inclinación ya está al tope. */
const VELOCIDAD_TOPE = 2600;

/** Duplicada: el desfile devuelve el scroll media vuelta al pasar de largo, y así cierra sin salto. */
const LOOP = [...LOGOS, ...LOGOS];

const HEADLINE = 'No importa quién sos. Importa quién querés ser.';

const LEDE =
  'Stands abiertos durante todo el evento, workshops con empresas líderes, charlas y espacio ' +
  'para conversar con quienes están construyendo.';

function buildTimeline(els: {
  ascii: HTMLElement;
  glows: Element[];
  rules: Element[];
  marks: Element[];
  headline: Element;
  lede: Element;
  actions: Element;
  marquee: Element;
}) {
  const tl = gsap.timeline({ paused: true });

  /* La textura descansa translúcida (`.sd-quien__ascii` la fija en 0.2), así que el fade tiene que
     terminar en ESE valor y no en 1: llevarla a opaca la convierte en el elemento más fuerte de la
     lámina. Se lee del computado en vez de repetir el número acá — el valor es una decisión de
     diseño y vive en el CSS. */
  const asciiRest = parseFloat(getComputedStyle(els.ascii).opacity) || 1;

  tl.fromTo(els.ascii, { opacity: 0 }, { opacity: asciiRest, duration: 0.9, ease: 'power1.out' }, 0)
    .fromTo(els.glows, { opacity: 0 }, { opacity: 1, duration: 1.1, ease: 'power1.out' }, 0)
    /* Las hairlines se dibujan desde su origen: las horizontales abren hacia los lados, las
       verticales hacia abajo. `transform-origin` lo fija el CSS por clase. */
    .fromTo(
      els.rules,
      { scaleX: 0, scaleY: 0 },
      { scaleX: 1, scaleY: 1, duration: 0.7, stagger: 0.08, ease: 'power2.inOut' },
      0.1,
    )
    .fromTo(els.marks, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.3 }, 0.7)
    .fromTo(els.headline, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.7 }, 0.45)
    .fromTo(els.lede, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5 }, 0.7)
    .fromTo(els.actions, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5 }, 0.85)
    /* La banda entra como bloque y no logo por logo: con la fila duplicada para el loop, un
       stagger recorrería decenas de elementos —la mayoría fuera de pantalla— y el remate de la
       lámina llegaría varios segundos tarde. */
    .fromTo(els.marquee, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5 }, 1.1);

  return tl;
}

export function SdManifesto() {
  const rootRef = useRef<HTMLElement>(null);
  const asciiRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const ledeRef = useRef<HTMLParagraphElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const firedRef = useRef(false);

  /**
   * Desfile de la banda y arrastre.
   *
   * Antes era un `@keyframes` que corría el track con `transform: translateX(-50%)`. Se pasó a
   * mover `scrollLeft` cuadro a cuadro porque eso lo convierte en un contenedor scrolleable de
   * verdad: la rueda horizontal, el trackpad y el swipe táctil pasan a funcionar solos, con la
   * inercia nativa del navegador, y el arrastre con el mouse se agrega acá. Con `transform` nada
   * de eso existía — la banda sólo se podía mirar pasar.
   *
   * El track va duplicado, así que el ciclo cierra devolviendo `scrollLeft` media vuelta cuando
   * se pasa de largo. Se controla en los dos sentidos: arrastrando hacia atrás también se da la
   * vuelta, en vez de topar contra el cero.
   */
  useEffect(() => {
    const el = marqueeRef.current;
    if (!el) return;

    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)');
    /* Pausa mientras el puntero está encima o el foco adentro: los logos son links y hay que
       poder alcanzarlos. Antes lo hacía `animation-play-state` desde el CSS. */
    let detenida = false;
    let arrastrando = false;
    let inercia = 0;
    let ultimoT = performance.now();

    const media = () => el.scrollWidth / 2;
    const envolver = () => {
      const m = media();
      if (m <= 0) return;
      if (el.scrollLeft >= m) el.scrollLeft -= m;
      else if (el.scrollLeft < 0) el.scrollLeft += m;
    };

    /**
     * Foco e inclinación.
     *
     * El foco enciende a la marca que está pasando por el centro de la banda y apaga a las de
     * los costados, así que el efecto viaja solo con el desfile: sin tocar nada, siempre hay
     * algo cambiando. La inclinación va con la velocidad y es lo que hace que un tirón se
     * sienta — a velocidad de crucero es de una fracción de grado, imperceptible.
     *
     * Se escribe `transform` y `opacity`, las dos propiedades que el compositor resuelve sin
     * recalcular layout, y sólo sobre las celdas que están a tiro de la ventana. Las demás se
     * apagan una vez y no se vuelven a tocar hasta que entran.
     */
    const celdas = Array.from(el.querySelectorAll<HTMLElement>('.sd-quien__logo'));
    let centros: number[] = [];
    const apagadas = new Array<boolean>(celdas.length).fill(false);
    const medir = () => {
      centros = celdas.map((c) => c.offsetLeft + c.offsetWidth / 2);
    };
    medir();

    /* El hover sigue encendiendo la marca. Va por acá y no por CSS porque el estilo en línea de
       cada cuadro le gana a cualquier regla de clase, así que la del hover quedaría muerta. */
    let encima: HTMLElement | null = null;
    const sobre = (e: PointerEvent) => {
      encima = (e.target as Element | null)?.closest<HTMLElement>('.sd-quien__logo') ?? null;
    };

    const pintar = (velocidad: number) => {
      if (quieto.matches || centros.length !== celdas.length) return;
      const centro = el.scrollLeft + el.clientWidth / 2;
      const radio = el.clientWidth * RADIO_FOCO;
      const alcance = el.clientWidth * 0.75;
      const inclinacion =
        Math.max(-1, Math.min(1, velocidad / VELOCIDAD_TOPE)) * -INCLINACION_MAX;
      for (let i = 0; i < celdas.length; i++) {
        const d = Math.abs(centros[i]! - centro);
        if (d > alcance) {
          if (!apagadas[i]) {
            celdas[i]!.style.opacity = '';
            celdas[i]!.style.transform = '';
            apagadas[i] = true;
          }
          continue;
        }
        apagadas[i] = false;
        const k = celdas[i] === encima ? 1 : Math.max(0, 1 - d / radio);
        const c = celdas[i]!;
        c.style.opacity = String(0.58 + 0.42 * k);
        c.style.transform = `skewX(${inclinacion.toFixed(2)}deg) scale(${(1 + 0.08 * k).toFixed(
          3,
        )}) translateY(${(-5 * k).toFixed(1)}px)`;
      }
    };

    /* El ancho de las celdas cambia con `--sd-quien-k`, que está atado a `vw`. */
    const ro = new ResizeObserver(medir);
    ro.observe(el);

    let raf = requestAnimationFrame(function paso(t: number) {
      /* Techo al delta: al volver de una pestaña en segundo plano, el salto acumulado movería
         la banda media vuelta de un cuadro al otro. */
      const dt = Math.min(0.05, (t - ultimoT) / 1000);
      ultimoT = t;
      const previo = el.scrollLeft;
      if (inercia !== 0) {
        el.scrollLeft += inercia * dt;
        inercia *= Math.pow(0.02, dt);
        if (Math.abs(inercia) < 6) inercia = 0;
      } else if (!detenida && !quieto.matches) {
        el.scrollLeft += media() / SEGUNDOS_POR_VUELTA * dt;
      }
      /* La velocidad se mide sobre lo que efectivamente se movió, no sobre lo que se pidió: así
         entra también lo que mueven la rueda, el trackpad y el arrastre, que tocan `scrollLeft`
         por fuera de este loop. */
      const corrido = el.scrollLeft - previo;
      envolver();
      pintar(dt > 0 ? corrido / dt : 0);
      raf = requestAnimationFrame(paso);
    });

    /* Sólo el mouse se arrastra a mano. En touch el navegador ya scrollea el contenedor y le
       pone su propia inercia; interceptarlo sería pelearle y perder. */
    let ultimaX = 0;
    let ultimaVT = 0;
    let velocidad = 0;
    let recorrido = 0;

    const abajo = (e: PointerEvent) => {
      detenida = true;
      inercia = 0;
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      arrastrando = true;
      recorrido = 0;
      velocidad = 0;
      ultimaX = e.clientX;
      ultimaVT = performance.now();
      el.setPointerCapture(e.pointerId);
      el.classList.add('is-arrastrando');
    };

    const mover = (e: PointerEvent) => {
      if (!arrastrando) return;
      const dx = e.clientX - ultimaX;
      /* Incremental y no contra el punto de partida: si en el medio del arrastre el track da la
         vuelta, un cálculo absoluto pegaría un salto de media banda. */
      el.scrollLeft -= dx;
      recorrido += Math.abs(dx);
      const t = performance.now();
      const dt = (t - ultimaVT) / 1000;
      if (dt > 0.008) {
        velocidad = -dx / dt;
        ultimaVT = t;
      }
      ultimaX = e.clientX;
      envolver();
    };

    const arriba = (e: PointerEvent) => {
      detenida = false;
      if (!arrastrando) return;
      arrastrando = false;
      el.releasePointerCapture(e.pointerId);
      el.classList.remove('is-arrastrando');
      /* Tope a la inercia: un tirón corto y rápido puede dar miles de px/s y la banda se
         volvería ilegible. */
      inercia = Math.max(-4000, Math.min(4000, velocidad));
    };

    /* Un arrastre que empieza sobre un logo no tiene que terminar abriendo su sitio. */
    const alClick = (e: MouseEvent) => {
      if (recorrido > 6) {
        e.preventDefault();
        e.stopPropagation();
      }
      recorrido = 0;
    };

    const entra = () => {
      detenida = true;
    };
    const sale = () => {
      if (!arrastrando) detenida = false;
      encima = null;
    };

    el.addEventListener('pointerover', sobre);
    el.addEventListener('pointerdown', abajo);
    el.addEventListener('pointermove', mover);
    el.addEventListener('pointerup', arriba);
    el.addEventListener('pointercancel', arriba);
    el.addEventListener('click', alClick, true);
    el.addEventListener('pointerenter', entra);
    el.addEventListener('pointerleave', sale);
    el.addEventListener('focusin', entra);
    el.addEventListener('focusout', sale);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerover', sobre);
      el.removeEventListener('pointerdown', abajo);
      el.removeEventListener('pointermove', mover);
      el.removeEventListener('pointerup', arriba);
      el.removeEventListener('pointercancel', arriba);
      el.removeEventListener('click', alClick, true);
      el.removeEventListener('pointerenter', entra);
      el.removeEventListener('pointerleave', sale);
      el.removeEventListener('focusin', entra);
      el.removeEventListener('focusout', sale);
    };
  }, []);

  /* `useLayoutEffect`: el timeline se crea pausado y GSAP aplica su estado "from" apenas se
     construye (immediateRender) — tiene que pasar antes del primer paint o se ve la lámina
     completa seguida de un salto a oculto. En mobile / `prefers-reduced-motion` ni se ejecuta:
     el JSX ya es la composición final tal cual está escrita. */
  useLayoutEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wide = window.matchMedia('(min-width: 900px)').matches;
    if (!wide || reduce) return;

    const root = rootRef.current;
    const ascii = asciiRef.current;
    const headline = headlineRef.current;
    const lede = ledeRef.current;
    const actions = actionsRef.current;
    if (!root || !ascii || !headline || !lede || !actions) return;

    const q = <T extends Element>(sel: string) => Array.from(root.querySelectorAll<T>(sel));
    const glows = q('.sd-quien__glow');
    const rules = q('.sd-quien__rule');
    const marks = q('.sd-quien__mark');
    const marquee = marqueeRef.current;

    if (!rules.length || !marquee) return;

    let tl: gsap.core.Timeline | undefined;
    const ctx = gsap.context(() => {
      tl = buildTimeline({ ascii, glows, rules, marks, headline, lede, actions, marquee });
    }, root);

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !firedRef.current) {
          firedRef.current = true;
          tl?.play();
          obs.disconnect();
        }
      },
      { threshold: 0.2, rootMargin: '0px 0px -10% 0px' },
    );
    obs.observe(root);

    return () => {
      obs.disconnect();
      ctx.revert();
    };
  }, []);

  return (
    <section id="para-quien" className="sd-quien" ref={rootRef}>
      <div className="sd-quien__ascii" ref={asciiRef} aria-hidden />
      <div className="sd-quien__glow sd-quien__glow--tr" aria-hidden />
      <div className="sd-quien__glow sd-quien__glow--bl" aria-hidden />
      <div className="sd-quien__glow sd-quien__glow--cta" aria-hidden />

      {/* Marco técnico: dos reglas a sangre —arriba y abajo— y las cuatro marcas de esquina.
          Sin verticales: cruzaban la banda de logos de punta a punta y cortaban el desfile. Las
          marcas de esquina quedan igual y solas alcanzan para acotar la lámina. */}
      <div className="sd-quien__frame" aria-hidden>
        <span className="sd-quien__rule sd-quien__rule--top" />
        <span className="sd-quien__rule sd-quien__rule--bottom" />
        <span className="sd-quien__mark sd-quien__mark--tl" />
        <span className="sd-quien__mark sd-quien__mark--tr" />
        <span className="sd-quien__mark sd-quien__mark--bl" />
        <span className="sd-quien__mark sd-quien__mark--br" />
      </div>

      <div className="sd-quien__body">
        <h2 className="sd-quien__headline" ref={headlineRef}>
          {HEADLINE}
        </h2>

        <div className="sd-quien__aside">
          <p className="sd-quien__lede" ref={ledeRef}>
            {LEDE}
          </p>

          <div className="sd-quien__actions" ref={actionsRef}>
            <a
              className="sd-btn sd-btn--primary"
              href={sdInscripcionUrl('para-quien')}
              target="_blank"
              rel="noopener noreferrer"
            >
              Inscribirme
            </a>
            {/* Apunta a `#que-pasa`, que es la sección "La experiencia" (`SdExperiencia`). */}
            <a className="sd-btn sd-btn--ghost" href="#que-pasa">
              Conocé el evento
            </a>
          </div>
        </div>
      </div>

      {/* Banda de logos. Las dos reglas van como elementos propios y no como `border` del
          contenedor porque el timeline las dibuja con `scaleX`: escalando el contenedor se
          aplastarían también los logos de adentro. */}
      <div className="sd-quien__logos">
        <span className="sd-quien__rule sd-quien__rule--band-top" aria-hidden />
        <span className="sd-quien__rule sd-quien__rule--band-bottom" aria-hidden />

        <div
          className="sd-quien__marquee"
          ref={marqueeRef}
          role="group"
          aria-label="Marcas en el piso"
        >
          <ul className="sd-quien__logo-row">
            {LOOP.map((logo, i) => {
              /* La segunda vuelta es la copia que cierra el loop: se esconde de lectores de
                 pantalla y se saca del tabulado para no repetir las 35 marcas dos veces. */
              const copia = i >= LOGOS.length;
              const contenido = logo.src ? (
                /* Sin `loading="lazy"` a propósito: el navegador decide qué diferir por la
                   posición de LAYOUT, y en un track que se mueve por `transform` todas las marcas
                   quedan fuera de pantalla para siempre según ese criterio. Medido: a los 9s de
                   animación seguían sin cargar 49 de 62, o sea que entraban en blanco. El costo
                   real es cercano a cero igual, porque son los mismos archivos que el carrusel de
                   "Confirmadas" pide unas líneas más abajo. */
                <img src={logo.src} alt={logo.name} decoding="async" />
              ) : (
                <span className="sd-quien__logo-text">{logo.name}</span>
              );
              const clase = `sd-quien__logo${logo.chip ? ' sd-quien__logo--chip' : ''}`;

              return (
                <li key={`${logo.id}-${i}`} className="sd-quien__logo-cell" aria-hidden={copia}>
                  <span className="sd-quien__logo-sep" aria-hidden />
                  {logo.href ? (
                    <a
                      className={clase}
                      href={logo.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      tabIndex={copia ? -1 : undefined}
                      title={logo.name}
                    >
                      {contenido}
                    </a>
                  ) : (
                    <span className={clase}>{contenido}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
