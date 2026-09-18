import { createHash, timingSafeEqual } from 'node:crypto';
import { GoogleInput, GoogleOutput, type GoogleFormsSpec, type GoogleFormsStore, type GoogleResult } from './spec.js';

export class GoogleFormsHandler implements GoogleFormsSpec {
  constructor(private readonly store: GoogleFormsStore) {}
  async execute(input: unknown): Promise<GoogleResult> {
    const parsed = GoogleInput.safeParse(input);
    if (!parsed.success) return { success: false, error: { code: 'INVALID_EVENT', message: 'Aviso de Google Forms inválido.' } };
    try {
      const { id, token, event } = parsed.data;
      const connection = await this.store.connection(id);
      const received = createHash('sha256').update(token).digest();
      const expected = Buffer.from(connection?.secret_hash ?? '', 'hex');
      if (!connection || expected.length !== received.length || !timingSafeEqual(expected, received) || connection.form_id !== event.formId)
        return { success: false, error: { code: 'UNAUTHORIZED', message: 'Conexión no autorizada.' } };
      if (event.type === 'connect') {
        await this.store.connect(id, event.responderUrl, connection.secret_hash);
        return { success: true, data: { connected: true } };
      }
      const data = GoogleOutput.parse(await this.store.claim({ ...event, id, secretHash: connection.secret_hash }));
      return { success: true, data };
    } catch {
      // No payloads, emails or credentials reach logs or the error reporter.
      return { success: false, error: { code: 'RETRY', message: 'No se acreditó. Revisá cuenta, asistencia, vigencia y cupo en Ops antes de reintentar.' } };
    }
  }
}
