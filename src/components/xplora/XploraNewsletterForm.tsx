import { useEffect, useId, useRef, useState } from 'react';
import {
  CARRERAS_OPCIONES,
  UNIVERSIDADES_OPCIONES,
} from '../../data/academicCatalog';
import { publicFetch, readApiError } from '../../lib/serverApi';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type NewsletterField = 'nombre' | 'apellido' | 'email' | 'universidad' | 'carrera';
type FieldErrors = Partial<Record<NewsletterField, string>>;

/** Newsletter landing — mismo lenguaje visual que el form de Startup Day. */
export function XploraNewsletterForm() {
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const invalidFieldRef = useRef<NewsletterField | null>(null);
  const submittingRef = useRef(false);
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [email, setEmail] = useState('');
  const [universidad, setUniversidad] = useState('');
  const [carrera, setCarrera] = useState('');
  const [step, setStep] = useState<'email' | 'profile'>('email');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    const field = invalidFieldRef.current;
    if (!field) return;
    invalidFieldRef.current = null;
    const control = formRef.current?.elements.namedItem(field);
    if (control instanceof HTMLElement) control.focus();
  }, [errors, step]);

  const clearFieldError = (field: NewsletterField) => {
    setErrors(previous => {
      if (!previous[field]) return previous;
      const next = { ...previous };
      delete next[field];
      return next;
    });
    setServerError('');
  };

  const errorId = (field: NewsletterField) => `${formId}-${field}-error`;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    const nom = nombre.trim();
    const ape = apellido.trim();
    const em = email.trim().toLowerCase();

    const nextErrors: FieldErrors = {};
    if (!em || !EMAIL_RE.test(em)) nextErrors.email = 'Ingresá un email válido.';
    if (step === 'profile') {
      if (!nom) nextErrors.nombre = 'Completá tu nombre.';
      if (!ape) nextErrors.apellido = 'Completá tu apellido.';
      if (!universidad) nextErrors.universidad = 'Elegí tu universidad.';
      if (!carrera) nextErrors.carrera = 'Elegí tu carrera.';
    }
    setServerError('');
    setErrors(nextErrors);
    const firstInvalid = (Object.keys(nextErrors) as NewsletterField[])[0];
    if (firstInvalid) {
      invalidFieldRef.current = firstInvalid;
      return;
    }

    if (step === 'email') {
      setEmail(em);
      invalidFieldRef.current = 'nombre';
      setStep('profile');
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    try {
      const res = await publicFetch('/api/public/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nom,
          apellido: ape,
          email: em,
          universidad,
          carrera,
        }),
      });
      if (!res.ok) {
        setServerError(await readApiError(res));
        return;
      }
      const data = (await res.json()) as { alreadyRegistered?: boolean };
      if (data.alreadyRegistered) {
        setServerError('Este email ya está suscripto.');
        return;
      }
      setDone(true);
      setNombre('');
      setApellido('');
      setEmail('');
      setUniversidad('');
      setCarrera('');
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : 'No se pudo completar la suscripción. Probá de nuevo.');
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <>
      <div role="status" aria-atomic="true">
        {done && <div className="sd-form__ok">
          <h3>Ya estás en la lista.</h3>
          <p>Vas a recibir las próximas novedades de Xplora.</p>
        </div>}
      </div>
      {!done && <form ref={formRef} className="sd-form xp-nl-form" data-step={step} onSubmit={onSubmit} aria-busy={loading} noValidate>
        <div className="xp-nl-field">
          <label>
            Email
            <input
              type="email"
              name="email"
              autoComplete="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? errorId('email') : undefined}
              disabled={loading}
              required
            />
          </label>
          {errors.email && <span className="xp-nl-error" id={errorId('email')}>{errors.email}</span>}
        </div>

        {step === 'profile' && <div className="xp-nl-profile" role="group" aria-label="Tus datos para suscribirte">
          <div className="sd-form__row">
            <div className="xp-nl-field">
              <label>
                Nombre
                <input
                  type="text"
                  name="nombre"
                  autoComplete="given-name"
                  placeholder="Juan"
                  value={nombre}
                  onChange={(e) => { setNombre(e.target.value); clearFieldError('nombre'); }}
                  aria-invalid={!!errors.nombre}
                  aria-describedby={errors.nombre ? errorId('nombre') : undefined}
                  disabled={loading}
                  required
                />
              </label>
              {errors.nombre && <span className="xp-nl-error" id={errorId('nombre')}>{errors.nombre}</span>}
            </div>
            <div className="xp-nl-field">
              <label>
                Apellido
                <input
                  type="text"
                  name="apellido"
                  autoComplete="family-name"
                  placeholder="García"
                  value={apellido}
                  onChange={(e) => { setApellido(e.target.value); clearFieldError('apellido'); }}
                  aria-invalid={!!errors.apellido}
                  aria-describedby={errors.apellido ? errorId('apellido') : undefined}
                  disabled={loading}
                  required
                />
              </label>
              {errors.apellido && <span className="xp-nl-error" id={errorId('apellido')}>{errors.apellido}</span>}
            </div>
          </div>

          <div className="sd-form__row">
            <div className="xp-nl-field">
              <label>
                Universidad
                <select
                  name="universidad"
                  value={universidad}
                  onChange={(e) => { setUniversidad(e.target.value); clearFieldError('universidad'); }}
                  aria-invalid={!!errors.universidad}
                  aria-describedby={errors.universidad ? errorId('universidad') : undefined}
                  disabled={loading}
                  required
                >
                  <option value="" disabled>
                    Elegí una opción
                  </option>
                  {UNIVERSIDADES_OPCIONES.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
              {errors.universidad && <span className="xp-nl-error" id={errorId('universidad')}>{errors.universidad}</span>}
            </div>
            <div className="xp-nl-field">
              <label>
                Carrera
                <select
                  name="carrera"
                  value={carrera}
                  onChange={(e) => { setCarrera(e.target.value); clearFieldError('carrera'); }}
                  aria-invalid={!!errors.carrera}
                  aria-describedby={errors.carrera ? errorId('carrera') : undefined}
                  disabled={loading}
                  required
                >
                  <option value="" disabled>
                    Elegí una opción
                  </option>
                  {CARRERAS_OPCIONES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              {errors.carrera && <span className="xp-nl-error" id={errorId('carrera')}>{errors.carrera}</span>}
            </div>
          </div>
        </div>}

        {serverError && <p className="xp-nl-server-error" role="alert">{serverError}</p>}
        <button type="submit" className="sd-btn sd-btn--primary" disabled={loading}>
          {loading ? 'Enviando…' : step === 'email' ? 'Continuar' : 'Quiero enterarme antes'}
        </button>
      </form>}
    </>
  );
}
