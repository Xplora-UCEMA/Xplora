import { useRef, useState, type ChangeEvent } from 'react';
import ThumbnailUpload from './ThumbnailUpload';
import { Field } from './crm/CrmUi';
import { crm } from './crm/crmTheme';
import { CUSTOM_EMAIL_VARIABLE_OPTIONS, DEFAULT_CUSTOM_EMAIL_HTML } from './customEmailTemplate';

const MAX_HTML_FILE_BYTES = 2_000_000;

export interface CustomEmailHtmlEditorProps {
  html: string;
  imageUrl: string;
  linkUrl: string;
  unsupportedVariables: readonly string[];
  onHtmlChange: (html: string) => void;
  onImageUrlChange: (url: string) => void;
  onLinkUrlChange: (url: string) => void;
}

export default function CustomEmailHtmlEditor({
  html,
  imageUrl,
  linkUrl,
  unsupportedVariables,
  onHtmlChange,
  onImageUrlChange,
  onLinkUrlChange,
}: CustomEmailHtmlEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState('');
  const [importError, setImportError] = useState('');

  const insertVariable = (name: string) => {
    const token = `{{${name}}}`;
    const textarea = textareaRef.current;
    if (!textarea) {
      onHtmlChange(`${html}${token}`);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = `${html.slice(0, start)}${token}${html.slice(end)}`;
    onHtmlChange(next);
    window.requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + token.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const importHtmlFile = async (event: ChangeEvent<HTMLInputElement>) => {
    setImportMessage('');
    setImportError('');
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const isHtml = file.type === 'text/html' || file.name.toLocaleLowerCase('es').endsWith('.html');
    if (!isHtml) {
      setImportError('Elegí un archivo .html.');
      return;
    }
    if (file.size > MAX_HTML_FILE_BYTES) {
      setImportError('El archivo supera el máximo de 2 MB.');
      return;
    }
    try {
      const nextHtml = await file.text();
      onHtmlChange(nextHtml);
      setImportMessage(`${file.name} importado correctamente.`);
    } catch {
      setImportError('No se pudo leer el archivo. Probá pegar el código manualmente.');
    }
  };

  return (
    <div className="custom-email-editor">
      <div className="custom-email-editor-toolbar">
        <div>
          <strong className="custom-email-editor-title">Código del correo</strong>
          <p className="custom-email-editor-copy">
            Pegá un documento HTML completo o importalo desde tu equipo. Los estilos inline suelen funcionar mejor en clientes de email.
          </p>
        </div>
        <div className="custom-email-editor-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,text/html"
            hidden
            onChange={(event) => void importHtmlFile(event)}
          />
          <button type="button" style={crm.chipBtn} onClick={() => fileInputRef.current?.click()}>
            Importar .html
          </button>
          {!html.trim() ? (
            <button type="button" style={crm.chipBtn} onClick={() => onHtmlChange(DEFAULT_CUSTOM_EMAIL_HTML)}>
              Usar ejemplo
            </button>
          ) : null}
        </div>
      </div>

      {importMessage ? <p className="custom-email-import-ok" role="status">{importMessage}</p> : null}
      {importError ? <p className="custom-email-import-error" role="alert">{importError}</p> : null}

      <label className="custom-email-code-label" htmlFor="custom-email-html-source">
        HTML fuente
      </label>
      <textarea
        ref={textareaRef}
        id="custom-email-html-source"
        className="crm-input custom-email-code-input"
        value={html}
        onChange={(event) => onHtmlChange(event.target.value)}
        spellCheck={false}
        placeholder="<!doctype html>…"
        aria-describedby="custom-email-html-hint"
      />
      <p id="custom-email-html-hint" style={crm.hint}>
        La vista previa está aislada: scripts y formularios no pueden ejecutarse dentro del panel.
      </p>

      <div className="custom-email-variables" aria-label="Variables disponibles">
        <div className="custom-email-variables-head">
          <strong>Insertar variable</strong>
          <span>Se reemplazan al enviar cada correo</span>
        </div>
        <div className="custom-email-variable-list">
          {CUSTOM_EMAIL_VARIABLE_OPTIONS.map((variable) => (
            <button
              key={variable.name}
              type="button"
              className="custom-email-variable-chip"
              title={variable.description}
              onClick={() => insertVariable(variable.name)}
            >
              <code>{`{{${variable.name}}}`}</code>
              <span>{variable.source}</span>
            </button>
          ))}
        </div>
      </div>

      {unsupportedVariables.length > 0 ? (
        <div className="custom-email-variable-error" role="alert">
          <strong>Variables no reconocidas</strong>
          <p>
            Corregí o reemplazá {unsupportedVariables.map((name) => `{{${name}}}`).join(', ')} antes de enviar.
          </p>
        </div>
      ) : null}

      <div className="custom-email-global-values">
        <ThumbnailUpload
          label="Valor de {{Imagen}}"
          hint="Subí una imagen o pegá una URL. Se inserta donde uses {{Imagen}}."
          value={imageUrl}
          onChange={onImageUrlChange}
        />
        <Field
          label="Valor de {{Link}}"
          hint="URL principal del botón o enlace. Debe comenzar con http:// o https://."
          value={linkUrl}
          onChange={onLinkUrlChange}
          type="url"
          placeholder="https://…"
        />
      </div>
    </div>
  );
}
