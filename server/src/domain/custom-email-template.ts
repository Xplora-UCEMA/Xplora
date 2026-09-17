export const CUSTOM_EMAIL_VARIABLE_NAMES = [
  'Nombre',
  'Email',
  'Carrera',
  'Imagen',
  'Link',
  'Titulo',
  'Asunto',
] as const;

export type CustomEmailVariableName = (typeof CUSTOM_EMAIL_VARIABLE_NAMES)[number];
export type CustomEmailVariables = Readonly<Record<CustomEmailVariableName, string>>;

export interface CustomEmailRecipientData {
  readonly nombre: string;
  readonly email: string;
  readonly carrera: string;
}

export interface CustomEmailCampaignData {
  readonly imagen: string;
  readonly link: string;
  readonly titulo: string;
  readonly asunto: string;
}

const VARIABLE_PATTERN = /{{\s*([^{}]+?)\s*}}/g;
const VARIABLE_NAMES_BY_LOWERCASE = new Map<string, CustomEmailVariableName>(
  CUSTOM_EMAIL_VARIABLE_NAMES.map((name) => [name.toLocaleLowerCase('es'), name]),
);

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function renderCustomEmailHtml(template: string, variables: CustomEmailVariables): string {
  return template.replace(VARIABLE_PATTERN, (match: string, rawName: string) => {
    const name = VARIABLE_NAMES_BY_LOWERCASE.get(rawName.trim().toLocaleLowerCase('es'));
    return name ? escapeHtml(variables[name]) : match;
  });
}

export function findUnsupportedCustomEmailVariables(template: string): string[] {
  const unsupported = new Map<string, string>();
  for (const match of template.matchAll(VARIABLE_PATTERN)) {
    const rawName = match[1]?.trim() ?? '';
    const key = rawName.toLocaleLowerCase('es');
    if (rawName && !VARIABLE_NAMES_BY_LOWERCASE.has(key) && !unsupported.has(key)) {
      unsupported.set(key, rawName);
    }
  }
  return [...unsupported.values()];
}

export function buildCustomEmailVariables(
  recipient: CustomEmailRecipientData,
  campaign: CustomEmailCampaignData,
): CustomEmailVariables {
  return {
    Nombre: recipient.nombre,
    Email: recipient.email,
    Carrera: recipient.carrera,
    Imagen: campaign.imagen,
    Link: campaign.link,
    Titulo: campaign.titulo,
    Asunto: campaign.asunto,
  };
}
