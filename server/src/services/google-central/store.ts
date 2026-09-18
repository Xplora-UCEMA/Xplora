import type { SupabaseClient } from '@supabase/supabase-js';
import { failure } from './api.js';
import { exchangeToken, type GoogleConfig } from './oauth.js';
import { unseal } from './security.js';
import type { Result } from './spec.js';

export function checkDb(error: {code?: string; message: string} | null): void {
  if (error) throw new Error('No se pudo guardar la conexión de Google.');
}
export async function accessToken(db: SupabaseClient, config: GoogleConfig): Promise<Result<string>> {
  try {
    const account = await db.from('xp_google_account').select('refresh_cipher,reconnect_required').eq('id',true).maybeSingle();
    checkDb(account.error);
    if (!account.data || account.data.reconnect_required) return failure('RECONNECT');
    const result = await exchangeToken(config, { refresh: unseal(account.data.refresh_cipher, config.encryptionKey, 'google-refresh') });
    if (!result.success) {
      if (result.error.code === 'RECONNECT') checkDb((await db.from('xp_google_account').update({ reconnect_required:true }).eq('id',true)).error);
      return result;
    }
    return {success:true, data:result.data.access_token};
  } catch { return failure('UNAVAILABLE'); }
}
