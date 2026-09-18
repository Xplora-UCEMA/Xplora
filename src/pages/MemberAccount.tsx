import { useEffect } from "react";
import { useMemberAuth } from "../context/MemberAuthContext";
import { MemberEventsPanel } from "../components/member/MemberEventsPanel";
import { MemberOverview } from "../components/member/MemberOverview";
import { MemberProfileForm } from "../components/member/MemberProfileForm";
import { MemberProposalsPanel } from "../components/member/MemberProposalsPanel";
import { MemberShell } from "../components/member/MemberShell";
import { MemberAccess } from "../components/member/MemberAccess";
import { pendingClaim } from "../lib/points";
import "../styles/memberAccount.css";
import "../styles/points.css";

export type MemberSection = "overview" | "perfil" | "eventos" | "propuestas";
export default function MemberAccount({
  section = "overview",
}: {
  section?: MemberSection;
}) {
  const { account, loading, sessionError, refresh, signOut } = useMemberAuth();
  useEffect(() => {
    pendingClaim();
  }, []);
  if (loading)
    return (
      <main className="xp-loading" aria-busy="true">
        <p role="status">Preparando tu cuenta…</p>
      </main>
    );
  if (sessionError && !account)
    return (
      <main className="xp-confirm">
        <section>
          <h1>Seguimos acá.</h1>
          <p role="alert">{sessionError}</p>
          <button className="xp-button" onClick={() => void refresh()}>
            Reintentar conexión
          </button>
          <button className="xp-text-button" onClick={signOut}>
            Usar otra cuenta
          </button>
        </section>
      </main>
    );
  if (!account) return <MemberAccess />;
  return (
    <MemberShell active={section}>
      {section === "overview" ? <MemberOverview /> : null}
      {section === "perfil" ? <MemberProfileForm /> : null}
      {section === "eventos" ? <MemberEventsPanel /> : null}
      {section === "propuestas" ? <MemberProposalsPanel /> : null}
    </MemberShell>
  );
}
