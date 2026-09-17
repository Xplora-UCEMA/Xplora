/**
 * Landing exclusiva startupday.xploraucema.com — funnel Startup Day.
 */
import { useEffect, useState } from 'react';
import { useSiteMedia } from '../context/SiteMediaContext';
import { DEFAULT_LOGO_URL } from '../lib/defaultsMedia';
import { MAIN_SITE_URL, STARTUP_DAY_CANONICAL } from '../lib/startupDayHost';
import {
  SD_COMING_SOON,
  // SD_STARTUPMATE,  ← ver "StartupMate: sección OCULTA" más abajo
} from '../data/startupDay';
import { SdShell } from '../components/startup-day/SdShell';
import { SdExperiencia } from '../components/startup-day/SdExperiencia';
import { SdManifesto } from '../components/startup-day/SdManifesto';
import { SdMarcas } from '../components/startup-day/SdMarcas';
import { SdMedia } from '../components/startup-day/SdMedia';
import { SdCharlas } from '../components/startup-day/SdCharlas';
import { SdTestimonios } from '../components/startup-day/SdTestimonios';
import { SdCountdown } from '../components/startup-day/SdCountdown';
import { SD_RECAP } from '../data/startupDayRecap';
import { StartupDayComingSoon } from '../components/startup-day/StartupDayComingSoon';
import { StartupDayCursor } from '../components/startup-day/StartupDayCursor';
import { SdAsciiDisc } from '../components/startup-day/SdAsciiDisc';
import { SdAsciiCampo } from '../components/startup-day/SdAsciiCampo';
import { SdSponsorStrip } from '../components/startup-day/SdSponsorStrip';
import '../styles/startupDay.css';

/* ── StartupMate: sección OCULTA a pedido ────────────────────────────────────────
   Para volver a mostrarla hay que descomentar TRES cosas, no sólo el bloque de abajo:
   el import de `SD_STARTUPMATE`, la constante `SD_STARTUPMATE_TAGS`, y el link
   `#startupmate` del footer en `SdShell.tsx`. Los estilos (`.sd-smate*`) quedaron
   intactos en `startupDay.css`. */
/* Tags decorativos de la sección StartupMate — ilustran ejes de matching, no una UI real.
const SD_STARTUPMATE_TAGS: readonly { label: string; x: number; y: number; d: number }[] = [
  { label: 'Founder', x: 6, y: 18, d: 0 },
  { label: 'Technical', x: 78, y: 12, d: 0.6 },
  { label: 'Idea temprana', x: 14, y: 68, d: 1.2 },
  { label: 'Busca equipo', x: 70, y: 74, d: 0.3 },
  { label: 'Producto en marcha', x: 42, y: 8, d: 0.9 },
];
*/

function useComingSoonGate() {
  const [gated, setGated] = useState(SD_COMING_SOON);
  useEffect(() => {
    if (!SD_COMING_SOON) {
      setGated(false);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    setGated(params.get('preview') !== '1');
  }, []);
  return gated;
}

export default function StartupDay() {
  const { logoUrl } = useSiteMedia();
  const brandLogo = logoUrl || DEFAULT_LOGO_URL;
  const comingSoon = useComingSoonGate();
  const [loaderDone, setLoaderDone] = useState(false);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = comingSoon
      ? 'Startup Day — Pronto · Xplora UCEMA'
      : 'Startup Day — Xplora UCEMA';
    if (comingSoon) {
      document.documentElement.classList.add('sd-mode', 'sd-coming-soon');
    }

    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const prevHref = canonical?.href ?? '';
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = STARTUP_DAY_CANONICAL;

    const metaDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const prevDesc = metaDesc?.content ?? '';
    if (metaDesc) {
      metaDesc.content = comingSoon
        ? 'Startup Day by Xplora UCEMA. Lo estamos construyendo — pronto disponible. 11 de septiembre 2026. Entrada 100% gratuita.'
        : 'Así fue el Startup Day by Xplora UCEMA: 40 stands, 14 charlas y workshops y cinco horas en Av. Alem 882. Mirá el recap y enterate de la próxima edición.';
    }

    const t = comingSoon ? undefined : window.setTimeout(() => setLoaderDone(true), 900);
    if (comingSoon) setLoaderDone(true);

    return () => {
      if (t) window.clearTimeout(t);
      document.documentElement.classList.remove('sd-coming-soon');
      if (comingSoon) document.documentElement.classList.remove('sd-mode');
      document.title = prevTitle;
      if (canonical) canonical.href = prevHref || MAIN_SITE_URL;
      if (metaDesc) metaDesc.content = prevDesc;
    };
  }, [comingSoon]);

  if (comingSoon) {
    return (
      <div className="sd-root is-loaded">
        <StartupDayCursor />
        <StartupDayComingSoon logoUrl={brandLogo} />
      </div>
    );
  }

  return (
    <SdShell
      active="startupday"
      showLoader
      loaderDone={loaderDone}
      cta={{ label: 'Avisame de la próxima', href: '#proxima' }}
    >
      <StartupDayContent />
    </SdShell>
  );
}

function StartupDayContent() {
  return (
    <>
      <section className="sd-hero">
        {/* Un solo barrido de ASCII cruzando el hero entero, detrás de todo.

            Eran dos manchas en las esquinas, con la celda en 11-12px: a ese tamaño los caracteres
            se leen como dos parches pegados y no como atmósfera. Ahora es un campo a sangre con la
            celda a la mitad —textura fina en vez de bloques— y el piso de densidad bien alto, así
            que sólo sobreviven las crestas del patrón y entre glifo y glifo se ve el fondo.

            `flujo` porque es el único de los cinco que da bandas largas en diagonal, que es la
            forma que tiene el barrido de la referencia. El disco no se toca: es otra cosa. */}
        <SdAsciiCampo
          className="sd-hero__campo"
          patron="flujo"
          opacity={0.75}
          celda={5}
          corte={0.66}
          pico={3}
        />

        <div className="sd-hero__grid">
          <div className="sd-hero__content">
            {/* Píldora de contexto arriba del wordmark. El dato sale de `SD_RECAP.kicker`, que ya
                lo dice en la lámina del recap: escribirlo de nuevo acá es garantizar que un día
                digan fechas distintas. */}
            <p className="sd-hero__kicker">{SD_RECAP.kicker}</p>

            {/* Logo de key art en vez de texto seteado en CSS: después de varias vueltas afinando
                itálica/tracking/glow a mano para igualar el banner, se usa directamente el
                wordmark que ya viene diseñado así. */}
            <h1 className="sd-hero__title">
              <img
                className="sd-hero__title-img"
                src="/logos/startup-day/startup-day-wordmark.png?v=1"
                alt="Startup Day"
              />
            </h1>

            {/* Que el evento ya pasó lo dice el verbo del lede y nada más. Antes lo decían
                además un sello ("Edición 01 — terminada") y dos hitos con las fechas de ida y
                vuelta: tres veces el mismo mensaje. */}
            <p className="sd-hero__lede">
              Se hizo el mayor evento para startups y builders del año. Esto es lo que pasó.
            </p>

            <div className="sd-hero__actions">
              <a className="sd-btn sd-btn--primary" href="#recap">
                Ver el recap
              </a>
              {/* Marcas de esquina en vez de borde completo: mismo tratamiento que el secundario
                  de la referencia, y el mismo lenguaje que las cruces de registro de la rejilla. */}
              <a className="sd-btn sd-btn--esquinas" href="#charlas">
                De qué se habló
              </a>
            </div>

            {/* Ocupa el lugar que tenía el reloj al pie del hero. Un contador gigante arriba de
                todo le daba a una fecha sin confirmar más peso del que tiene; como tarjeta, el
                dato es el mismo y el llamado queda donde se puede actuar: `#proxima`, que es
                donde se deja el mail. */}
            <a className="sd-hero__nota" href="#proxima">
              <span className="sd-hero__nota-kicker">Próxima edición</span>
              <span className="sd-hero__nota-titulo">
                Avisame primero
                <svg viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
                  <path d="M5 12h13M12 5l7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
                </svg>
              </span>
              <span className="sd-hero__nota-copy">
                Dejá tu mail y te escribimos apenas haya fecha.
              </span>
            </a>
          </div>

          <SdAsciiDisc className="sd-hero__disc" />
        </div>
      </section>

      {/* PEGADO AL HERO, y no es una preferencia de orden: `.sd-sponsor-band::before` dibuja la
          cola del wash como `radial-gradient(… at 0% -14dvh …)`, y ese `-14dvh` cae sobre el
          mismo punto que la elipse del hero (86% de una caja de 100dvh) SÓLO si esta banda
          arranca exactamente en 100dvh. Metiendo cualquier sección en el medio, el hero queda
          con medio wash cortado a pico y acá aparece una elipse violeta flotando sin origen. */}
      <div id="sponsors" className="sd-sponsor-band">
        <SdSponsorStrip />
      </div>

      {/* El recap vive DENTRO de `SdManifesto`: esa lámina ya era la pieza más fuerte de la
          página —fondo ASCII, marco técnico y el titular del Figma— y lo único que le sobraba
          era la banda de logos, que se reemplazó por los números. Por eso no hay una sección
          de recap aparte: sería repetir el mismo contenido con menos diseño.

          Abre en `--sd-void` porque es con el que cierra `.sd-sponsor-band` justo arriba, y
          termina en `--sd-ink` para `SdExperiencia`. Otra costura que depende del orden. */}
      <SdManifesto />

      {/* Quiénes vinieron. Es la banda que antes remataba la lámina: como sección propia deja de
          ser decoración y pasa a ser la prueba del recap. */}
      <SdMarcas />

      {/* El registro del día y quiénes lo hicieron. Va después de las marcas porque primero se
          dice quiénes vinieron y después se muestra. */}
      <SdMedia />

      <SdExperiencia />

      {/* De qué se habló. Era la grilla horaria fusionada al piso; ahora es sección propia,
          porque pasó de ser un itinerario a ser contenido. */}
      <SdCharlas />

      {/* Qué dijeron. Va último del recap y antes del cierre: es la prueba de terceros, y sólo
          pesa después de que la página ya contó qué pasó. Si todavía no hay posteos cargados el
          componente devuelve `null` y acá no queda nada — ver `startupDayTestimonios.ts`. */}
      <SdTestimonios />

      {/* StartupMate — OCULTA. Ver la nota arriba del archivo para volver a mostrarla.
      <section id="startupmate" className="sd-band sd-band--purple-wash sd-smate">
        <div className="sd-smate__tags" aria-hidden>
          {SD_STARTUPMATE_TAGS.map((t) => (
            <span
              key={t.label}
              className="sd-smate__tag"
              style={{ ['--x' as string]: t.x, ['--y' as string]: t.y, ['--d' as string]: t.d }}
            >
              {t.label}
            </span>
          ))}
        </div>

        <SdReveal className="sd-smate__inner">
          <p className="sd-kicker">{SD_STARTUPMATE.kicker}</p>
          <h2 className="sd-smate__headline">
            <span>Encontrá</span>
            <span className="sd-smate__headline-accent">a tu cofounder</span>
          </h2>
          <p className="sd-smate__name">{SD_STARTUPMATE.name}</p>
          <p className="sd-smate__tagline">{SD_STARTUPMATE.tagline}</p>
          <p className="sd-lead">{SD_STARTUPMATE.lead}</p>
          <p className="sd-smate__note">
            <span className="sd-smate__pulse" aria-hidden />
            {SD_STARTUPMATE.note}
          </p>
        </SdReveal>
      </section>
      */}

      {/* Cierre. Ocupa el lugar de `#reservar`, que era la sección de inscripción al formulario
          de Microsoft: cerrada la edición ese link no tiene destino, y el único llamado que
          queda es dejar el mail para la próxima. Nada apunta ya al id viejo. */}
      <SdCountdown />
    </>
  );
}
