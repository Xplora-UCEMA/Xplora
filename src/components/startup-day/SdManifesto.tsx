/**
 * El recap de la edición, sobre la lámina técnica del Figma (`Zettios` 368:83).
 *
 * La lámina se diseñó para invitar a un evento que todavía no había pasado: titular grande a la
 * izquierda, copy de apoyo y CTAs a la derecha, y una banda de logos al pie, todo dentro de un
 * marco de hairlines con marcas de esquina sobre negro casi total. Pasada la primera edición se
 * reusa entera —fondo, marco y titular son la sección— pero **la banda de logos se reemplazó por
 * los números del recap**: con el evento hecho, un desfile de marcas pasando dice menos que los
 * seis datos de lo que efectivamente ocurrió.
 *
 * Eso se llevó puesta toda la maquinaria de la banda (scroll cuadro a cuadro, arrastre con
 * inercia, wrap del track duplicado, foco por distancia al centro e inclinación por velocidad):
 * ~190 líneas que existían para que un carrusel se sintiera vivo. Los números no se mueven, y no
 * hace falta que lo hagan.
 *
 * El "papel" de fondo es el compás de Xplora tramado en ASCII (`bg-ascii.webp`, el mismo asset
 * del Figma reescalado de 2508px/8,2 MB a 1100px/59 KB — va al 20% de opacidad sobre negro, así
 * que la diferencia no se ve). Es imagen y no un canvas como `SdAsciiDisc` a propósito: acá es
 * textura quieta, no un elemento vivo, y no justifica un segundo canvas animado en la página.
 *
 * Mismo criterio de motion que antes: un solo árbol JSX ya en su posición final y el timeline
 * sólo toca opacity/transform. Sin JS — mobile, `prefers-reduced-motion`, o el primer frame — la
 * lámina ya está completa. Dispara una vez con IntersectionObserver.
 */
import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';

import { SD_RECAP } from '../../data/startupDayRecap';
import { SdStats } from './SdStats';

/**
 * El titular del Figma, intacto.
 *
 * Se escribió como invitación —"importa quién querés ser"— y en un recap podría sonar a destiempo.
 * Se queda igual porque sigue describiendo lo que pasó: quién entraba no lo definía el título
 * sino estar construyendo algo. Lo que cambia es el orden de lectura, no la frase: el kicker y el
 * lede de arriba dejan claro que el evento ya fue, y ésta cierra.
 */
const HEADLINE = 'No importa quién sos. Importa quién querés ser.';

function buildTimeline(els: {
  ascii: HTMLElement;
  glows: Element[];
  rules: Element[];
  headline: Element;
  lede: Element;
  actions: Element;
  stats: Element;
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
    .fromTo(els.headline, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.7 }, 0.45)
    .fromTo(els.lede, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5 }, 0.7)
    .fromTo(els.actions, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5 }, 0.85)
    /* Los números entran como bloque y no uno por uno: el conteo de cada uno ya es su propia
       animación (`Counter`), y encadenar un stagger encima haría que el último recién empiece a
       contar cuando los primeros ya terminaron. */
    .fromTo(els.stats, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5 }, 1.05);

  return tl;
}

export function SdManifesto() {
  const rootRef = useRef<HTMLElement>(null);
  const asciiRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const ledeRef = useRef<HTMLParagraphElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const firedRef = useRef(false);

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
    const stats = statsRef.current;
    if (!root || !ascii || !headline || !lede || !actions || !stats) return;

    const q = <T extends Element>(sel: string) => Array.from(root.querySelectorAll<T>(sel));
    const glows = q('.sd-quien__glow');
    /* Sólo quedan las dos de la banda de cifras: el marco de la lámina se sacó. */
    const rules = q('.sd-quien__rule');

    let tl: gsap.core.Timeline | undefined;
    const ctx = gsap.context(() => {
      tl = buildTimeline({ ascii, glows, rules, headline, lede, actions, stats });
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
    <section id="recap" className="sd-quien" ref={rootRef}>
      <div className="sd-quien__ascii" ref={asciiRef} aria-hidden />
      <div className="sd-quien__glow sd-quien__glow--tr" aria-hidden />
      <div className="sd-quien__glow sd-quien__glow--bl" aria-hidden />
      <div className="sd-quien__glow sd-quien__glow--cta" aria-hidden />

      {/* El marco privado de la lámina (dos reglas a sangre y las cuatro marcas de esquina) se
          fue: la rejilla de la página ya encuadra todas las secciones con la misma línea y las
          mismas cruces, y tener los dos sistemas encima daba líneas dobles — además, al achicar
          el padding de la sección, su regla superior terminaba cruzando el titular. */}

      <div className="sd-quien__body">
        <div className="sd-quien__lead-col">
          <p className="sd-quien__kicker">{SD_RECAP.kicker}</p>
          <h2 className="sd-quien__headline" ref={headlineRef}>
            {HEADLINE}
          </h2>
        </div>

        <div className="sd-quien__aside">
          <p className="sd-quien__lede" ref={ledeRef}>
            {SD_RECAP.lede}
          </p>

          <div className="sd-quien__actions" ref={actionsRef}>
            {/* Terminada la primera edición el CTA ya no va al formulario de inscripción
                —está cerrado— sino al contador de la próxima, que es donde se deja el mail. */}
            <a className="sd-btn sd-btn--primary" href="#proxima">
              Avisame de la próxima
            </a>
            {/* Apunta a `#que-pasa`, que es la sección "La experiencia" (`SdExperiencia`). */}
            <a className="sd-btn sd-btn--ghost" href="#que-pasa">
              Cómo fue el día
            </a>
          </div>
        </div>
      </div>

      {/* Los números, donde antes iba la banda de logos. Sólo llevan regla ARRIBA: la de abajo
          se sacó porque el borde inferior de la sección —que dibuja la rejilla— ya los cierra, y
          tener las dos dejaba una línea huérfana con un hueco debajo.

          Va como elemento propio y no como `border` del contenedor porque el timeline la dibuja
          con `scaleX`, y escalando el contenedor se aplastarían también los números. */}
      <div className="sd-quien__cifras" ref={statsRef}>
        <span className="sd-quien__rule sd-quien__rule--band-top" aria-hidden />
        <SdStats />
      </div>
    </section>
  );
}

