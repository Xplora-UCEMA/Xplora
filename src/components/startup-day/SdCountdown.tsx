/**
 * Cierre de la página: cuenta regresiva a la próxima edición + captura de mail.
 *
 * Reemplaza a la sección `#reservar`, que apuntaba al formulario de Microsoft: cerrada la
 * primera edición ese link ya no tiene destino válido. El alta va a
 * `POST /api/public/startup-day/waitlist`, que existía desde el funnel original y había quedado
 * huérfano cuando la landing pasó a linkear el form externo — misma tabla, mismo mail de Resend,
 * y ya es idempotente por email (devuelve `alreadyRegistered` en vez de duplicar).
 *
 * **La fecha no está cerrada**, así que ninguna línea de copy de acá afirma el 11.09.2027: el
 * rótulo dice "fecha a confirmar" y la prosa no menciona día. El reloj en sí vive en
 * `cuentaRegresiva.tsx`, compartido con la barra del pie del hero.
 */
import { useState } from 'react';
import { publicFetch, readApiError } from '../../lib/serverApi';
import { useToast } from '../../context/FeedbackContext';
import { SD_PROXIMA_EDICION_TS } from '../../data/startupDayRecap';
import { SdReveal } from './SdReveal';
import { SdTicker } from './cuentaRegresiva';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SdCountdown() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!em || !EMAIL_RE.test(em)) {
      toast.error('Ingresá un email válido.');
      return;
    }
    setLoading(true);
    try {
      const res = await publicFetch('/api/public/startup-day/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: em }),
      });
      if (!res.ok) {
        toast.error(await readApiError(res));
        return;
      }
      const data = (await res.json()) as { alreadyRegistered?: boolean };
      toast.success(
        data.alreadyRegistered
          ? 'Ya estabas en la lista. Te escribimos cuando abra.'
          : 'Listo. Te avisamos apenas abra la próxima edición.',
      );
      setDone(true);
      setEmail('');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar tu mail.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="proxima" className="sd-band sd-band--ink sd-cd">
      <SdReveal className="sd-cd__inner">
        <p className="sd-cd__kicker">Próxima edición — fecha a confirmar</p>

        {/* El mismo reloj que corre al pie del hero (`cuentaRegresiva.tsx`), acá a tamaño
            completo. Los dos recalculan contra `Date.now()`, así que muestran lo mismo. */}
        <SdTicker ts={SD_PROXIMA_EDICION_TS} />

        <p className="sd-lead sd-cd__lead">
          La segunda edición del Startup Day. Dejá tu mail y te avisamos primero, apenas
          confirmemos la fecha y abran las inscripciones.
        </p>

        {done ? (
          <p className="sd-cd__ok">Anotado. Te escribimos cuando haya novedades.</p>
        ) : (
          <form className="sd-cd__form" onSubmit={onSubmit} noValidate>
            <label className="sd-cd__label" htmlFor="sd-proxima-email">
              Tu email
            </label>
            <div className="sd-cd__row">
              <input
                id="sd-proxima-email"
                type="email"
                name="email"
                autoComplete="email"
                placeholder="vos@ejemplo.com"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                required
              />
              <button type="submit" className="sd-btn sd-btn--primary" disabled={loading}>
                {loading ? '…' : 'Avisame'}
              </button>
            </div>
          </form>
        )}
      </SdReveal>
    </section>
  );
}
