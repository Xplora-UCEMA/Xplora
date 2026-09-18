import { useId, useRef, useState } from 'react';
import { authFetch, readApiError } from '../../lib/serverApi';
import { FormSection, Sel } from './crm/CrmUi';
import { crm } from './crm/crmTheme';

export type EventAttendanceImportProps = {
  eventId: string;
  blockedReason?: string;
  basePoints?: number;
  pointsEnabled?: boolean;
  onBusy: (busy: boolean) => void;
  onImported: () => void;
};

/** Uses the existing authorized importer and its idempotent database awards. */
export function EventAttendanceImport({eventId,blockedReason,basePoints,pointsEnabled,onBusy,onImported}: EventAttendanceImportProps) {
  const id=useId();
  const input=useRef<HTMLInputElement>(null);
  const [file,setFile]=useState<File|null>(null);
  const [mode,setMode]=useState('auto');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [result,setResult]=useState<{emails_procesados:number;asistieron_marcados:number;warnings?:string[]}|null>(null);
  async function upload() {
    if (!file || busy || blockedReason) return;
    setBusy(true); onBusy(true); setError(''); setResult(null);
    try {
      const body=new FormData(); body.append('csv',file); body.append('attendance_mode',mode);
      const response=await authFetch(`/api/admin/eventos/${eventId}/luma-csv`,{method:'POST',body});
      if (!response.ok) throw new Error(await readApiError(response));
      setResult(await response.json() as {emails_procesados:number;asistieron_marcados:number;warnings?:string[]});
      setFile(null); if (input.current) input.current.value='';
      onImported();
    } catch(e) {setError(e instanceof Error ? e.message : 'No se pudo importar. Reintentá con el mismo archivo; no se duplican puntos.');}
    finally {setBusy(false); onBusy(false);}
  }
  return <FormSection title="Asistencia del evento">
    <div aria-busy={busy}>
      <p id={`${id}-help`} style={{color:'var(--ink-muted)',lineHeight:1.5}}>
        {basePoints ? `${basePoints} puntos base + racha por asistente. ` : ''}
        Identificación por email, sin duplicar puntos.
      </p>
      {pointsEnabled===false ? <p>Este evento no tiene puntos configurados. Activá Xplora Points y guardá el evento para otorgarlos.</p> : null}
      <Sel label="Cómo registrar la asistencia" value={mode} onChange={setMode} disabled={busy || !!blockedReason}
        options={[{value:'auto',label:'Detectar asistencia en el archivo'},
          {value:'attended',label:'Todos asistieron · lista sólo de asistentes'},
          {value:'registered',label:'Sólo inscripciones · sin acreditar asistencia'}]} />
      <p style={{color:'var(--ink-muted)'}}>CSV o Excel con Email y Asistió (sí/no), o check-in de Luma.</p>
      <label htmlFor={id}>Archivo de asistencia</label>
      <input id={id} ref={input} type="file" accept=".csv,.xlsx,.xls" style={{display:'block',maxWidth:'100%',marginBlock:12}}
        aria-describedby={`${id}-help ${id}-state`} disabled={busy || !!blockedReason}
        onChange={e=>{setFile(e.target.files?.[0]??null);setError('');setResult(null);}} />
      <p id={`${id}-state`} role="status">{busy ? 'Importando asistencia…' : blockedReason || (!file && !result ? 'Elegí un archivo para importar.' : '')}</p>
      {error ? <p role="alert">{error}</p> : null}
      {result ? <div role="status">
        <p>Asistentes reconocidos: {result.asistieron_marcados} · Emails procesados: {result.emails_procesados}.</p>
        <p>Asistencia guardada. Points requiere cuenta verificada y eventos anteriores cerrados.</p>
        {result.warnings?.length ? <ul>{result.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul> : null}
      </div> : null}
      <button type="button" className="xplora-admin-primary" style={{...crm.primaryBtn,marginTop:12,opacity:busy || !file || !!blockedReason ? 0.55 : 1}}
        disabled={busy || !file || !!blockedReason} onClick={()=>void upload()}>Importar asistencia</button>
    </div>
  </FormSection>;
}
