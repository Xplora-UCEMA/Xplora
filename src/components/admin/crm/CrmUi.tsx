/**
 * Kit de layout del **panel admin v2**: encabezados de sección, formulario modal (`FormScreen`),
 * campos reutilizables (`Field`, `TA`, `Sel`), grillas y lista tipo CRM.
 * Estilos en `crmTheme.ts`; utilidades globales en `index.css` (`.crm-two-col`, etc.).
 */
import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { crm } from './crmTheme';

/** Hook para ramas responsive sin librerías (ej. layout del formulario pantalla completa). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    setMatches(mq.matches);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Bloque de título para páginas que no llevan botón “Agregar” (ej. home del sitio en admin). */
export function SectionIntro({ kicker, title, subtitle }: { kicker: string; title: string; subtitle: string }) {
  return (
    <div style={{ ...crm.sectionHead, marginBottom: 28 }}>
      <div style={crm.sectionHeadText}>
        <p style={crm.pageKicker}>{kicker}</p>
        <h1 style={crm.pageTitle}>{title}</h1>
        <p style={crm.pageSubtitle}>{subtitle}</p>
      </div>
    </div>
  );
}

/**
 * Cabecera estándar de una sección del CRM: kicker + título + subtítulo + opcional botón primario.
 */
export function CrmSection({
  kicker,
  title,
  subtitle,
  onNew,
  newLabel = '+ Agregar',
  showNew = true,
  children,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  onNew: () => void;
  newLabel?: string;
  showNew?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <div style={crm.sectionHead}>
        <div style={crm.sectionHeadText}>
          <p style={crm.pageKicker}>{kicker}</p>
          <h1 style={crm.pageTitle}>{title}</h1>
          <p style={crm.pageSubtitle}>{subtitle}</p>
        </div>
        {showNew ? (
          <button type="button" className="xplora-admin-primary" style={crm.primaryBtn} onClick={onNew}>
            {newLabel}
          </button>
        ) : null}
      </div>
      {children}
    </>
  );
}

/** Formulario a pantalla completa (reemplaza el drawer lateral). */
export function FormScreen({
  title,
  subtitle,
  onClose,
  onSave,
  saving,
  error,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  error: string;
  children: ReactNode;
}) {
  const titleId = useId();
  const desktop = useMediaQuery('(min-width: 720px)');

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="xplora-admin-form-backdrop"
      style={crm.formBackdrop}
      role="dialog"
      aria-modal
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className={`xplora-admin-form-shell${desktop ? ' is-desktop' : ' is-mobile-fullbleed'}`}
        style={{ ...crm.formShell, ...(desktop ? crm.formShellDesktop : {}) }}
        onClick={e => e.stopPropagation()}
      >
        <header style={crm.formHeader}>
          <div style={crm.formHeaderLeft}>
            <button type="button" style={crm.formBackBtn} onClick={onClose}>
              ← Volver
            </button>
            <div style={crm.formTitleBlock}>
              <h2 id={titleId} style={crm.formTitle}>
                {title}
              </h2>
              {subtitle ? <p style={crm.formSubtitle}>{subtitle}</p> : null}
            </div>
          </div>
          <div style={crm.formHeaderActions}>
            <button type="button" style={crm.secondaryBtn} onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              style={{ ...crm.saveBtn, opacity: saving ? 0.65 : 1, pointerEvents: saving ? 'none' : 'auto' }}
              onClick={onSave}
              disabled={saving}
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </header>

        <div style={crm.formScroll}>{children}</div>

        {error ? (
          <div style={crm.formFooterNote} role="alert">
            <p style={{ ...crm.formError, margin: 0 }}>{error}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Input de una línea con label y hint opcional. */
export function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'password' | 'email' | 'url';
}) {
  return (
    <div style={crm.formField}>
      <label style={crm.label}>{label}</label>
      <input
        type={type}
        className="crm-input"
        style={crm.input}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {hint ? <p style={crm.hint}>{hint}</p> : null}
    </div>
  );
}

/** Textarea con altura mínima según `rows`. */
export function TA({
  label,
  hint,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div style={crm.formField}>
      <label style={crm.label}>{label}</label>
      <textarea
        className="crm-input"
        style={{ ...crm.input, minHeight: rows * 24 + 24, resize: 'vertical' as const }}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
      />
      {hint ? <p style={crm.hint}>{hint}</p> : null}
    </div>
  );
}

/** Select nativo con opciones `{ value, label }`. */
export function Sel({
  label,
  hint,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div style={crm.formField}>
      <label htmlFor={id} style={crm.label}>{label}</label>
      <select id={id} aria-describedby={hint ? `${id}-hint` : undefined} disabled={disabled} className="crm-input" style={crm.select} value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? <p id={`${id}-hint`} style={crm.hint}>{hint}</p> : null}
    </div>
  );
}

/** Grid 2 columnas en desktop; 1 en móvil (clase `.crm-two-col`). */
export function TwoCol({ children }: { children: ReactNode }) {
  return <div className="crm-two-col">{children}</div>;
}

/** Tres columnas en escritorio; una columna en móvil (útil para fecha + día + mes). */
export function ThreeCol({ children }: { children: ReactNode }) {
  return <div className="crm-three-col">{children}</div>;
}

/** Bloque visual con título para agrupar campos y reducir sensación de lista larga. */
export function FormSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="crm-form-section" style={crm.formSection}>
      <div style={crm.formSectionHead}>
        <h3 style={crm.formSectionTitle}>{title}</h3>
        {action ? <div style={crm.formSectionAction}>{action}</div> : null}
      </div>
      <div style={crm.formSectionBody}>{children}</div>
    </section>
  );
}

/** Separador decorativo con texto centrado (listas largas en formularios). */
export function Divider({ label }: { label: string }) {
  return (
    <div style={crm.divider}>
      <span style={{ flex: 1, height: 1, background: 'rgba(26,16,40,0.08)', display: 'block' }} />
      <span style={crm.dividerText}>{label}</span>
      <span style={{ flex: 1, height: 1, background: 'rgba(26,16,40,0.08)', display: 'block' }} />
    </div>
  );
}

/** Botón pequeño secundario (Editar / Eliminar) en filas de lista. */
export function ActionBtn({ children, onClick, danger }: { children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" style={{ ...crm.chipBtn, ...(danger ? crm.chipBtnDanger : {}) }} onClick={onClick}>
      {children}
    </button>
  );
}

/** Estado de carga mientras se hace `fetch` al abrir una sección. */
export function Spinner() {
  return (
    <div style={crm.spinnerWrap}>
      <div style={crm.spinner} aria-busy />
      <p style={{ marginTop: 12, fontSize: 14, color: 'var(--ink-muted)' }}>Cargando…</p>
    </div>
  );
}

/** Lista o sección sin filas todavía. */
export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div style={crm.emptyWrap}>
      <h3 style={crm.emptyTitle}>{title}</h3>
      <p style={crm.emptyText}>{text}</p>
    </div>
  );
}

/**
 * Fila de lista con iniciales/título, meta en gris y slot para `ActionBtn` u otros controles.
 */
export function ListCard({
  title,
  meta,
  actions,
}: {
  title: string;
  meta: string;
  actions: ReactNode;
}) {
  const mark = title.trim().slice(0, 1).toUpperCase() || '·';
  return (
    <div className="xplora-admin-row" style={crm.listCard}>
      <div
        style={{
          ...crm.listEmoji,
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--ink)',
          fontFamily: "'Fraunces', serif",
        }}
        aria-hidden
      >
        {mark}
      </div>
      <div style={crm.listBody}>
        <div style={crm.listTitle}>{title}</div>
        <div style={crm.listMeta}>{meta}</div>
      </div>
      <div style={crm.listActions}>{actions}</div>
    </div>
  );
}
