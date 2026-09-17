import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { publicFetch, readApiError } from '../../lib/serverApi';

type Status = 'idle' | 'loading' | 'success' | 'error';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SponsorCtaProps = {
  className?: string;
  label?: string;
  kicker?: string;
  title?: string;
  successText?: string;
  interes?: string;
  mensajePrefix?: string;
  placeholder?: string;
};

export function StartupDaySponsorCta({
  className = '',
  label = 'Sumar mi marca',
  kicker = 'Sponsors · Startup Day',
  title = 'Sumá tu marca',
  successText = 'El equipo de Xplora te va a escribir para charlar sponsoreo de Startup Day.',
  interes = 'sponsor_eventos',
  mensajePrefix = 'Consulta Startup Day',
  placeholder = 'Qué te interesa sponsorear',
}: SponsorCtaProps) {
  const [open, setOpen] = useState(false);
  const btnClass = ['sd-btn', className.includes('sd-btn--') ? '' : 'sd-btn--primary', className]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <button type="button" className={btnClass} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open ? (
        <StartupDaySponsorModal
          onClose={() => setOpen(false)}
          kicker={kicker}
          title={title}
          successText={successText}
          interes={interes}
          mensajePrefix={mensajePrefix}
          placeholder={placeholder}
        />
      ) : null}
    </>
  );
}

function StartupDaySponsorModal({
  onClose,
  kicker,
  title,
  successText,
  interes,
  mensajePrefix,
  placeholder,
}: {
  onClose: () => void;
  kicker: string;
  title: string;
  successText: string;
  interes: string;
  mensajePrefix: string;
  placeholder: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [email, setEmail] = useState('');
  const [consulta, setConsulta] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const prev = document.body.style.overflow;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    panelRef.current?.querySelector<HTMLElement>('input,textarea,button')?.focus();
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (nombre.trim().length < 2) {
      setErrorMsg('Ingresá tu nombre.');
      setStatus('error');
      return;
    }
    if (apellido.trim().length < 2) {
      setErrorMsg('Ingresá tu apellido.');
      setStatus('error');
      return;
    }
    if (empresa.trim().length < 2) {
      setErrorMsg('Ingresá el nombre de la empresa.');
      setStatus('error');
      return;
    }
    if (!em || !EMAIL_RE.test(em)) {
      setErrorMsg('Ingresá un email válido.');
      setStatus('error');
      return;
    }
    if (consulta.trim().length < 4) {
      setErrorMsg('Contanos brevemente tu consulta.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await publicFetch('/api/public/sponsors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa: empresa.trim(),
          nombre_contacto: `${nombre.trim()} ${apellido.trim()}`,
          email: em,
          telefono: '',
          interes,
          mensaje: `${mensajePrefix}\n\n${consulta.trim()}`,
        }),
      });
      if (!res.ok) {
        const msg = await readApiError(res);
        setErrorMsg(msg);
        setStatus('error');
        return;
      }
      setStatus('success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo enviar. Probá de nuevo.';
      setErrorMsg(msg);
      setStatus('error');
    }
  };

  return createPortal(
    <div
      className="sd-modal"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="sd-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="sd-modal__top">
          <div>
            <p className="sd-kicker">{kicker}</p>
            <h2 id={titleId} className="sd-modal__title">
              {title}
            </h2>
          </div>
          <button type="button" className="sd-modal__close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>

        {status === 'success' ? (
          <div className="sd-form__ok sd-form__ok--modal">
            <h3>Recibimos tu consulta</h3>
            <p>{successText}</p>
            <button type="button" className="sd-btn sd-btn--primary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        ) : (
          <form className="sd-form sd-form--modal" onSubmit={handleSubmit} noValidate>
            <div className="sd-form__row">
              <label>
                Nombre
                <input
                  type="text"
                  name="nombre"
                  required
                  autoComplete="given-name"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                />
              </label>
              <label>
                Apellido
                <input
                  type="text"
                  name="apellido"
                  required
                  autoComplete="family-name"
                  value={apellido}
                  onChange={(e) => setApellido(e.target.value)}
                />
              </label>
            </div>

            <label>
              Empresa
              <input
                type="text"
                name="empresa"
                required
                autoComplete="organization"
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
              />
            </label>

            <label>
              Mail
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>

            <label>
              Consulta
              <textarea
                name="consulta"
                required
                rows={4}
                placeholder={placeholder}
                value={consulta}
                onChange={(e) => setConsulta(e.target.value)}
              />
            </label>

            {status === 'error' && errorMsg ? (
              <p className="sd-form__error" role="alert">
                {errorMsg}
              </p>
            ) : null}

            <button
              className="sd-btn sd-btn--primary sd-btn--block"
              type="submit"
              disabled={status === 'loading'}
            >
              {status === 'loading' ? 'Enviando…' : 'Enviar consulta'}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
