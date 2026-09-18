import { z } from 'zod';
import { responderUrl } from '../google-forms/spec.js';

export const Failure = z.object({ code: z.enum(['INVALID_FORM', 'EMAIL_NOT_VERIFIED', 'NO_ACCESS', 'RECONNECT', 'UNAVAILABLE']), message: z.string() });
export type Result<T> = { success: true; data: T } | { success: false; error: z.infer<typeof Failure> };
export const FormMetadata = z.object({ formId: z.string().regex(/^[\w-]{1,200}$/),
  info: z.object({ title: z.string() }), settings: z.object({ emailCollectionType: z.string() }), responderUri: responderUrl });
export type FormInfo = z.infer<typeof FormMetadata>;
export const ResponsesPage = z.object({ nextPageToken: z.string().optional(), responses: z.array(z.object({
  responseId: z.string().min(1).max(200), respondentEmail: z.email().max(240),
  createTime: z.iso.datetime({ precision: null }), lastSubmittedTime: z.iso.datetime({ precision: null }),
})).default([]) });
export type Responses = z.infer<typeof ResponsesPage>;
export interface FormsReader {
  inspect(url: string, token: string): Promise<Result<FormInfo>>;
  responses(formId: string, token: string, since: string, page?: string): Promise<Result<Responses>>;
}
export const TaskInput = z.object({ title: z.string().trim().min(1).max(160), formUrl: z.url().max(500),
  points: z.number().int().min(1).max(100), maxClaims: z.number().int().min(1).max(100000),
  expiresAt: z.iso.datetime().refine(value => Date.parse(value) > Date.now(), 'Elegí una fecha futura.'),
  eventId: z.uuid().nullable().default(null) });
