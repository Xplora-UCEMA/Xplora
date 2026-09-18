import { useEffect, useState } from "react";
import { useMemberAuth } from "../context/MemberAuthContext";
import { memberConfirm } from "../lib/memberAuth";
import { messageOf, verifyAccess } from "../lib/points";
import { PointMark } from "../components/member/PointMark";
import "../styles/memberAccount.css";
import "../styles/points.css";

export default function MemberConfirm() {
  const { signInWithToken } = useMemberAuth();
  const [link] = useState(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    return {
      challenge: hash.get("challenge") ?? "",
      token:
        hash.get("token") ??
        new URLSearchParams(window.location.search).get("token") ??
        "",
    };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Scrub credentials before outbound navigation. Only a deliberate POST consumes the link.
  useEffect(() => {
    window.history.replaceState(null, "", "/cuenta/confirmar");
  }, []);
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const r = link.challenge
        ? await verifyAccess(link.challenge, { token: link.token })
        : await memberConfirm(link.token);
      if ("error" in r) throw new Error(r.error);
      signInWithToken(r.accessToken, r.account);
      window.history.replaceState(null, "", "/cuenta");
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="xp-confirm">
      <section>
        <PointMark large />
        <h1>Estás a un paso.</h1>
        <p>Confirmá tu acceso para entrar a tu comunidad.</p>
        <p className="xp-error" role="alert">
          {error}
        </p>
        <button
          className="xp-button"
          disabled={busy || !link.token}
          onClick={() => void confirm()}
        >
          {busy ? "Verificando…" : "Entrar a Xplora"}
        </button>
        <a href="/cuenta">Pedir un nuevo enlace</a>
      </section>
    </main>
  );
}
