import { useCallback, useEffect, useState } from 'react';
import { authFetch, readApiError } from '../../lib/serverApi';
import { messageOf } from '../../lib/points';

export type GoogleStatus = { configured:boolean; connected:boolean; email?:string; workerReady?:boolean;
  reconnectRequired?:boolean; forms?:{action_id:string;mode:'oauth';last_synced_at:string|null;sync_error:string|null}[] };
export type GoogleAccountConnectionProps = { onStatus:(value:GoogleStatus|null)=>void; refreshKey:number };
export function GoogleAccountConnection({onStatus,refreshKey}:GoogleAccountConnectionProps) {
  const [state,setState] = useState<GoogleStatus|null>(null);
  const [error,setError] = useState(''); const [busy,setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const response = await authFetch('/api/admin/points/google/status');
      if (!response.ok) throw new Error(await readApiError(response));
      const value = await response.json() as GoogleStatus;
      setState(value); onStatus(value); setError('');
    } catch { setError('No pudimos comprobar la conexión. Reintentá.'); onStatus(null); }
  },[onStatus]);
  useEffect(()=>{ void refresh(); },[refresh,refreshKey]);
  useEffect(()=>{
    const onFocus=()=>void refresh();
    window.addEventListener('focus',onFocus);
    const timer=window.setInterval(()=>{if (!document.hidden) void refresh();},30000);
    return ()=>{window.removeEventListener('focus',onFocus);window.clearInterval(timer);};
  },[refresh]);
  async function connect() {
    const popup=window.open('about:blank','xplora-google','width=620,height=760');
    if (!popup) {setError('Permití la ventana de Google en tu navegador y reintentá.');return;}
    popup.opener=null; setBusy(true); setError('');
    try {
      const response=await authFetch('/api/admin/points/google/connect',{method:'POST'});
      if (!response.ok) throw new Error(await readApiError(response));
      const value=await response.json() as {url:string};
      const url=new URL(value.url);
      if (url.pathname!=='/api/integrations/points/google/start' || url.username || url.password ||
        !(url.protocol==='https:' || (url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname))))
        throw new Error('No pudimos abrir Google. Reintentá.');
      popup.location.href=url.href;
    } catch(e) {popup.close();setError(messageOf(e));}
    finally {setBusy(false);}
  }
  return <section className="xp-google-account" aria-label="Conexión de Google" aria-busy={busy}>
    <div>
      <h3>Google Forms</h3>
      <p role="status">{!state ? 'Comprobando conexión…' : !state.configured ? 'Falta la configuración inicial del administrador.'
        : state.connected ? `Conectado · ${state.email}` : state.reconnectRequired ? 'Volvé a conectar Google para retomar las acreditaciones.'
        : 'Conectá la cuenta de Xplora una vez para usar sus formularios.'}</p>
      {state?.connected && !state.workerReady ? <p role="status">La sincronización está detenida. Avisá al administrador.</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
    {state?.configured && !state.connected ? <button type="button" className="xp-button" disabled={busy} onClick={()=>void connect()}>
      {busy ? 'Abriendo Google…' : state.reconnectRequired ? 'Reconectar Google' : 'Conectar Google'}
    </button> : <button type="button" className="xp-text-button" disabled={busy} onClick={()=>void refresh()}>Actualizar conexión</button>}
  </section>;
}
