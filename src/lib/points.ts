import { memberFetch, type MemberProfile } from "./memberAuth";
import { readApiError } from "./serverApi";

export type Reward = {
  id: string;
  title: string;
  description: string;
  cost: number;
  active: boolean;
  per_member: number;
  available: number;
  redeemed: number;
};
export type PointsSnapshot = {
  balance: string;
  streaks: { commitment: number; consecutive: number } | null;
  program: { notice: string; closes_at: string | null };
  rewards: Reward[];
  ledger: {
    id: string;
    amount: string;
    description: string;
    metadata: { multiplier?: number };
    created_at: string;
  }[];
  redemptions: {
    id: string;
    title: string;
    cost: number;
    delivery: string;
    created_at: string;
  }[];
};
export type PointsAction = {
  id: string;
  title: string;
  kind: "survey" | "qr";
  points: number;
  expires_at: string;
  event_id: string | null;
};

export async function pointsRequest<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await memberFetch(
    path,
    body === undefined ? {} : { method: "POST", body: JSON.stringify(body) },
  );
  if (!response.ok) throw new Error(await readApiError(response));
  return response.json() as Promise<T>;
}
export const requestAccess = (email: string) =>
  pointsRequest<{ challengeId: string; resendAfterSec: number }>(
    "/api/member/access/request",
    { email },
  );
export const verifyAccess = (
  challengeId: string,
  credential: { code: string } | { token: string },
) =>
  pointsRequest<{ accessToken: string; account: MemberProfile }>(
    "/api/member/access/verify",
    { challengeId, ...credential },
  );
export const pointsLabel = (value: string | number) =>
  BigInt(value).toLocaleString("es-AR");
export const messageOf = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "No pudimos conectar. Revisá tu conexión y reintentá.";

/** Preserve a scanned action during authentication without sending the token in URL requests. */
export function pendingClaim(): string {
  const token = new URLSearchParams(window.location.hash.slice(1)).get("claim");
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
    sessionStorage.setItem("xplora-points-claim", token);
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }
  return sessionStorage.getItem("xplora-points-claim") ?? "";
}
