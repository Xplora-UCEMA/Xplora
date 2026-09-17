export const EMAIL_TEMPLATE_IDS = [
  'classic_event',
  'minimal_notice',
  'editorial_event',
  'platform_features',
  'custom_html',
] as const;
export type EmailTemplateId = (typeof EMAIL_TEMPLATE_IDS)[number];
export const DEFAULT_EMAIL_TEMPLATE_ID: EmailTemplateId = 'classic_event';

const SET = new Set<string>(EMAIL_TEMPLATE_IDS);

export function isValidEmailTemplateId(s: string): s is EmailTemplateId {
  return SET.has(s);
}
