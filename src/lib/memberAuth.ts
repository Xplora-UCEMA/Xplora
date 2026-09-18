/**
 * Sesión de miembros (JWT propio, distinto del panel CRM).
 */
import { apiUrl } from './apiBase';
import { readApiError } from './serverApi';

const STORAGE_KEY = 'xplora-member-token';

export type MemberProfile = {
  id: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  phone: string;
  avatarUrl: string;
  studies: { institution: string; degree: string; year?: string }[];
  jobs: {
    company: string;
    role: string;
    from?: string;
    to?: string;
    current?: boolean;
    description?: string;
  }[];
  languages: { name: string; level: string }[];
  skills: string[];
  cvUrl: string;
  emailConfirmed: boolean;
  createdAt: string;
};

export type MemberEventItem = {
  id: string;
  eventoId?: string;
  title: string;
  dateDisplay: string;
  day?: string;
  month?: string;
  location?: string;
  modality?: string;
  tagLabel?: string;
  summary?: string;
  thumbnailUrl?: string;
  registeredAt: string | null;
  asistio: boolean;
};

export function getMemberToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setMemberToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export async function memberFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getMemberToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(apiUrl(path), { ...init, headers });
}

export async function memberRegister(email: string): Promise<{ ok: true } | { error: string }> {
  const res = await fetch(apiUrl('/api/member/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) return { error: await readApiError(res) };
  return { ok: true };
}

export async function memberConfirm(
  token: string,
): Promise<{ accessToken: string; account: MemberProfile } | { error: string }> {
  const res = await fetch(apiUrl('/api/member/confirm'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) return { error: await readApiError(res) };
  return (await res.json()) as { accessToken: string; account: MemberProfile };
}

export async function memberLoginRequest(
  email: string,
): Promise<{ ok: true; resendAfterSec: number } | { error: string }> {
  const res = await fetch(apiUrl('/api/member/login/request'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) return { error: await readApiError(res) };
  const body = (await res.json().catch(() => ({}))) as { resendAfterSec?: number };
  return { ok: true, resendAfterSec: body.resendAfterSec ?? 120 };
}

export async function memberLoginVerify(
  email: string,
  code: string,
): Promise<{ accessToken: string; account: MemberProfile } | { error: string }> {
  const res = await fetch(apiUrl('/api/member/login/verify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
  if (!res.ok) return { error: await readApiError(res) };
  return (await res.json()) as { accessToken: string; account: MemberProfile };
}

export async function memberLoadMe(): Promise<
  { account: MemberProfile; events: MemberEventItem[] } | { error: string; status: number }
> {
  const res = await memberFetch('/api/member/me');
  if (!res.ok) return { error: await readApiError(res), status: res.status };
  return (await res.json()) as { account: MemberProfile; events: MemberEventItem[] };
}
