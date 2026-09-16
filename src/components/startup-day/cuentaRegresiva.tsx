/**
 * El reloj de la próxima edición, compartido por el hero y la sección `#proxima`.
 *
 * Vivía entero dentro de `SdCountdown`. Se extrajo al sumar la barra del pie del hero: son dos
 * lugares que muestran exactamente la misma cuenta, y duplicar el tic habría dejado dos relojes
 * que se desincronizan a los pocos minutos.
 *
 * **La fecha no está cerrada**, y eso manda sobre la forma: el reloj es un ticker técnico y no
 * cartelería con la fecha grande, porque tiene que comunicar "faltan tantos" sin comprometer un
 * día concreto. Ninguna pieza de acá escribe el 11.09.2027.
 */
import { useEffect, useState } from 'react';

export type Restante = { dias: number; horas: number; minutos: number; segundos: number };

function restanteHasta(ts: number): Restante {
  const ms = Math.max(0, ts - Date.now());
  const s = Math.floor(ms / 1000);
  return {
    dias: Math.floor(s / 86400),
    horas: Math.floor((s % 86400) / 3600),
    minutos: Math.floor((s % 3600) / 60),
    segundos: s % 60,
  };
}

/**
 * Tic de un segundo con `setTimeout` encadenado y no `setInterval`.
 *
 * Un intervalo de 1000 ms deriva respecto del reloj —y en una pestaña de fondo el navegador lo
 * estrangula a 1/min, así que al volver el contador aparece atrasado. Recalcular contra
 * `Date.now()` en cada tic hace que el valor sea siempre correcto sin importar cuántos tics se
 * hayan perdido.
 *
 * Que el hero y `#proxima` monten cada uno su instancia es a propósito: son dos `setTimeout` por
 * segundo, y como los dos recalculan contra `Date.now()` muestran lo mismo sin coordinarse.
 * Compartirlo por contexto sería más máquina de la que ahorra.
 */
export function useCuentaRegresiva(ts: number): Restante {
  const [restante, setRestante] = useState(() => restanteHasta(ts));

  useEffect(() => {
    let id: number;
    const tic = () => {
      setRestante(restanteHasta(ts));
      /* Se alinea al próximo segundo de reloj para que el número no salte de a dos. */
      id = window.setTimeout(tic, 1000 - (Date.now() % 1000));
    };
    id = window.setTimeout(tic, 1000 - (Date.now() % 1000));
    return () => window.clearTimeout(id);
  }, [ts]);

  return restante;
}

const dosDigitos = (n: number) => String(n).padStart(2, '0');

/**
 * La línea `360d : 14h : 01m : 57s`, en mono y dentro de un marco fino.
 *
 * `compacto` la achica para el pie del hero, donde convive con el wordmark y no puede competirle.
 */
export function SdTicker({ ts, compacto = false }: { ts: number; compacto?: boolean }) {
  const { dias, horas, minutos, segundos } = useCuentaRegresiva(ts);

  const tramos = [
    { valor: String(dias), unidad: 'd' },
    { valor: dosDigitos(horas), unidad: 'h' },
    { valor: dosDigitos(minutos), unidad: 'm' },
    { valor: dosDigitos(segundos), unidad: 's' },
  ];

  return (
    /* El `aria-label` lleva el dato en prosa porque la línea leída carácter por carácter ("360 d
       dos puntos 14 h…") no dice nada; el contenido visible queda oculto al lector de pantalla. */
    <p
      className={`sd-cd__ticker${compacto ? ' sd-cd__ticker--compacto' : ''}`}
      role="timer"
      aria-label={`Faltan ${dias} días para la próxima edición`}
    >
      <span aria-hidden>
        {tramos.map((t, i) => (
          <span key={t.unidad} className="sd-cd__tramo">
            {i > 0 ? <span className="sd-cd__sep">:</span> : null}
            {/* `tabular-nums` (ver CSS): los días pasan de 3 a 2 dígitos y los segundos cambian
                todo el tiempo; sin ancho fijo de cifra la línea entera se corre sola. */}
            <span className="sd-cd__val">{t.valor}</span>
            <span className="sd-cd__u">{t.unidad}</span>
          </span>
        ))}
      </span>
    </p>
  );
}
