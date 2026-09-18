import { MemberArrow } from "./MemberArrow";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMemberAuth } from "../../context/MemberAuthContext";
import { DEFAULT_LOGO_URL } from "../../lib/defaultsMedia";
import { messageOf, requestAccess, verifyAccess } from "../../lib/points";
import { PointMark } from "./PointMark";

export function MemberAccess() {
  const { signInWithToken, refresh } = useMemberAuth();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [id, setId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (id) input.current?.focus();
  }, [id]);
  useEffect(() => {
    if (!cooldown) return;
    const t = setTimeout(() => setCooldown((n) => Math.max(n - 1, 0)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
  async function send() {
    setBusy(true);
    setError("");
    try {
      const r = await requestAccess(email.trim());
      setId(r.challengeId);
      setCooldown(r.resendAfterSec);
      setCode("");
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!id) {
      await send();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await verifyAccess(id, { code });
      signInWithToken(r.accessToken, r.account);
      await refresh();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="xp-access">
      <header className="xp-access__nav">
        <a href="/" className="xp-brand">
          <img src={DEFAULT_LOGO_URL} alt="" />
          Xplora
        </a>
        <a href="/">
          Volver al sitio <MemberArrow up />
        </a>
      </header>
      <main className="xp-access__main">
        <section className="xp-access__story">
          <PointMark large />
          <h1>
            Ser parte
            <br />
            tiene sus puntos.
          </h1>
          <p>
            Las experiencias que compartís te acercan a la próxima. Sumá Xplora
            Points, construí tu racha y canjeá recompensas.
          </p>
          <div className="xp-access__welcome">
            <span>+20</span>
            <p>
              Puntos de bienvenida
              <br />
              por cuenta confirmada.
            </p>
          </div>
          <p className="xp-fine">El bonus de bienvenida se acredita cuando Points está habilitado.</p>
        </section>
        <section className="xp-access__form" aria-labelledby="access-title">
          <h2 id="access-title">
            {id ? "Revisá tu email." : "Tu lugar en Xplora."}
          </h2>
          <p>
            {id ? (
              <>
                Mandamos un enlace y un código a <strong>{email}</strong>. Usá
                el que te quede más cómodo.
              </>
            ) : (
              "Creá tu cuenta o iniciá sesión con tu email. Sin contraseña."
            )}
          </p>
          <form onSubmit={submit} aria-busy={busy}>
            {!id ? (
              <label>
                Email
                <input
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={240}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vos@email.com"
                  aria-describedby={error ? "access-error" : undefined}
                />
              </label>
            ) : (
              <label>
                Código de seis dígitos
                <input
                  ref={input}
                  className="xp-access__code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  required
                  aria-invalid={Boolean(error)}
                  aria-describedby="access-hint access-error"
                  placeholder="000000"
                />
              </label>
            )}
            {id ? (
              <p id="access-hint" className="xp-fine">
                Vence en 10 minutos. Revisá también Spam.
              </p>
            ) : null}
            <p id="access-error" className="xp-error" role="alert">
              {error}
            </p>
            <button className="xp-button" disabled={busy} type="submit">
              {busy
                ? "Un momento…"
                : id
                  ? "Entrar a mi cuenta"
                  : "Continuar con email"}
              <MemberArrow />
            </button>
            {id ? (
              <div className="xp-access__links">
                <button
                  type="button"
                  disabled={busy || cooldown > 0}
                  onClick={() => void send()}
                >
                  {cooldown ? `Reenviar en ${cooldown}s` : "Reenviar código"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setId("");
                    setError("");
                  }}
                >
                  Cambiar email
                </button>
              </div>
            ) : null}
          </form>
          <p className="xp-access__note">
            Tus puntos no vencen. Tu cuenta es gratuita.
            <br />
            Usamos tu email para darte acceso, no para enviarte campañas sin tu
            consentimiento.
          </p>
        </section>
      </main>
      <footer className="xp-access__footer">
        Xplora · Comunidad emprendedora de UCEMA
      </footer>
    </div>
  );
}
