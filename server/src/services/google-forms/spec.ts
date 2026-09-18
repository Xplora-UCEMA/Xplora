import { z } from 'zod';

export const responderUrl = z.url().refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && url.hostname === 'docs.google.com' && !url.username && !url.password &&
    !url.port && /^\/forms\/d\/(e\/)?[\w-]+\/viewform$/.test(url.pathname);
});
const common = { formId: z.string().regex(/^[\w-]{1,200}$/), emailCollectionType: z.literal('VERIFIED') };
export const GoogleEvent = z.discriminatedUnion('type', [
  z.object({ ...common, type: z.literal('connect'), responderUrl }),
  z.object({ ...common, type: z.literal('response'), responseId: z.string().min(1).max(200),
    email: z.email().max(240).transform(value => value.toLowerCase()), submittedAt: z.iso.datetime() }),
]);
export const GoogleInput = z.object({ id: z.uuid(), token: z.string().min(32).max(100), event: GoogleEvent });
export const GoogleOutput = z.union([
  z.object({ connected: z.literal(true) }),
  z.object({ points: z.number().int().positive(), alreadyClaimed: z.boolean() }),
]);
export const GoogleError = z.object({ code: z.enum(['INVALID_EVENT', 'UNAUTHORIZED', 'RETRY']), message: z.string() });
export type GoogleResult = { success: true; data: z.infer<typeof GoogleOutput> } |
  { success: false; error: z.infer<typeof GoogleError> };
export interface GoogleFormsSpec { execute(input: unknown): Promise<GoogleResult> }
export type GoogleClaim = Extract<z.infer<typeof GoogleEvent>, { type: 'response' }> & { id: string; secretHash: string };
export interface GoogleFormsStore {
  connection(id: string): Promise<{ form_id: string; secret_hash: string } | null>;
  connect(id: string, url: string, secretHash: string): Promise<void>;
  claim(input: GoogleClaim): Promise<unknown>;
}
