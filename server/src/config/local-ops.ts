/** Deliberate allowlist: never pass server credentials to the frontend dev process. */
export function frontendEnvironment(runtime: NodeJS.ProcessEnv, url: string, anonKey: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','ComSpec']) {
    if (runtime[key]) env[key]=runtime[key];
  }
  return {...env,VITE_SUPABASE_URL:url,VITE_SUPABASE_KEY:anonKey,VITE_API_ORIGIN:'',VITE_PANEL_PATH:'/panel',
    API_PORT:'8788',GOOGLE_FORMS_API_ORIGIN:'https://xplora-production.up.railway.app'};
}
