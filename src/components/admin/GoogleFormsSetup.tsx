import { useEffect, useRef, useState } from 'react';
import { googleConnectorScript, googleConnectorManifest, type GoogleConnector } from '../../lib/googleFormsConnector';

function download(name: string, value: string) {
  const url = URL.createObjectURL(new Blob([value], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function GoogleFormsSetup({ connection, onRefresh, connected, active }: {
  connection: GoogleConnector; onRefresh: () => void; connected: boolean; active: boolean;
}) {
  const [origin, setOrigin] = useState('');
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const content = <section className="xp-google-setup" aria-labelledby="google-setup-title">
    <h3 id="google-setup-title" tabIndex={-1} ref={heading}>{connected ? 'Conexión de Google Forms' : 'Conectar Google Forms'}</h3>
    <p role="status">{active ? 'Conectado y habilitado. Las nuevas respuestas elegibles acreditan puntos.'
      : connected ? 'Conectado. Habilitá la tarea en el listado para comenzar a acreditar.'
      : 'La tarea está pausada hasta que conectes el formulario.'}</p>
    <p>Esta configuración contiene una clave privada: guardala sólo en Apps Script.</p>
    <form onSubmit={event => {
      event.preventDefault(); setError('');
      try { download('Code.gs', googleConnectorScript({ ...connection, apiOrigin: origin })); }
      catch (e) { setError(e instanceof Error ? e.message : 'Revisá la URL del backend.'); }
    }}>
      <label>URL pública del backend
        <input type="url" value={origin} onChange={event => setOrigin(event.target.value)} required placeholder="https://tu-backend.example.com"
          aria-describedby="google-origin-help google-origin-error" aria-invalid={!!error} />
      </label>
      <p id="google-origin-help">Debe tener esta versión de la API y la migración de Tasks. Google no puede acceder a localhost.</p>
      <p id="google-origin-error" role="alert">{error}</p>
      <button className="xp-button">Descargar script privado</button>
    </form>
    <details><summary>Pasos de conexión</summary>
      <ol>
        <li>Abrí <a href={`https://docs.google.com/forms/d/${encodeURIComponent(connection.formId)}/edit`} target="_blank" rel="noreferrer">el formulario</a> y elegí Más → Editor de secuencias de comandos.</li>
        <li>Pegá el archivo descargado en Code.gs. En Configuración del proyecto, mostrá appsscript.json y reemplazalo con el manifiesto de abajo.</li>
        <li>Vinculá el script a un proyecto de Google Cloud con Google Forms API habilitada.</li>
        <li>Ejecutá <code>xploraInstall</code> y autorizá los permisos con la cuenta que administra el formulario.</li>
        <li>Actualizá el estado aquí. Cuando figure “Conectado”, habilitá la tarea.</li>
      </ol>
      <button type="button" className="xp-button" onClick={() => download('appsscript.json', googleConnectorManifest)}>Descargar manifiesto</button>
      <p>Los participantes deben usar el mismo correo de su cuenta de Xplora. Las respuestas anteriores a la conexión no acreditan puntos.</p>
    </details>
    <button type="button" className="xp-text-button" onClick={onRefresh}>Actualizar estado de conexión</button>
  </section>;
  return active ? <details><summary>Conexión habilitada · recuperar configuración</summary>{content}</details> : content;
}
