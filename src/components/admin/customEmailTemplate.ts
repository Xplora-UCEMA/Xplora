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
export type CustomEmailPreviewVariables = Readonly<Record<CustomEmailVariableName, string>>;

export const CUSTOM_EMAIL_VARIABLE_OPTIONS: ReadonlyArray<{
  readonly name: CustomEmailVariableName;
  readonly description: string;
  readonly source: 'contacto' | 'campaña';
}> = [
  { name: 'Nombre', description: 'Nombre de cada destinatario', source: 'contacto' },
  { name: 'Email', description: 'Email de cada destinatario', source: 'contacto' },
  { name: 'Carrera', description: 'Carrera guardada del contacto', source: 'contacto' },
  { name: 'Imagen', description: 'URL de imagen configurada abajo', source: 'campaña' },
  { name: 'Link', description: 'URL principal configurada abajo', source: 'campaña' },
  { name: 'Titulo', description: 'Título interno de la campaña', source: 'campaña' },
  { name: 'Asunto', description: 'Asunto del correo', source: 'campaña' },
];

export const DEFAULT_CUSTOM_EMAIL_HTML = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{Asunto}}</title>
  </head>
  <body style="margin:0;background:#f2eee8;font-family:Arial,sans-serif;color:#1a1028;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;">
            <tr><td><img src="{{Imagen}}" alt="{{Titulo}}" width="600" style="display:block;width:100%;height:auto;"></td></tr>
            <tr>
              <td style="padding:36px;">
                <p style="margin:0 0 12px;color:#603ef9;font-size:13px;font-weight:700;">XPLORA UCEMA</p>
                <h1 style="margin:0 0 18px;font-size:30px;line-height:1.15;">Hola {{Nombre}},</h1>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.6;">Te invitamos a {{Titulo}}. Personalizá libremente este HTML y conservá las variables que necesites.</p>
                <a href="{{Link}}" style="display:inline-block;background:#1a1028;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:700;">Ver más</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const VARIABLE_PATTERN = /{{\s*([^{}]+?)\s*}}/g;
const VARIABLE_NAMES_BY_LOWERCASE = new Map<string, CustomEmailVariableName>(
  CUSTOM_EMAIL_VARIABLE_NAMES.map((name) => [name.toLocaleLowerCase('es'), name]),
);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderCustomEmailPreview(
  template: string,
  variables: CustomEmailPreviewVariables,
): string {
  return template.replace(VARIABLE_PATTERN, (match: string, rawName: string) => {
    const name = VARIABLE_NAMES_BY_LOWERCASE.get(rawName.trim().toLocaleLowerCase('es'));
    return name ? escapeHtml(variables[name]) : match;
  });
}

export function findUnsupportedPreviewVariables(template: string): string[] {
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

export function isValidOptionalHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
