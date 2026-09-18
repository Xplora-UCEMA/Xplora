import { FormMetadata, ResponsesPage, type FormsReader, type FormInfo, type Responses, type Result } from './spec.js';

export const failure = <T>(code: 'INVALID_FORM' | 'EMAIL_NOT_VERIFIED' | 'NO_ACCESS' | 'RECONNECT' | 'UNAVAILABLE'): Result<T> => ({
  success: false, error: { code, message: {
    INVALID_FORM: 'Pegá el enlace de edición del formulario, el que termina en /edit.',
    EMAIL_NOT_VERIFIED: 'En Google Forms, activá Recopilar correos → Verificados y reintentá.',
    NO_ACCESS: 'La cuenta de Google conectada no tiene acceso a este formulario. Compartilo con esa cuenta.',
    RECONNECT: 'La conexión con Google venció. Volvé a conectar la cuenta.',
    UNAVAILABLE: 'No pudimos consultar Google. Reintentá en unos minutos.',
  }[code] },
});
export class GoogleApi implements FormsReader {
  constructor(private readonly request: typeof fetch = fetch) {}
  private async read(path: string, token: string): Promise<Result<unknown>> {
    try {
      const response = await this.request(`https://forms.googleapis.com/v1/${path}`, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000), redirect: 'error',
      });
      if (!response.ok) return failure(response.status === 401 ? 'RECONNECT' : [403, 404].includes(response.status) ? 'NO_ACCESS' : 'UNAVAILABLE');
      return { success: true, data: await response.json() };
    } catch { return failure('UNAVAILABLE'); }
  }
  async inspect(input: string, token: string): Promise<Result<FormInfo>> {
    let id: string | undefined;
    try {
      const url = new URL(input);
      if (url.origin === 'https://docs.google.com' && !url.username && !url.password)
        id = url.pathname.match(/^\/forms\/d\/([\w-]{1,200})\/edit\/?$/)?.[1];
    } catch { /* Parse failure maps to a safe message. */ }
    if (!id) return failure('INVALID_FORM');
    const result = await this.read(`forms/${id}?fields=formId,info(title),settings(emailCollectionType),responderUri`, token);
    if (!result.success) return result;
    const parsed = FormMetadata.safeParse(result.data);
    if (!parsed.success || parsed.data.formId !== id) return failure('UNAVAILABLE');
    if (parsed.data.settings.emailCollectionType !== 'VERIFIED') return failure('EMAIL_NOT_VERIFIED');
    return { success: true, data: parsed.data };
  }
  async responses(formId: string, token: string, since: string, page?: string): Promise<Result<Responses>> {
    const query = new URLSearchParams({ filter: `timestamp >= ${since}`, pageSize: '100',
      fields: 'nextPageToken,responses(responseId,respondentEmail,createTime,lastSubmittedTime)' });
    if (page) query.set('pageToken', page);
    const result = await this.read(`forms/${encodeURIComponent(formId)}/responses?${query}`, token);
    if (!result.success) return result;
    const parsed = ResponsesPage.safeParse(result.data);
    return parsed.success ? { success: true, data: parsed.data } : failure('UNAVAILABLE');
  }
}
