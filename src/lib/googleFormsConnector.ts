export type GoogleConnector = { id: string; formId: string; connectorSecret: string };

export const googleConnectorManifest = JSON.stringify({
  timeZone: 'America/Argentina/Buenos_Aires', runtimeVersion: 'V8',
  oauthScopes: ['https://www.googleapis.com/auth/forms', 'https://www.googleapis.com/auth/forms.body.readonly',
    'https://www.googleapis.com/auth/script.external_request', 'https://www.googleapis.com/auth/script.scriptapp'],
}, null, 2);

/** Downloaded by authorized staff only. The secret is never persisted in browser storage. */
export function googleConnectorScript(config: GoogleConnector & { apiOrigin: string }): string {
  const origin = new URL(config.apiOrigin);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash)
    throw new Error('Usá el origen HTTPS público del backend, sin rutas. Google no puede acceder a localhost.');
  const endpoint = origin.origin + '/api/integrations/points/google-forms/' + encodeURIComponent(config.id);
  return `// Xplora Points. Privado: sólo los administradores del formulario deben editar este script.
const XPLORA = ${JSON.stringify({ formId: config.formId, endpoint, secret: config.connectorSecret })};
const XPLORA_QUEUE = 'xplora_pending_';

function xploraGoogleSettings() {
  const r = UrlFetchApp.fetch('https://forms.googleapis.com/v1/forms/' + encodeURIComponent(XPLORA.formId), {
    headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()}, muteHttpExceptions: true
  });
  if (r.getResponseCode() !== 200) throw new Error('Habilitá Google Forms API en el proyecto de Google Cloud del script y autorizá los permisos.');
  const form = JSON.parse(r.getContentText());
  if (!form.settings || form.settings.emailCollectionType !== 'VERIFIED') throw new Error('El formulario debe recopilar correos Verificados. No se enviaron puntos.');
  return form;
}

function xploraSend(payload) {
  return UrlFetchApp.fetch(XPLORA.endpoint, {
    method: 'post', contentType: 'application/json',
    headers: {Authorization: 'Bearer ' + XPLORA.secret},
    payload: JSON.stringify(payload), muteHttpExceptions: true, followRedirects: false
  }).getResponseCode();
}

function xploraInstall() {
  const form = FormApp.getActiveForm();
  if (!form || form.getId() !== XPLORA.formId) throw new Error('Abrí Apps Script desde el formulario configurado en Ops.');
  const metadata = xploraGoogleSettings();
  const status = xploraSend({type:'connect', formId:XPLORA.formId, emailCollectionType:'VERIFIED', responderUrl:metadata.responderUri});
  if (status !== 200) throw new Error('No se conectó con Xplora. Revisá el backend, la clave y la migración.');
  const triggers = ScriptApp.getProjectTriggers();
  if (!triggers.some(t => t.getHandlerFunction() === 'xploraOnSubmit'))
    ScriptApp.newTrigger('xploraOnSubmit').forForm(form).onFormSubmit().create();
  if (!triggers.some(t => t.getHandlerFunction() === 'xploraRetry'))
    ScriptApp.newTrigger('xploraRetry').timeBased().everyMinutes(5).create();
}

function xploraOnSubmit(e) {
  if (!e || !e.response || !e.source || e.source.getId() !== XPLORA.formId) throw new Error('Esta función se ejecuta al enviar el formulario, no manualmente.');
  xploraGoogleSettings();
  const responseId = e.response.getId();
  const email = e.response.getRespondentEmail();
  if (!responseId || !email) throw new Error('La respuesta no contiene un correo verificado.');
  const payload = {type:'response', formId:XPLORA.formId, emailCollectionType:'VERIFIED',
    responseId:responseId, email:email, submittedAt:e.response.getTimestamp().toISOString()};
  const key = XPLORA_QUEUE + responseId;
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(payload));
  xploraDeliver(key, payload);
}

function xploraDeliver(key, payload) {
  const status = xploraSend(payload);
  if (status === 200) PropertiesService.getScriptProperties().deleteProperty(key);
  // Failed deliveries remain in Script Properties. No emails, tokens or answers are logged.
}

function xploraRetry() {
  xploraGoogleSettings();
  const pending = PropertiesService.getScriptProperties().getProperties();
  Object.keys(pending).filter(k => k.indexOf(XPLORA_QUEUE) === 0).slice(0, 50)
    .forEach(k => xploraDeliver(k, JSON.parse(pending[k])));
}
`;
}
