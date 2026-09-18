import { failure } from './api.js';
import type { FormsReader, Result } from './spec.js';

export type InboxRow = { response_id: string; email: string; submitted_at: string };
export interface PageStore {
  enqueue(rows: InboxRow[]): Promise<void>;
  checkpoint(page: string | null, since: string): Promise<void>;
}
export async function ingestPage(task: {formId: string; since: string; page?: string}, token: string,
  api: FormsReader, store: PageStore, startedAt: string): Promise<Result<{ count: number }>> {
  try {
    const metadata = await api.inspect(`https://docs.google.com/forms/d/${task.formId}/edit`, token);
    if (!metadata.success) return metadata;
    const result = await api.responses(task.formId, token, task.since, task.page);
    if (!result.success) return result;
    const rows = result.data.responses.map(row => ({ response_id: row.responseId,
      email: row.respondentEmail.toLowerCase(), submitted_at: row.createTime }));
    await store.enqueue(rows);
    // Inclusive overlap covers responses concurrent with polling. DB receipts are idempotent.
    const since = result.data.nextPageToken ? task.since :
      new Date(Math.max(Date.parse(task.since), Date.parse(startedAt)-300000)).toISOString();
    await store.checkpoint(result.data.nextPageToken ?? null, since);
    return { success: true, data: { count: rows.length } };
  } catch { return failure('UNAVAILABLE'); }
}
