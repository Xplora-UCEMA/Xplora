import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { GoogleFormsSetup } from './GoogleFormsSetup';
import { GoogleAccountConnection, type GoogleStatus } from './GoogleAccountConnection';
import type { GoogleConnector } from '../../lib/googleFormsConnector';
import { authFetch, readApiError } from "../../lib/serverApi";
import { messageOf } from "../../lib/points";
import { useConfirm } from "../../context/FeedbackContext";
import "../../styles/points.css";

type EventPolicy = {
  event_id: string;
  starts_at: string;
  tier: "normal" | "large" | "major";
  base_points: number;
  closed: boolean;
};
type AdminReward = {
  available: number;
  id: string;
  title: string;
  description: string;
  cost: number;
  active: boolean;
};
type AdminAction = {
  id: string;
  title: string;
  kind: "qr" | "survey" | "award" | "google_form";
  points: number;
  active: boolean;
  expires_at: string;
  max_claims: number;
  xp_claims?: { count: number }[];
  xp_google_forms?: { form_id: string; connected_at: string | null; last_received_at: string | null } | null;
};
type AdminPoints = {
  events: EventPolicy[];
  catalog: { id: string; title: string }[];
  rewards: AdminReward[];
  actions: AdminAction[];
  responses: {
    action_id: string;
    rating: number;
    feedback: string;
    created_at: string;
  }[];
};
export type EventPointsDraft = {
  enabled: boolean;
  tier: string;
  points: number;
  startsAt: string;
  closed?: boolean;
  existing?: boolean;
};
export const emptyEventPoints: EventPointsDraft = {
  enabled: false,
  tier: "normal",
  points: 20,
  startsAt: "",
};
export async function adminPointsRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await authFetch(`/api/admin/points${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  if (!r.ok) throw new Error(await readApiError(r));
  return r.json() as Promise<T>;
}
export function eventPointsDraft(p?: EventPolicy): EventPointsDraft {
  if (!p) return { ...emptyEventPoints };
  const d = new Date(p.starts_at);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return {
    enabled: true,
    existing: true,
    tier: p.tier,
    points: p.base_points,
    startsAt: d.toISOString().slice(0, 16),
    closed: p.closed,
  };
}
export function validateEventPoints(d: EventPointsDraft): void {
  if (!d.enabled || d.closed) return;
  if (!d.startsAt || !Number.isFinite(new Date(d.startsAt).getTime()))
    throw new Error("Indicá la fecha y hora de Points.");
  const max = d.tier === "normal" ? 20 : d.tier === "large" ? 50 : 100;
  if (!Number.isInteger(d.points) || d.points < 1 || d.points > max)
    throw new Error(`Los puntos base deben estar entre 1 y ${max}.`);
}
export async function saveEventPoints(id: string, d: EventPointsDraft) {
  if (!d.enabled || d.closed) return;
  validateEventPoints(d);
  await adminPointsRequest(`/events/${id}`, "PUT", {
    ...d,
    startsAt: new Date(d.startsAt).toISOString(),
  });
}
export async function loadEventPoints(id: string): Promise<EventPointsDraft> {
  const data = await adminPointsRequest<AdminPoints>("");
  return eventPointsDraft(data.events.find((e) => e.event_id === id));
}
export function EventPointsFields({
  value,
  onChange,
}: {
  value: EventPointsDraft;
  onChange: (next: EventPointsDraft) => void;
}) {
  return (
    <div className="xp-admin xp-event-fields">
      <label className="xp-check">
        <input
          type="checkbox"
          checked={value.enabled}
          disabled={value.closed || value.existing}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
        />
        Participa en Xplora Points
      </label>
      {value.enabled ? (
        <>
          <div className="xp-admin__grid">
            <label>
              Categoría
              <select
                value={value.tier}
                disabled={value.closed}
                onChange={(e) =>
                  onChange({
                    ...value,
                    tier: e.target.value,
                    points:
                      e.target.value === "normal"
                        ? 20
                        : e.target.value === "large"
                          ? 50
                          : 100,
                  })
                }
              >
                <option value="normal">Normal · hasta 20</option>
                <option value="large">Grande · hasta 50</option>
                <option value="major">Muy grande · hasta 100</option>
              </select>
            </label>
            <label>
              Puntos base
              <input
                type="number"
                min={1}
                max={
                  value.tier === "normal"
                    ? 20
                    : value.tier === "large"
                      ? 50
                      : 100
                }
                value={value.points}
                disabled={value.closed}
                onChange={(e) =>
                  onChange({ ...value, points: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Inicio del evento · hora local
              <input
                type="datetime-local"
                value={value.startsAt}
                disabled={value.closed}
                onChange={(e) =>
                  onChange({ ...value, startsAt: e.target.value })
                }
              />
            </label>
          </div>
          <p className="xp-fine">
            {value.closed
              ? "Asistencia cerrada: la política y los puntos ya son definitivos."
              : "La fecha ordena las rachas. Incluí todos los eventos del calendario, incluso los que una persona no elige. Importá la asistencia antes de cerrar cada evento. Una vez acreditados, no se cambian la base ni la fecha."}
          </p>
        </>
      ) : null}
    </div>
  );
}

export default function PointsPanel() {
  const confirm = useConfirm();
  const [data, setData] = useState<AdminPoints | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"events" | "rewards" | "actions">("actions");
  const [actionKind, setActionKind] = useState<AdminAction['kind']>('google_form');
  const [connector, setConnector] = useState<GoogleConnector | null>(null);
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const createDetails = useRef<HTMLDetailsElement>(null);
  const [eventId, setEventId] = useState("");
  const [policy, setPolicy] = useState<EventPointsDraft>({
    ...emptyEventPoints,
    enabled: true,
  });
  const [newLink, setNewLink] = useState("");
  const [qr, setQr] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await adminPointsRequest<AdminPoints>(""));
    } catch (e) {
      setError(messageOf(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function run(task: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
      setNotice(message);
      await load();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  async function close(event: EventPolicy) {
    if (
      !(await confirm({
        title: "Cerrar acreditación",
        message:
          "Confirmá que importaste TODAS las inscripciones y asistencias. Este cierre fija las faltas, liquida rachas y no se puede deshacer desde el panel.",
        confirmLabel: "Cerrar acreditación",
        cancelLabel: "Revisar antes",
      }))
    )
      return;
    await run(
      () => adminPointsRequest(`/events/${event.event_id}/close`, "POST"),
      "Asistencia cerrada y rachas actualizadas.",
    );
  }
  function createReward(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    const fields = new FormData(f);
    void run(async () => {
      await adminPointsRequest("/rewards", "POST", {
        title: fields.get("title"),
        description: fields.get("description"),
        cost: Number(fields.get("cost")),
      });
      f.reset();
    }, "Recompensa creada. Cargá los beneficios y habilitala cuando esté lista.");
  }
  function createAction(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    const fields = new FormData(f);
    setNewLink("");
    setQr("");
    void run(async () => {
      const r = await adminPointsRequest<{ id: string; url: string | null; connectorSecret?: string; formId?: string }>(
        actionKind === 'google_form' ? '/google/tasks' : '/actions',
        "POST",
        {
          title: fields.get("title"),
          kind: fields.get("kind"),
          formUrl: fields.get('formUrl'),
          points: Number(fields.get("points")),
          maxClaims: Number(fields.get("maxClaims")),
          expiresAt: new Date(String(fields.get("expiresAt"))).toISOString(),
          eventId: fields.get("eventId") || null,
        },
      );
      if (r.connectorSecret && r.formId) setConnector({ id: r.id, connectorSecret: r.connectorSecret, formId: r.formId });
      if (createDetails.current) createDetails.current.open = false;
      if (r.url) {
        setNewLink(r.url);
        setQr(
          await QRCode.toDataURL(r.url, {
            width: 480,
            margin: 3,
            color: { dark: "#1a1028", light: "#ffffff" },
          }),
        );
      }
      f.reset();
    }, actionKind === 'google_form' ? 'Tarea conectada y activa. Las nuevas respuestas válidas suman puntos.' : 'Tarea creada. Cada cuenta recibe los puntos una sola vez.');
  }
  return (
    <section className="xp-admin xp-admin-panel">
      <h2>Xplora Points</h2>
      <p>
        Prepará tareas, asigná puntos y gestioná los canjes.
      </p>
      <div className="xp-admin__tabs" aria-label="Secciones de Points">
        {(["actions", "events", "rewards"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
          >
            {t === "events"
              ? "Eventos y rachas"
              : t === "rewards"
                ? "Recompensas"
                : "Tasks"}
          </button>
        ))}
      </div>
      <p className="xp-error" role="alert">
        {error}
      </p>
      <p role="status">{notice}</p>
      {!data ? (
        <button className="xp-button" onClick={() => void load()}>
          Cargar Points
        </button>
      ) : null}
      {data && tab === "events" ? (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () => saveEventPoints(eventId, policy),
                "Puntos del evento guardados.",
              );
            }}
          >
            <label>
              Evento
              <select
                required
                value={eventId}
                onChange={(e) => {
                  setEventId(e.target.value);
                  setPolicy({
                    ...eventPointsDraft(
                      data.events.find((p) => p.event_id === e.target.value),
                    ),
                    enabled: true,
                  });
                }}
              >
                <option value="">Elegí un evento</option>
                {data.catalog.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </select>
            </label>
            <EventPointsFields value={policy} onChange={setPolicy} />
            <button
              className="xp-button"
              disabled={busy || !eventId || policy.closed}
            >
              Guardar puntos del evento
            </button>
          </form>
          <h3>Calendario de rachas</h3>
          <p>
            La asistencia se importa desde Data → Eventos. Cerrá los eventos en
            orden, del más antiguo al más reciente.
          </p>
          <ul className="xp-admin__list">
            {data.events.map((e) => (
              <li key={e.event_id}>
                <div>
                  <strong>
                    {data.catalog.find((c) => c.id === e.event_id)?.title ??
                      "Evento"}
                  </strong>
                  <p>
                    {new Date(e.starts_at).toLocaleString("es-AR")} ·{" "}
                    {e.base_points} puntos base ·{" "}
                    {e.closed ? "Cerrado" : "Acreditación abierta"}
                  </p>
                </div>
                <button
                  type="button"
                  className="xp-button"
                  disabled={busy || e.closed}
                  onClick={() => void close(e)}
                >
                  {e.closed ? "Cerrado" : "Cerrar acreditación"}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {data && tab === "rewards" ? (
        <>
          <details>
            <summary>Crear recompensa digital</summary>
            <form onSubmit={createReward}>
              <label>
                Nombre
                <input name="title" maxLength={160} required />
              </label>
              <label>
                Descripción y condiciones
                <textarea name="description" required maxLength={2000} />
              </label>
              <label>
                Costo en puntos
                <input
                  name="cost"
                  type="number"
                  min={1}
                  max={1000000}
                  required
                  defaultValue={150}
                />
              </label>
              <button className="xp-button" disabled={busy}>
                Crear recompensa
              </button>
            </form>
          </details>
          <ul className="xp-admin__list">
            {data.rewards.map((r) => {
              const stock = r.available;
              return (
                <li key={r.id}>
                  <div>
                    <h3>{r.title}</h3>
                    <p>
                      {r.cost} puntos · {stock} disponibles ·{" "}
                      {r.active ? "Habilitada" : "Pausada"}
                    </p>
                    <details>
                      <summary>
                        Cargar entradas, códigos o instrucciones únicas
                      </summary>
                      <p>
                        Un beneficio real por línea. Se entrega exclusivamente a
                        la cuenta que lo canjea. No cargues stock ficticio.
                      </p>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const form = e.currentTarget;
                          const deliveries = String(
                            new FormData(form).get("deliveries"),
                          )
                            .split("\n")
                            .map((s) => s.trim())
                            .filter(Boolean);
                          void run(async () => {
                            await adminPointsRequest(
                              `/rewards/${r.id}/inventory`,
                              "POST",
                              { deliveries },
                            );
                            form.reset();
                          }, "Beneficios cargados.");
                        }}
                      >
                        <label>
                          Beneficios digitales
                          <textarea name="deliveries" required rows={4} />
                        </label>
                        <button className="xp-button" disabled={busy}>
                          Cargar beneficios
                        </button>
                      </form>
                    </details>
                  </div>
                  <button
                    className="xp-button"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          adminPointsRequest(`/rewards/${r.id}`, "PATCH", {
                            active: !r.active,
                          }),
                        r.active
                          ? "Recompensa pausada."
                          : "Recompensa habilitada.",
                      )
                    }
                  >
                    {r.active ? "Pausar" : "Habilitar"}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      {data && tab === "actions" ? (
        <>
          <GoogleAccountConnection onStatus={setGoogle} refreshKey={data.actions.length} />
          <details open ref={createDetails}>
            <summary>Crear tarea</summary>
            <form onSubmit={createAction}>
              <div className="xp-admin__grid">
                <label>
                  Nombre
                  <input
                    name="title"
                    required
                    maxLength={160}
                    placeholder="Encuesta Startup Day"
                  />
                </label>
                <label>
                  Tipo
                  <select name="kind" value={actionKind} onChange={event => setActionKind(event.target.value as AdminAction['kind'])}>
                    <option value="google_form">Google Forms</option>
                    <option value="survey">Encuesta con respuesta</option>
                    <option value="qr">Escaneo QR</option>
                    <option value="award">
                      Premio verificado por el equipo
                    </option>
                  </select>
                </label>
                {actionKind === 'google_form' ? <label>Enlace de edición de Google Forms
                  <input name="formUrl" type="url" required placeholder="https://docs.google.com/forms/d/…/edit" aria-describedby="google-form-help" />
                </label> : null}
                <label>
                  Puntos
                  <input
                    name="points"
                    type="number"
                    min={1}
                    max={100}
                    required
                    defaultValue={30}
                  />
                </label>
                <label>
                  Cupo de personas
                  <input
                    name="maxClaims"
                    type="number"
                    min={1}
                    max={100000}
                    required
                  />
                </label>
                <label>
                  Vence · hora local
                  <input type="datetime-local" name="expiresAt" required />
                </label>
                <label>
                  Asistencia requerida
                  <select name="eventId">
                    <option value="">No requiere evento</option>
                    {data.catalog.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p id="google-form-help">{actionKind === 'google_form' ? 'Usá el enlace de la barra del navegador al editar el formulario. Debe recopilar correos verificados.'
                : actionKind === 'qr' ? 'El QR acredita esta acción una vez por cuenta. No confirma asistencia física.'
                : actionKind === 'award' ? 'El equipo verifica la participación antes de acreditar el premio.'
                : 'Encuesta breve dentro de Xplora: valoración y comentario.'}</p>
              {actionKind === 'google_form' && (!google?.connected || !google.workerReady) ? <p id="google-create-help">{!google?.configured ? 'El administrador debe preparar la conexión de Google para habilitar esta opción.' : !google.connected ? 'Conectá Google arriba para continuar.' : 'Esperá a que se restablezca la sincronización.'}</p> : null}
              <button className="xp-button" aria-describedby={actionKind === 'google_form' && (!google?.connected || !google.workerReady) ? 'google-create-help' : undefined}
                disabled={busy || (actionKind === 'google_form' && (!google?.connected || !google.workerReady))}>
                {busy ? 'Guardando…' : actionKind === 'google_form' ? 'Conectar y activar' : 'Crear tarea'}
              </button>
            </form>
          </details>
          {connector ? <GoogleFormsSetup key={connector.connectorSecret} connection={connector} onRefresh={() => void load()}
            active={data.actions.find(item => item.id === connector.id)?.active ?? false}
            connected={!!data.actions.find(item => item.id === connector.id)?.xp_google_forms?.connected_at} /> : null}
          {newLink ? (
            <div className="xp-admin__qr">
              <h3>Guardá este enlace y su QR.</h3>
              <p>
                Por seguridad, el enlace completo sólo se muestra ahora. Puede
                compartirse; limitá su vigencia y elegibilidad según la acción.
              </p>
              <a href={newLink} target="_blank" rel="noreferrer">
                {newLink}
              </a>
              {qr ? (
                <>
                  <img src={qr} alt="QR para acceder a la acción de Xplora" />
                  <a download="xplora-points-qr.png" href={qr}>
                    Descargar QR
                  </a>
                </>
              ) : null}
            </div>
          ) : null}
          <ul className="xp-admin__list">
            {data.actions.map((a) => (
              <li key={a.id}>
                <div>
                  <h3>{a.title}</h3>
                  <p>
                    {a.points} puntos · {{ google_form: 'Google Forms', qr: 'QR', survey: 'Encuesta Xplora', award: 'Premio' }[a.kind]} · Hasta{" "}
                    {new Date(a.expires_at).toLocaleString("es-AR")} · Cupo{" "}
                    {a.max_claims}
                  </p>
                  <p>{a.xp_claims?.reduce((sum, item) => sum + item.count, 0) ?? 0} acreditaciones · {a.active ? 'Habilitada' : 'Pausada'}</p>
                  {a.kind === 'google_form' ? <>
                    <p>{a.xp_google_forms?.connected_at ? 'Conectado' : 'Falta conectar Google Forms'}
                      {a.xp_google_forms?.last_received_at ? ` · Última acreditación: ${new Date(a.xp_google_forms.last_received_at).toLocaleString('es-AR')}` : ''}</p>
                    {google?.forms?.some(form => form.action_id === a.id) ? <p>{google.forms.find(form => form.action_id === a.id)?.sync_error
                      ? 'No se pudo sincronizar este formulario. Revisá el acceso y la recopilación de correos verificados en Google.'
                      : 'Sincronización automática · las respuestas pueden tardar unos minutos.'}</p> : <details><summary>Conexión anterior · opciones avanzadas</summary><button className="xp-text-button" disabled={busy} onClick={async () => {
                      if (!(await confirm({ title: 'Reemplazar conexión', message: 'La tarea se pausará y la clave anterior dejará de funcionar. Tendrás que reemplazar el script en Google.', confirmLabel: 'Reemplazar conexión', cancelLabel: 'Cancelar' }))) return;
                      void run(async () => { setConnector(await adminPointsRequest<GoogleConnector>(`/actions/${a.id}/rotate`, 'POST')); }, 'Conexión reemplazada. Instalá el nuevo script.');
                    }}>Reemplazar conexión</button></details>}
                  </> : null}
                  {a.kind === "award" ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = e.currentTarget;
                        void run(
                          () =>
                            adminPointsRequest(
                              `/actions/${a.id}/award`,
                              "POST",
                              { email: new FormData(f).get("email") },
                            ),
                          "Premio acreditado o ya entregado anteriormente.",
                        );
                      }}
                    >
                      <label>
                        Email de la cuenta que verificaste
                        <input type="email" name="email" required />
                      </label>
                      <button
                        className="xp-button"
                        disabled={busy || !a.active}
                      >
                        Acreditar premio
                      </button>
                    </form>
                  ) : null}
                  {a.kind === "survey" ? (
                    <details>
                      <summary>
                        Ver respuestas (
                        {
                          data.responses.filter((r) => r.action_id === a.id)
                            .length
                        }
                        )
                      </summary>
                      {data.responses
                        .filter((r) => r.action_id === a.id)
                        .map((r, i) => (
                          <blockquote key={i}>
                            <p>
                              {r.rating}/5 · {r.feedback}
                            </p>
                            <small>
                              {new Date(r.created_at).toLocaleDateString(
                                "es-AR",
                              )}
                            </small>
                          </blockquote>
                        ))}
                    </details>
                  ) : null}
                </div>
                <button
                  className="xp-button"
                  disabled={busy || (!a.active && (new Date(a.expires_at).getTime() <= Date.now() || (a.kind === 'google_form' && !a.xp_google_forms?.connected_at)))}
                  onClick={() =>
                    void run(
                      () => adminPointsRequest(`/actions/${a.id}`, "PATCH", { active: !a.active }),
                      a.active ? 'Tarea pausada.' : 'Tarea habilitada.',
                    )
                  }
                >
                  {a.active ? "Pausar" : new Date(a.expires_at).getTime() <= Date.now() ? 'Vencida' : 'Habilitar'}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
