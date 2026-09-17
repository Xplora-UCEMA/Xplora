import { SD_DAY_STORY } from '../../data/startupDay';
import { type PatronAscii } from './ascii';
import { SdAsciiCampo } from './SdAsciiCampo';
import { SdReveal } from './SdReveal';

/**
 * "La experiencia" — bento de cuatro celdas.
 *
 * Cuarta versión de esta sección. Fue cuatro filas a sangre, después un panel con sombra y
 * degradado, y hasta recién un acordeón: una fila abierta por vez, las otras tres reducidas a su
 * título.
 *
 * El acordeón se fue por dos razones. La de forma: `#charlas`, acá nomás abajo, TAMBIÉN es un
 * acordeón, y son catorce charlas contra cuatro pilares — ahí el patrón se gana el lugar porque
 * sin plegar no se termina de scrollear más, y acá no. Repetirlo dos secciones seguidas hacía
 * parecer que la página tiene un solo recurso. La de fondo: los cuatro pilares son cuatro hechos
 * cortos del día, no cuatro opciones entre las que elegir; plegarlos escondía tres cuartos del
 * contenido para ahorrar un espacio que sobraba.
 *
 * El bento los muestra los cuatro a la vez, con pesos distintos —dos celdas anchas y dos
 * angostas— para que la grilla tenga ritmo en vez de ser cuatro cajas iguales.
 *
 * **El contenido no cambió**: siguen siendo los mismos cuatro `SD_DAY_STORY.pillars`.
 */

/**
 * Qué campo de ASCII lleva de fondo cada celda, en el orden de los pilares.
 *
 * No son decorativos al azar: cada uno ilustra su celda. Una retícula lee como plano de piso
 * (Stands), una espiral como algo que crece desde un centro (Startups), ondas concéntricas como
 * algo que se propaga (Workshops) y puntos sueltos como gente suelta (Networking).
 *
 * Van todos en `animado={false}`: se pintan UNA vez y no vuelven a dibujar. Cuatro canvas estáticos
 * cuestan lo que cuatro imágenes, que es el presupuesto que esta página puede pagar.
 */
const CAMPOS: readonly PatronAscii[] = ['malla', 'espiral', 'onda', 'disperso'];

export function SdExperiencia() {
  return (
    <section id="que-pasa" className="sd-band sd-band--ink sd-exp">
      <SdReveal className="sd-exp__head">
        <h2 className="sd-exp__title">{SD_DAY_STORY.title}</h2>
      </SdReveal>

      <SdReveal delay={1} className="sd-exp__bento">
        {SD_DAY_STORY.pillars.map((pillar, i) => (
          <article key={pillar.tag} className={`sd-exp__celda sd-exp__celda--${i + 1}`}>
            <SdAsciiCampo
              className="sd-exp__campo"
              patron={CAMPOS[i] ?? 'flujo'}
              animado={false}
              opacity={0.32}
              /* Misma celda chica que las tiras del hero: a 10px la trama se leía como bloques.
                 Todo el ASCII de fondo de la página está en este orden de tamaño. */
              celda={5}
              /* Fases distintas: con la misma, cuatro campos estáticos del mismo patrón saldrían
                 calcados. Acá además cambia el patrón, pero `disperso` y `malla` son sensibles a
                 la fase y conviene que no arranquen todos en cero. */
              fase={i * 7}
              corte={0.3}
              pico={4}
            />

            <div className="sd-exp__celda-cuerpo">
              <span className="sd-exp__num">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="sd-exp__name">{pillar.tag}</h3>
              <p className="sd-exp__copy">{pillar.text}</p>
            </div>
          </article>
        ))}
      </SdReveal>

      {/* Mismo par que cierra "No importa quién sos": el primario fuerte y el secundario claro. */}
      <SdReveal delay={2} className="sd-exp__actions">
        {/* Cerrada la primera edición el formulario ya no acepta altas: el llamado pasa a ser
            el contador de la próxima. Ver la misma sustitución en `SdManifesto` y el hero. */}
        <a className="sd-btn sd-btn--primary" href="#proxima">
          Avisame de la próxima
        </a>
        {/* Apuntaba a `#piso` ("El lugar", el render 3D), que se sacó de la página. */}
        <a className="sd-btn sd-btn--ghost" href="#charlas">
          De qué se habló
        </a>
      </SdReveal>
    </section>
  );
}
