/**
 * Slider de las marcas que estuvieron en el Startup Day.
 *
 * Es la banda que vivía al pie de la lámina "No importa quién sos" antes del recap, recuperada
 * como sección propia: allá servía de remate decorativo y acá es contenido —la prueba de quiénes
 * vinieron—, así que se muestra con su propio título y a ancho completo.
 *
 * **Dos filas cruzadas.** Las 48 marcas se parten al medio y cada mitad desfila en sentido
 * contrario. Con una sola fila, 48 logos tardaban una eternidad en dar la vuelta y el ancho
 * quedaba flojo; cruzadas, siempre hay movimiento en los dos ejes de lectura y la sección se
 * siente llena. Tampoco hay ya líneas entre marca y marca: separaban bien pero le daban aire de
 * listado, y el ritmo ahora lo sostiene el espacio.
 *
 * **Por qué `scrollLeft` y no un `@keyframes`.** El desfile mueve `scrollLeft` cuadro a cuadro en
 * vez de correr el track con `transform: translateX()`. Eso lo convierte en un contenedor
 * scrolleable de verdad: la rueda horizontal, el trackpad y el swipe táctil funcionan solos, con
 * la inercia nativa del navegador, y el arrastre con el mouse se suma acá. Con `transform` nada
 * de eso existía: la banda sólo se podía mirar pasar.
 *
 * Cada track va duplicado, así que el ciclo cierra devolviendo `scrollLeft` media vuelta al
 * pasarse de largo — en los dos sentidos, para que arrastrar hacia atrás también dé la vuelta en
 * vez de topar contra el cero.
 */
import { useEffect, useRef } from 'react';
import { marcasDelEvento } from '../../data/startupDayStands';
import { escalaDeLogo } from '../../data/startupDayEscalas';
import { SdReveal } from './SdReveal';

/**
 * Las marcas del evento: las 40 con stand, en orden de recorrido, más las ocho que sólo dieron
 * charla. Se calcula una vez a nivel módulo — recorre el plano entero y no cambia nunca.
 */
const MARCAS = marcasDelEvento();

/**
 * Las que el blanqueo por filtro arruinaría, y que por eso se muestran tal cual sobre su chip:
 * Datricas es bitono —su círculo se aplastaría contra el wordmark— y Renderahouse trae fondo
 * negro propio, que quedaría como un bloque blanco.
 */
const SIN_BLANQUEO = new Set(['datricas', 'renderahouse']);

const LOGOS = MARCAS.map((m) => ({
  id: m.id,
  name: m.name,
  src: m.logoUrl,
  /* Sin blanquear: o porque el archivo trae fondo propio y el filtro lo dejaría como una mancha
     (`logoEnColor`, que es lo que le pasaba a Mercado Libre), o porque es bitono y el blanqueo lo
     aplastaría (`SIN_BLANQUEO`). */
  chip: SIN_BLANQUEO.has(m.id) || Boolean(m.logoEnColor),
  /* Corrección de tamaño óptico — ver `startupDayEscalas.ts`. */
  escala: escalaDeLogo(m.id),
  href: m.href,
}));

/* Partidas al medio, una mitad por fila. El corte va por el medio del recorrido y no alternando
   una sí una no, para que cada fila conserve el orden en que se caminaba el piso. */
const MITAD = Math.ceil(LOGOS.length / 2);
const FILAS = [LOGOS.slice(0, MITAD), LOGOS.slice(MITAD)];

/**
 * Cuántos segundos tarda un track en recorrerse solo, media vuelta. Escala con la cantidad de
 * marcas de esa fila para que la velocidad de paso no dependa de cuántas haya.
 */
const SEGUNDOS_POR_VUELTA = MITAD * 3.2;

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

/**
 * Pone una banda a desfilar y devuelve su limpieza.
 *
 * Estaba escrito inline dentro del `useEffect` y asumía un único contenedor. Al pasar a dos filas
 * hubo que sacarlo acá afuera: las dos comparten toda la mecánica y lo único que cambia es
 * `sentido`, que multiplica el avance del desfile automático (+1 hacia la izquierda, −1 hacia la
 * derecha). El arrastre y la inercia quedan iguales en las dos.
 */
function montarBanda(el: HTMLElement, sentido: 1 | -1): () => void {
  const quieto = window.matchMedia('(prefers-reduced-motion: reduce)');
  /* Pausa mientras el puntero está encima o el foco adentro: los logos son links y hay que
     poder alcanzarlos. */
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
   * El foco enciende a la marca que está pasando por el centro de la banda y apaga a las de los
   * costados, así que el efecto viaja solo con el desfile: sin tocar nada, siempre hay algo
   * cambiando. La inclinación va con la velocidad y es lo que hace que un tirón se sienta — a
   * velocidad de crucero es de una fracción de grado, imperceptible.
   *
   * Se escribe `transform` y `opacity`, las dos propiedades que el compositor resuelve sin
   * recalcular layout, y sólo sobre las celdas que están a tiro de la ventana.
   */
  const celdas = Array.from(el.querySelectorAll<HTMLElement>('.sd-marcas__logo'));
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
    encima = (e.target as Element | null)?.closest<HTMLElement>('.sd-marcas__logo') ?? null;
  };

  const pintar = (velocidad: number) => {
    if (quieto.matches || centros.length !== celdas.length) return;
    const centro = el.scrollLeft + el.clientWidth / 2;
    const radio = el.clientWidth * RADIO_FOCO;
    const alcance = el.clientWidth * 0.75;
    const inclinacion = Math.max(-1, Math.min(1, velocidad / VELOCIDAD_TOPE)) * -INCLINACION_MAX;
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

  /* El ancho de las celdas cambia con `--sd-marcas-k`, que está atado a `vw`. */
  const ro = new ResizeObserver(medir);
  ro.observe(el);

  /**
   * La posición del desfile, en punto flotante y llevada acá en vez de leerla de `scrollLeft`.
   *
   * `scrollLeft` redondea a entero al leerlo, así que el patrón `el.scrollLeft += avance` pierde
   * la fracción en cada cuadro. A 60fps el avance es ~1px y sobrevive al redondeo, pero el
   * cálculo depende del framerate: a 200fps son 0,29px por cuadro, el getter devuelve siempre el
   * mismo entero y la banda queda clavada. Pasa en cualquier pantalla de alta frecuencia
   * (120/240Hz), no es un caso de laboratorio. Cada fila lleva el suyo.
   */
  let pos = el.scrollLeft;

  /* La fila que va hacia la derecha arranca del final: con `scrollLeft` en 0 no tiene hacia dónde
     retroceder y el primer cuadro daría un salto de media vuelta al envolver. */
  if (sentido === -1) {
    pos = media();
    el.scrollLeft = pos;
  }

  let raf = requestAnimationFrame(function paso(t: number) {
    /* Techo al delta: al volver de una pestaña en segundo plano, el salto acumulado movería la
       banda media vuelta de un cuadro al otro. */
    const dt = Math.min(0.05, (t - ultimoT) / 1000);
    ultimoT = t;

    /* Si algo movió el scroll por fuera del loop —rueda, trackpad, arrastre— hay que engancharse
       a ese valor en vez de pisarlo con la posición vieja. */
    if (Math.abs(el.scrollLeft - pos) > 1.5) pos = el.scrollLeft;

    const previo = pos;
    if (inercia !== 0) {
      pos += inercia * dt;
      inercia *= Math.pow(0.02, dt);
      if (Math.abs(inercia) < 6) inercia = 0;
    } else if (!detenida && !quieto.matches) {
      pos += sentido * (media() / SEGUNDOS_POR_VUELTA) * dt;
    }

    const m = media();
    if (m > 0) {
      if (pos >= m) pos -= m;
      else if (pos < 0) pos += m;
    }
    el.scrollLeft = pos;

    /* La velocidad se mide sobre lo que efectivamente se movió, no sobre lo que se pidió. */
    pintar(dt > 0 ? (pos - previo) / dt : 0);
    raf = requestAnimationFrame(paso);
  });

  /* Sólo el mouse se arrastra a mano. En touch el navegador ya scrollea el contenedor y le pone
     su propia inercia; interceptarlo sería pelearle y perder. */
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
    /* Tope a la inercia: un tirón corto y rápido puede dar miles de px/s y la banda se volvería
       ilegible. */
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
}

type Logo = (typeof LOGOS)[number];

function Banda({ logos, sentido }: { logos: Logo[]; sentido: 1 | -1 }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return montarBanda(el, sentido);
  }, [sentido]);

  /* Duplicada: el desfile devuelve el scroll media vuelta al pasar de largo, y así cierra sin
     salto. La segunda vuelta se esconde de lectores de pantalla y del tabulado. */
  const loop = [...logos, ...logos];

  return (
    <div className="sd-marcas__marquee" ref={ref} role="group" aria-hidden="true">
      <ul className="sd-marcas__row">
        {loop.map((logo, i) => {
          const copia = i >= logos.length;
          const contenido = logo.src ? (
            /* Sin `loading="lazy"` a propósito: el navegador decide qué diferir por la posición
               de LAYOUT, y en un track que se mueve todas las marcas quedan fuera de pantalla
               para siempre según ese criterio — entrarían en blanco. */
            <img src={logo.src} alt={logo.name} decoding="async" />
          ) : (
            <span className="sd-marcas__logo-text">{logo.name}</span>
          );
          const clase = `sd-marcas__logo${logo.chip ? ' sd-marcas__logo--chip' : ''}`;

          return (
            <li
              key={`${logo.id}-${i}`}
              className="sd-marcas__cell"
              /* La escala se aplica al `<img>` vía esta variable y NO con `transform`: el efecto
                 de foco escribe `transform` inline sobre `.sd-marcas__logo` cuadro a cuadro y se
                 pisarían. Ver `.sd-marcas__logo img` en el CSS. */
              style={{ ['--escala' as string]: logo.escala }}
            >
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
  );
}

export function SdMarcas() {
  return (
    <section id="marcas" className="sd-band sd-band--ink sd-marcas">
      <SdReveal className="sd-marcas__head">
        <div className="sd-marcas__masthead">
          <h2 className="sd-marcas__title">Quiénes vinieron</h2>
        </div>
        <p className="sd-marcas__lead">
          {LOGOS.length} marcas entre stands y workshops. Arrastrá las bandas para recorrerlas.
        </p>
      </SdReveal>

      {/* Las dos bandas van `aria-hidden`: entre las copias del loop repetirían 96 nombres, y la
          lista completa y ordenada ya la tiene quien lea la página con lector de pantalla en la
          nómina de abajo. */}
      <Banda logos={FILAS[0]!} sentido={1} />
      <Banda logos={FILAS[1]!} sentido={-1} />

      <ul className="sd-marcas__nomina">
        {LOGOS.map((l) => (
          <li key={l.id}>{l.name}</li>
        ))}
      </ul>
    </section>
  );
}
