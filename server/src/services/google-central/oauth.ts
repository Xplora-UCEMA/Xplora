import { z } from 'zod';
import { failure } from './api.js';
import type { Result } from './spec.js';

export type GoogleConfig = { clientId: string; clientSecret: string; redirectUri: string;
  encryptionKey: string; accountEmail: string; workerEnabled: boolean };
export const scopes = ['https://www.googleapis.com/auth/forms.body.readonly',
  'https://www.googleapis.com/auth/forms.responses.readonly', 'https://www.googleapis.com/auth/userinfo.email'];
export function authorizationUrl(config: GoogleConfig, state: string, challenge: string): string {
  const query = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri,
    response_type: 'code', access_type: 'offline', prompt: 'consent', scope: scopes.join(' '),
    state, code_challenge: challenge, code_challenge_method: 'S256', login_hint: config.accountEmail });
  return `https://accounts.google.com/o/oauth2/v2/auth?${query}`;
}
const Token = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1).optional(), scope: z.string().optional() });
export async function exchangeToken(config: GoogleConfig, input: { code: string; verifier: string } | { refresh: string },
  request: typeof fetch = fetch): Promise<Result<z.infer<typeof Token>>> {
  try {
    const body = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret,
      ...('code' in input ? { grant_type: 'authorization_code', code: input.code, code_verifier: input.verifier, redirect_uri: config.redirectUri }
        : { grant_type: 'refresh_token', refresh_token: input.refresh }) });
    const response = await request('https://oauth2.googleapis.com/token', {
      method: 'POST', body, signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    if (!response.ok) return failure(response.status === 400 || response.status === 401 ? 'RECONNECT' : 'UNAVAILABLE');
    const parsed = Token.safeParse(await response.json());
    if (!parsed.success) return failure('UNAVAILABLE');
    if ('code' in input && (!parsed.data.refresh_token || !scopes.every(scope => parsed.data.scope?.split(' ').includes(scope))))
      return failure('RECONNECT');
    return { success: true, data: parsed.data };
  } catch { return failure('UNAVAILABLE'); }
}
export async function accountEmail(token: string, request: typeof fetch = fetch): Promise<Result<string>> {
  try {
    const response = await request('https://www.googleapis.com/oauth2/v2/userinfo?fields=email,verified_email', {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    if (!response.ok) return failure('RECONNECT');
    const info = z.object({ email: z.email(), verified_email: z.literal(true) }).safeParse(await response.json());
    return info.success ? { success: true, data: info.data.email.toLowerCase() } : failure('RECONNECT');
  } catch { return failure('UNAVAILABLE'); }
}
