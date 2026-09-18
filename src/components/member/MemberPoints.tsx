import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useMemberAuth } from "../../context/MemberAuthContext";
import {
  messageOf,
  pendingClaim,
  pointsLabel,
  pointsRequest,
  type MemberRedemption,
  type PointsAction,
  type PointsSnapshot,
  type Reward,
} from "../../lib/points";
import { MemberArrow } from "./MemberArrow";
import { PointMark } from "./PointMark";
import { MemberEmptyState } from "./MemberEmptyState";
import { MemberTasks } from "./MemberTasks";
import { RedemptionDelivery } from "./RedemptionDelivery";
import { parseRewardDelivery } from "../../lib/rewardDelivery";

const date = (value: string) =>
  new Date(value).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

function MemberActivity({ ledger }: { ledger: PointsSnapshot["ledger"] }) {
  const rows = (items: PointsSnapshot["ledger"]) => (
    <ul>{items.map((item) => (
      <li key={item.id}>
        <div>
          <h3>{item.description}</h3>
          <time dateTime={item.created_at}>
            {date(item.created_at)}{item.metadata.multiplier ? ` · ×${item.metadata.multiplier}` : ""}
          </time>
        </div>
        <span className={BigInt(item.amount) > 0n ? "xp-earned" : ""}>
          {BigInt(item.amount) > 0n ? "+" : ""}{pointsLabel(item.amount)}
        </span>
      </li>
    ))}</ul>
  );
  return (
    <section className="xp-history xp-activity" aria-labelledby="activity-title">
      <header className="xp-section-head">
        <h2 id="activity-title">Tus movimientos</h2>

      </header>
      {ledger.length ? rows(ledger.slice(0, 3)) : (
        <MemberEmptyState headingLevel={3}
          title="Todavía no hay movimientos"
          copy="Acá vas a ver los puntos que sumás y usás."
          action={<a className="xp-text-button" href="/cuenta?vista=tasks">Ver acciones <MemberArrow /></a>}
        />
      )}
      {ledger.length > 3 ? <details className="xp-history-more">
        <summary>Ver {ledger.length - 3} movimientos anteriores</summary>
        {rows(ledger.slice(3))}
      </details> : null}
    </section>
  );
}
function Streak({
  label,
  value,
  multipliers,
  description,
}: {
  label: string;
  value: number;
  multipliers: number[];
  description: string;
}) {
  return (
    <div className="xp-streak">
      <div className="xp-streak__heading">
        <h3>{label}</h3>
        <span>{value} {value === 1 ? "evento" : "eventos"}</span>
      </div>
      <p>{description}</p>
      <details className="xp-rules"><summary>Ver multiplicadores</summary>
      <ol
        aria-label={`${label}: ${value} eventos de 5`}
        className="xp-streak__steps"
      >
        {multipliers.map((m, index) => (
          <li className={index < value ? "is-earned" : ""} key={index}>
            <span>{index + 1}</span>
            <small>×{m}</small>
          </li>
        ))}
      </ol>
      </details>
    </div>
  );
}

function MemberRedemptions({
  redemptions,
  loading = false,
  error = "",
  onRetry,
}: {
  redemptions: MemberRedemption[];
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}) {
  return (
    <section
      id="mis-canjes"
      className="xp-history"
      aria-labelledby="redemptions-title"
      aria-busy={loading || undefined}
    >
      <h2 id="redemptions-title">Mis canjes</h2>
      {error ? (
        <div className="xp-error" role="alert">
          <p>{error}</p>
          {onRetry ? (
            <button type="button" className="xp-text-button" onClick={onRetry}>
              Reintentar Mis canjes
            </button>
          ) : null}
        </div>
      ) : null}
      {redemptions.length ? (
        <ul>
          {redemptions.map((redemption) => {
            const deliveryState = parseRewardDelivery(redemption.delivery);
            return <li className="xp-redemption" key={redemption.id}>
              <div className="xp-redemption__main">
                <div className="xp-redemption__heading">
                  <div>
                    <h3>{redemption.title}</h3>
                    <time dateTime={redemption.created_at}>
                      {date(redemption.created_at)} · {redemption.cost} puntos
                    </time>
                  </div>
                  <span className={deliveryState.kind === "invalid" ? "xp-redemption__status--issue" : undefined}>
                    {deliveryState.kind === "invalid" ? "Requiere ayuda" : "Listo para usar"}
                  </span>
                </div>
                <RedemptionDelivery
                  redemptionId={redemption.id}
                  rewardTitle={redemption.title}
                  delivery={redemption.delivery}
                />
              </div>
            </li>;
          })}
        </ul>
      ) : null}
      {loading ? (
        <p className="xp-fine" role="status">
          {redemptions.length ? "Actualizando tus canjes…" : "Cargando tus canjes…"}
        </p>
      ) : null}
      {!loading && !error && redemptions.length === 0 ? (
        <MemberEmptyState headingLevel={3}
          title="Todavía no hiciste canjes"
          copy="Tus beneficios canjeados van a quedar acá."
        />
      ) : null}
    </section>
  );
}

export function MemberPoints() {
  const requestedView = new URLSearchParams(window.location.search).get("vista");
  const view = ["recompensas", "rachas", "movimientos"].includes(requestedView ?? "") ? requestedView : "tasks";
  const { account } = useMemberAuth();
  const [data, setData] = useState<PointsSnapshot | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [savedRedemptions, setSavedRedemptions] = useState<MemberRedemption[]>([]);
  const [redemptionsLoading, setRedemptionsLoading] = useState(false);
  const [redemptionsError, setRedemptionsError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Reward | null>(null);
  const [claimToken, setClaimToken] = useState(pendingClaim);
  const [action, setAction] = useState<PointsAction | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const actionHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (action) actionHeading.current?.focus(); }, [action]);
  const [claimError, setClaimError] = useState("");
  const [rating, setRating] = useState("");
  const [feedback, setFeedback] = useState("");
  const confirming = useRef(false);
  const leaveClaimFlow = () => {
    sessionStorage.removeItem("xplora-points-claim");
    setClaimToken("");
    setAction(null);
    setTaskId(null);
    setClaimError("");
    window.location.assign("/cuenta");
  };
  const loadSavedRedemptions = useCallback(async () => {
    setRedemptionsLoading(true);
    setRedemptionsError("");
    try {
      const result = await pointsRequest<{ redemptions: MemberRedemption[] }>(
        "/api/member/points/redemptions",
      );
      setSavedRedemptions(Array.isArray(result.redemptions) ? result.redemptions : []);
    } catch (e) {
      setRedemptionsError(messageOf(e));
    } finally {
      setRedemptionsLoading(false);
    }
  }, []);
  const load = useCallback(async () => {
    setError("");
    try {
      const result = await pointsRequest<PointsSnapshot | { available: false }>("/api/member/points");
      const notEnabled = "available" in result && result.available === false;
      setUnavailable(notEnabled);
      if (notEnabled) {
        setData(null);
        await loadSavedRedemptions();
      } else {
        setData(result as PointsSnapshot);
        setSavedRedemptions([]);
        setRedemptionsError("");
        setRedemptionsLoading(false);
      }
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setLoading(false);
    }
  }, [loadSavedRedemptions]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const refresh = () => { if (!document.hidden && !confirming.current) void load(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [load]);
  useEffect(() => {
    const scan = () => setClaimToken(pendingClaim());
    window.addEventListener("hashchange", scan);
    return () => window.removeEventListener("hashchange", scan);
  }, []);
  useEffect(() => {
    setAction(null);
    setTaskId(null);
    setClaimError("");
    if (!claimToken || loading || unavailable || data === null) return;
    let current = true;
    void pointsRequest<PointsAction>("/api/member/points/action", {
      token: claimToken,
    })
      .then((value) => {
        if (current) setAction(value);
      })
      .catch((e) => {
        if (current) setClaimError(messageOf(e));
      });
    return () => {
      current = false;
    };
  }, [claimToken, loading, unavailable, data !== null]);
  async function redeem(reward: Reward) {
    if (confirming.current) return;
    confirming.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const key = `xp-redeem:${account?.id}:${reward.id}`;
    try {
      let requestId = sessionStorage.getItem(key);
      if (!requestId) {
        requestId = crypto.randomUUID();
        sessionStorage.setItem(key, requestId);
      }
      const result = await pointsRequest<{ emailSent?: boolean }>("/api/member/points/redeem", {
        rewardId: reward.id,
        requestId,
      });
      sessionStorage.removeItem(key);
      setConfirm(null);
      const emailNotice = result.emailSent === true
        ? " También te enviamos un email de confirmación."
        : result.emailSent === false
          ? " No pudimos enviar el email de confirmación, pero tu beneficio está guardado."
          : "";
      setNotice(`¡Listo! ${reward.title} ya está en Mis canjes.${emailNotice}`);
      await load();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
      confirming.current = false;
    }
  }
  async function claim(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setClaimError("");
    try {
      const result = await pointsRequest<{
        points: number;
        alreadyClaimed: boolean;
      }>(taskId ? `/api/member/points/tasks/${taskId}/claim` : "/api/member/points/claim", {
        ...(!taskId ? { token: claimToken } : {}),
        ...(action?.kind === "survey"
          ? { rating: Number(rating), feedback }
          : {}),
      });
      setNotice(
        result.alreadyClaimed
          ? "Ya recibiste los puntos de esta acción."
          : `¡Sumaste ${result.points} Xplora Points!`,
      );
      if (!taskId) sessionStorage.removeItem("xplora-points-claim");
      setAction(null);
      setTaskId(null);
      setRating(""); setFeedback("");
      await load();
    } catch (e) {
      setClaimError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <section className="xp-loading" aria-busy="true">
        <p role="status">Cargando Points…</p>
      </section>
    );
  if (unavailable)
    return (
      <div className="xp-points">
        <aside className="xp-notice">
          <p>Xplora Points no está disponible para nuevas acciones o canjes.</p>
          <p>Tus beneficios anteriores siguen guardados y podés usarlos desde acá.</p>
        </aside>
        {error ? (
          <div className="xp-error" role="alert">
            <p>{error}</p>
            <button type="button" className="xp-text-button" onClick={() => void load()}>
              Reintentar carga
            </button>
          </div>
        ) : null}
        <MemberRedemptions
          redemptions={savedRedemptions}
          loading={redemptionsLoading}
          error={redemptionsError}
          onRetry={() => void loadSavedRedemptions()}
        />
      </div>
    );
  if (!data)
    return (
      <section className="xp-state">
        <h2>Tus puntos siguen acá.</h2>
        <p role="alert">{error || "No pudimos cargar tu cuenta."}</p>
        <button className="xp-button" onClick={() => void load()}>
          Reintentar
        </button>
      </section>
    );
  const programClosed = Boolean(
    data.program.closes_at &&
    new Date(data.program.closes_at).getTime() <= Date.now(),
  );
  const balance = BigInt(data.balance);
  const commitment = data.streaks?.commitment ?? 0;
  const consecutive = data.streaks?.consecutive ?? 0;
  const multiplier = Math.max(
    [1, 1, 1.5, 2, 2.5, 3][commitment],
    [1, 1, 3, 4, 5, 6][consecutive],
  );
  return (
    <div className="xp-points">
      <div className="xp-feedback" aria-live="polite">
        {notice ? <p className="xp-success">{notice}</p> : null}
      </div>
      {error ? (
        <p className="xp-error" role="alert">
          {error} <button onClick={() => void load()}>Actualizar saldo</button>
        </p>
      ) : null}
      {programClosed || data.program.notice || data.program.closes_at ? (
        <aside className="xp-notice">
          {programClosed ? (
            <p>El programa finalizó. Los canjes están cerrados.</p>
          ) : null}
          {data.program.notice}
          {!programClosed && data.program.closes_at ? (
            <p>Canjeá hasta el {date(data.program.closes_at)}.</p>
          ) : null}
        </aside>
      ) : null}
      {view === 'tasks' ? <header className="xp-member-welcome">
        <h1>{account?.firstName || account?.displayName ? `Hola, ${account.firstName || account.displayName.split(' ')[0]}.` : 'Mi cuenta'}</h1>
        <section className="xp-wallet" aria-labelledby="points-title">
          <div><h2 id="points-title">Tus Xplora Points</h2><strong>{pointsLabel(data.balance)}</strong><span> Points</span></div>
          <PointMark large />
        </section>
      </header> : null}
      <nav className={`xp-views${view === 'tasks' ? ' xp-views--home' : ''}`} aria-label="Xplora Points">
        {([["tasks", "Acciones"], ["recompensas", "Beneficios"], ["rachas", "Rachas"], ["movimientos", "Movimientos"]] as const).map(([key, label]) => (
          <a key={key} href={`/cuenta?vista=${key}`} aria-current={view === key ? "page" : undefined}>{label}</a>
        ))}
      </nav>
      {view === "tasks" ? (
        <>
          <MemberTasks closed={programClosed} refreshKey={data} onSelect={(selected) => {
            setTaskId(selected.id); setAction(selected); setRating(""); setFeedback(""); setClaimError("");
          }} />
        </>
      ) : <p className="xp-available">Saldo disponible: <strong>{pointsLabel(data.balance)} Points</strong></p>}
      {view === "movimientos" ? <MemberActivity ledger={data.ledger} /> : null}
      {action ? (
        <section className="xp-action" aria-labelledby="action-title">
          <h2 id="action-title" tabIndex={-1} ref={actionHeading}>{action.title}</h2>
          <p>+{action.points} Points</p>
          <form onSubmit={claim} aria-busy={busy}>
            {action.kind === "survey" ? (
              <>
                <label>
                  ¿Cómo estuvo la experiencia?
                  <select
                    required
                    value={rating}
                    onChange={(e) => setRating(e.target.value)}
                  >
                    <option value="">Elegí una valoración</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} de 5
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  ¿Qué te llevás? ¿Qué mejorarías?
                  <textarea
                    required
                    minLength={3}
                    maxLength={2000}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                  />
                </label>
              </>
            ) : null}
            <button className="xp-button" disabled={busy}>
              {busy
                ? "Guardando…"
                : action.kind === "survey"
                  ? "Enviar encuesta y sumar puntos"
                  : "Acreditar puntos del QR"}
            </button>
            <button type="button" className="xp-text-button" disabled={busy} onClick={() => {
              if (!taskId && claimToken) { leaveClaimFlow(); return; }
              setAction(null); setTaskId(null); setClaimError("");
              document.getElementById("tasks-title")?.focus();
            }}>Cancelar</button>
          </form>
        </section>
      ) : null}
      {claimError ? (
        <div className="xp-error" role="alert">
          <p>{claimError}</p>
          <button type="button" className="xp-text-button" onClick={leaveClaimFlow}>Descartar y volver al inicio</button>
        </div>
      ) : null}
      {view === "rachas" ? <section className="xp-streaks" aria-labelledby="streaks-title">
        <header className="xp-section-head">
          <div>
            <h2 id="streaks-title">Rachas</h2>
            <p>Tu mejor racha aumenta los puntos por asistencia.</p>
          </div>
          <span className="xp-multiplier">
            ×{multiplier} <small>multiplicador actual</small>
          </span>
        </header>
        <div className="xp-streaks__grid">
          <Streak
            label="Tus inscripciones"
            value={commitment}
            multipliers={[1, 1.5, 2, 2.5, 3]}
            description="Te anotás y vas. Si no te anotaste a otros eventos, no importa. Faltar a uno que sí te anotaste corta la racha."
          />
          <Streak
            label="Eventos seguidos"
            value={consecutive}
            multipliers={[1, 3, 4, 5, 6]}
            description="Vas a cada evento del calendario de Points, uno detrás de otro. Saltarte cualquiera corta la racha."
          />
        </div>
        <details className="xp-rules"><summary>Cómo se calculan</summary><p>Las rachas llegan hasta 5 eventos. Los multiplicadores no se suman y sólo se aplican a la asistencia. Las faltas se confirman cuando Xplora cierra la acreditación.</p></details>
      </section> : null}
      {view === "recompensas" ? <><section id="recompensas" aria-labelledby="rewards-title">
        <header className="xp-section-head">
          <div>
            <h2 id="rewards-title">Recompensas</h2>
          </div>
        </header>
        <div className="xp-rewards">
          {data.rewards.map((reward) => {
            const eligible =
              reward.active &&
              reward.available > 0 &&
              balance >= BigInt(reward.cost) &&
              reward.redeemed < reward.per_member &&
              !programClosed;
            const label = programClosed
              ? "Programa finalizado"
              : reward.redeemed >= reward.per_member
                ? "Ya canjeaste esta recompensa"
                : !reward.active
                  ? "Próximamente"
                  : !reward.available
                    ? "Cupo agotado"
                    : balance < BigInt(reward.cost)
                      ? `Te faltan ${pointsLabel(String(BigInt(reward.cost) - balance))} puntos`
                      : "Canjear recompensa";
            return (
              <article className="xp-reward" key={reward.id}>
                <div className="xp-reward__body">
                  <h3>{reward.title}</h3>
                  <p>{reward.description}</p>
                  <div className="xp-reward__price">
                    <strong>
                      {pointsLabel(reward.cost)} <small>Points</small>
                    </strong>
                    <span>
                      {reward.active
                        ? `${reward.available} disponibles`
                        : "Cupo por confirmar"}
                    </span>
                  </div>
                  <button
                    className="xp-button"
                    disabled={!eligible || busy}
                    onClick={() => setConfirm(reward)}
                  >
                    {label}
                  </button>
                  {confirm?.id === reward.id ? (
                    <div
                      className="xp-redeem-confirm"
                      role="group"
                      aria-label="Confirmar canje"
                    >
                      <p>
                        Vas a usar {pointsLabel(reward.cost)} puntos. El
                        beneficio se entrega al confirmar y el canje es
                        definitivo.
                      </p>
                      <button
                        className="xp-button"
                        disabled={busy}
                        onClick={() => void redeem(reward)}
                      >
                        {busy
                          ? "Canjeando…"
                          : `Confirmar por ${reward.cost} puntos`}
                      </button>
                      <button
                        className="xp-text-button"
                        disabled={busy}
                        onClick={() => setConfirm(null)}
                      >
                        Ahora no
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
        {data.rewards.length === 0 ? (
          <MemberEmptyState headingLevel={3}
            title="Estamos preparando las recompensas"
            copy="Todavía no hay beneficios publicados."
          />
        ) : null}
      </section>
      <MemberRedemptions redemptions={data.redemptions} /></> : null}
    </div>
  );
}
