/**
 * Qué se habló en cada charla.
 *
 * Reemplaza a `StartupDayAgenda`, que era la grilla horaria de dos aulas en paralelo. Esa grilla
 * resolvía un problema de antes del evento —dónde tengo que estar y a qué hora— y después no dice
 * nada: nadie va a decidir a cuál entrar. Lo que sí queda es el contenido.
 *
 * **Dos columnas, una por aula, con cada charla plegada.** Antes era una lista de catorce filas
 * abiertas y no se terminaba más de scrollear. Plegadas entran las siete de cada aula en una
 * pantalla, y la estructura del día —dos salas en paralelo— se lee de una sin explicarla.
 *
 * El acordeón sigue el patrón de `SdExperiencia`: `aria-expanded` + `aria-controls`, el cuerpo
 * montado siempre y colapsado con `grid-template-rows: 0fr` en vez de `display: none`, así el
 * contenido sigue en el árbol de accesibilidad y la apertura se puede animar.
 *
 * A diferencia de aquél, acá **puede no haber ninguna abierta**: son dos columnas y forzar una
 * activa por lado dejaría dos bloques abiertos de entrada, que es justo el largo que se quería
 * evitar.
 */
import { useState } from 'react';
import { LOGO, SD_AULAS, SD_CHARLAS, type SdCharla } from '../../data/startupDay';
import { escalaDeLogo } from '../../data/startupDayEscalas';
import { idDeCharla } from '../../data/startupDayStands';
import { SdReveal } from './SdReveal';

/** Las charlas de un aula, en orden de reloj. */
function charlasDe(aula: string): SdCharla[] {
  return SD_CHARLAS.filter((c) => c.aula === aula).sort((a, b) => a.from.localeCompare(b.from));
}

function Flecha() {
  return (
    <svg className="sd-charlas__chevron" viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
    </svg>
  );
}

function Columna({ aula, label }: { aula: string; label: string }) {
  const charlas = charlasDe(aula);
  /* `null` = todas plegadas. Ver la nota de arriba sobre por qué no arranca con una abierta. */
  const [abierta, setAbierta] = useState<string | null>(null);

  return (
    <div className="sd-charlas__col">
      <h3 className="sd-charlas__aula">
        {label}
        <span>{charlas.length} charlas</span>
      </h3>

      <ul className="sd-charlas__lista">
        {charlas.map((c) => {
          const id = `${aula}-${c.from.replace(':', '')}`;
          const open = abierta === id;
          return (
            <li key={id} className={`sd-charlas__item${open ? ' is-open' : ''}`}>
              <button
                type="button"
                className="sd-charlas__trigger"
                aria-expanded={open}
                aria-controls={`sd-charla-${id}`}
                onClick={() => setAbierta(open ? null : id)}
              >
                <span className="sd-charlas__marca">
                  {c.logo ? (
                    <img
                      className={`sd-charlas__logo${c.logoEnColor ? ' is-color' : ''}`}
                      src={LOGO(c.logo)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      /* La misma corrección óptica que el slider. Sin ella esta columna tenía el
                         mismo problema: FUD y PASITO enormes al lado de un TQe diminuto, porque
                         `max-height` mide el ARCHIVO y cada archivo trae su propio padding. */
                      style={{ ['--escala' as string]: escalaDeLogo(idDeCharla(c.logo)) }}
                    />
                  ) : null}
                </span>

                <span className="sd-charlas__texto">
                  <span className="sd-charlas__nombre">{c.name}</span>
                  {c.speaker ? <span className="sd-charlas__speaker">{c.speaker}</span> : null}
                </span>

                <time className="sd-charlas__hora" dateTime={c.from}>
                  {c.from}
                </time>
                <Flecha />
              </button>

              <div id={`sd-charla-${id}`} className="sd-charlas__panel" role="region">
                <div className="sd-charlas__panel-inner">
                  {c.temas?.length ? (
                    <ul className="sd-charlas__temas">
                      {c.temas.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  ) : (
                    /* Sin resumen todavía. Se dice, en vez de abrir un panel vacío: son charlas
                       reales de gente real y no se inventa de qué hablaron. */
                    <p className="sd-charlas__pendiente">
                      Estamos sumando el detalle de esta charla.
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SdCharlas() {
  return (
    <section id="charlas" className="sd-band sd-band--ink sd-charlas">
      <SdReveal className="sd-charlas__head">
        <div className="sd-charlas__masthead">
          <h2 className="sd-charlas__title">De qué se habló</h2>
        </div>
        <p className="sd-charlas__lead">
          {SD_CHARLAS.length} charlas y workshops en dos aulas en paralelo, de 15:30 a 20.
          Tocá una para ver de qué se habló.
        </p>
      </SdReveal>

      <SdReveal className="sd-charlas__grid" delay={1}>
        {SD_AULAS.map((a) => (
          <Columna key={a.id} aula={a.id} label={a.label} />
        ))}
      </SdReveal>
    </section>
  );
}
