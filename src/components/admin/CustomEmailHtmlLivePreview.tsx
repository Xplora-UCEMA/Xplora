import { useDeferredValue, useMemo } from 'react';
import {
  renderCustomEmailPreview,
  type CustomEmailPreviewVariables,
} from './customEmailTemplate';

export default function CustomEmailHtmlLivePreview({
  html,
  asunto,
  variables,
}: {
  html: string;
  asunto: string;
  variables: CustomEmailPreviewVariables;
}) {
  const deferredHtml = useDeferredValue(html);
  const deferredVariables = useDeferredValue(variables);
  const previewHtml = useMemo(
    () => renderCustomEmailPreview(deferredHtml, deferredVariables),
    [deferredHtml, deferredVariables],
  );

  return (
    <div className="custom-email-preview-shell">
      <div className="custom-email-preview-subject">
        <p>Asunto (bandeja de entrada)</p>
        <strong>{asunto.trim() || 'Sin asunto · escribí uno a la izquierda'}</strong>
      </div>
      {previewHtml.trim() ? (
        <iframe
          className="custom-email-preview-frame"
          title="Vista previa del HTML personalizado"
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={previewHtml}
        />
      ) : (
        <div className="custom-email-preview-empty">
          Pegá HTML o importá un archivo para verlo acá en tiempo real.
        </div>
      )}
    </div>
  );
}
