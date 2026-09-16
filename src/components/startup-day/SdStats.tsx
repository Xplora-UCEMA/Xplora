/**
 * Los números de la edición.
 *
 * El conteo animado sale de `components/Counter.tsx`, que ya existía en el sitio principal sin
 * usarse: mismo easing cúbico y mismo `toLocaleString('es-AR')` que el resto de Xplora. El
 * disparo va con `useInView` y no con `SdReveal` porque `Counter` necesita un booleano, no una
 * clase CSS — el `SdReveal` de afuera sigue haciendo la entrada del bloque.
 */
import { useMemo } from 'react';
import Counter from '../Counter';
import { useInView } from '../../hooks/useInView';
import { statsDelRecap } from '../../data/startupDayRecap';

export function SdStats() {
  const stats = useMemo(() => statsDelRecap(), []);
  const { ref, inView } = useInView(0.25);

  return (
    <ul className="sd-stats" ref={ref as React.RefObject<HTMLUListElement>}>
      {stats.map((s) => (
        <li key={s.id} className="sd-stats__item">
          <span className="sd-stats__value">
            {/* El signo va fuera del `Counter`: éste anima el número de 0 al valor final, así
                que un `+` adentro se leería como parte de la cifra que sube. */}
            {s.prefix ? <span className="sd-stats__prefix">{s.prefix}</span> : null}
            <Counter target={s.value} triggered={inView} />
            {s.suffix ? <span className="sd-stats__suffix">{s.suffix}</span> : null}
          </span>
          <span className="sd-stats__label">{s.label}</span>
        </li>
      ))}
    </ul>
  );
}
