import { MemberDashboard } from "./MemberDashboard";
import { MemberPoints } from "./MemberPoints";

export function MemberOverview() {
  const view = new URLSearchParams(window.location.search).get("vista");
  const hasClaim = new URLSearchParams(window.location.hash.slice(1)).has("claim") ||
    Boolean(sessionStorage.getItem("xplora-points-claim"));
  if (view || hasClaim) return <MemberPoints />;
  return (
    <div className="xp-overview">
      <MemberDashboard />
    </div>
  );
}
