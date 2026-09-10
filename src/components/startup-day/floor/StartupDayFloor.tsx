/**
 * Sección del render 3D del piso.
 *
 * El chunk de `three` pesa más que el resto de la landing junta, así que la escena:
 *   1. se importa con `React.lazy` (chunk aparte),
 *   2. no se monta hasta que la sección está por entrar en pantalla,
 *   3. reintenta el import si falla y, si ni así carga, la sección se apoya sólo en la lista
 *      de salas: el viewport no se monta y no queda ni caja vacía ni aviso de error.
 *
 * La identificación de cada sala vive acá, en HTML al costado del canvas, y no dentro del
 * render: pintar los muros de colores para distinguirlas hacía que la maqueta pareciera de
 * plástico. La lista y el 3D se resaltan mutuamente.
 */
import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react';
import { HALL, SALAS, detalleDe, mesasDeSala, type Sala } from '../../../data/startupDayFloor';

/**
 * Un import dinámico que falla casi siempre falla por algo pasajero: un corte de red o —el
 * caso frecuente— un deploy nuevo que dejó el HTML viejo apuntando a un hash de chunk que ya
 * no existe. Por eso se reintenta antes de darlo por perdido; recién si los tres intentos
 * fallan el error sube al `LimiteDeError`.
 */
const ESPERAS_MS = [400, 1200];

function importarEscena(intento = 0): Promise<typeof import('./FloorScene')> {
  return import('./FloorScene').catch((e) => {
    if (intento >= ESPERAS_MS.length) throw e;
    return new Promise<void>((listo) => setTimeout(listo, ESPERAS_MS[intento])).then(() =>
      importarEscena(intento + 1),
    );
  });
}

const FloorScene = lazy(() => importarEscena());

/** WebGL puede faltar por hardware, por driver bloqueado o por navegador viejo. */
function hayWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    const ctx = c.getContext('webgl2') ?? c.getContext('webgl');
    if (!window.WebGLRenderingContext || !ctx) return false;
    /* El navegador tiene un cupo de contextos WebGL vivos: si la prueba se queda con el suyo,
       le compite el lugar al canvas de la escena, que es el que importa. */
    ctx.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * La lista nombra los espacios a los que se entra el día del evento. Sala de estar,
 * Recepción, el depósito chico y el aula Q no existen en el modelo: se sacaron del piso.
 */
const ORDEN: Record<Sala['tipo'], number> = {
  stands: 0,
  workshops: 1,
  nucleo: 2,
};

type Fila = { id: string; label: string; detalle: string; sinUso: boolean; sala: boolean };

/**
 * Las filas de la referencia: las salas más el hall.
 *
 * El hall no es una sala —no tiene rectángulo ni muros— pero sí tiene dieciséis mesas
 * repartidas por los pasillos, y sin una fila propia esas marcas no tendrían desde dónde
 * mostrarse: las insignias del render salen al señalar un grupo, y ese grupo acá es la fila.
 */
const FILAS: Fila[] = (() => {
  const salas = [...SALAS].sort((a, b) => ORDEN[a.tipo] - ORDEN[b.tipo]);
  const filas = salas.map((s) => ({
    id: s.id,
    label: s.label,
    detalle: detalleDe(s),
    sinUso: s.acceso === 'bloqueada',
    sala: true,
  }));
  /* El hall no se puede enfocar: no tiene rectángulo, sus mesas están repartidas por todo
     el piso y acercarse a ellas sería acercarse al piso entero. */
  const hall = {
    id: HALL,
    label: 'Hall',
    detalle: mesasDeSala(HALL) + ' stands',
    sinUso: false,
    sala: false,
  };
  /* Va después de las aulas de stands, antes de los workshops. */
  const corte = filas.findIndex((f) => f.detalle === 'Workshops');
  filas.splice(corte < 0 ? filas.length : corte, 0, hall);
  return filas;
})();

/**
 * Si el chunk de three termina de fallar, la sección se queda sin render y punto: avisa hacia
 * arriba con `onFallo` para que se desmonte el viewport entero. No hay imagen de reemplazo —
 * la lista de salas al costado ya comunica el piso.
 */
class LimiteDeError extends Component<
  { onFallo: () => void; children: ReactNode },
  { falló: boolean }
> {
  state = { falló: false };
  static getDerivedStateFromError() {
    return { falló: true };
  }
  componentDidCatch() {
    this.props.onFallo();
  }
  render() {
    return this.state.falló ? null : this.props.children;
  }
}

export function StartupDayFloor() {
  const ref = useRef<HTMLDivElement>(null);
  const [cerca, setCerca] = useState(false);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [falló, setFalló] = useState(false);
  const [activa, setActiva] = useState<string | null>(null);
  /**
   * La sala que la cámara está mirando de cerca. Distinta de `activa`, que es sólo el hover:
   * el foco no se apaga al sacar el puntero, se sale con Esc, con el botón, clickeando afuera
   * o volviendo a clickear la misma sala.
   */
  const [enfocada, setEnfocada] = useState<string | null>(null);

  useEffect(() => {
    setWebgl(hayWebGL());
  }, []);

  useEffect(() => {
    if (!enfocada) return;
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEnfocada(null);
    };
    window.addEventListener('keydown', alTeclado);
    return () => window.removeEventListener('keydown', alTeclado);
  }, [enfocada]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setCerca(true);
          obs.disconnect();
        }
      },
      /* Se adelanta media pantalla para que el chunk llegue antes de que se vea. */
      { rootMargin: '50% 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  /* Sin WebGL o con el chunk caído no hay nada que mostrar en la caja, así que no va la caja. */
  const sinRender = webgl === false || falló;

  return (
    <div
      className={`sd-piso__layout${sinRender ? ' sd-piso__layout--sin-render' : ''}`}
      ref={ref}
    >
      {sinRender ? null : (
        <div className="sd-piso__viewport">
          {cerca && webgl ? (
            <LimiteDeError onFallo={() => setFalló(true)}>
              <Suspense fallback={<p className="sd-piso__cargando">Cargando el piso…</p>}>
                <FloorScene
                  activa={activa}
                  enfocada={enfocada}
                  onActivar={setActiva}
                  onEnfocar={setEnfocada}
                />
              </Suspense>
            </LimiteDeError>
          ) : (
            <p className="sd-piso__cargando">Cargando el piso…</p>
          )}

          {enfocada ? (
            <button
              type="button"
              className="sd-piso__volver"
              onClick={() => setEnfocada(null)}
            >
              Ver el piso completo
            </button>
          ) : null}
        </div>
      )}

      <ul className="sd-piso__ref">
        {FILAS.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              className={`sd-piso__ref-item${
                activa === f.id || enfocada === f.id ? ' is-activa' : ''
              }${enfocada === f.id ? ' is-enfocada' : ''}${f.sinUso ? ' is-sin-uso' : ''}`}
              aria-pressed={f.sala ? enfocada === f.id : undefined}
              onMouseEnter={() => setActiva(f.id)}
              onMouseLeave={() => setActiva(null)}
              onFocus={() => setActiva(f.id)}
              onBlur={() => setActiva(null)}
              onClick={() => {
                if (!f.sala || sinRender) return;
                setEnfocada(enfocada === f.id ? null : f.id);
              }}
            >
              <span className="sd-piso__ref-label">{f.label}</span>
              <span className="sd-piso__ref-detalle">{f.detalle}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
