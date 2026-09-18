# Tasks de Ops: Google Forms

## Conexión central: flujo nuevo

Implementada y desplegada **sólo en el backend** el 17/09/2026 (Argentina), deployment Railway `01527b5b-6b85-4ad3-81c1-bc886762c2ca`, SUCCESS. Health 200; rutas administrativas sin sesión 401; enlace OAuth inválido 400. Migración `202609170004_google_forms_central.sql` aplicada y verificada: tablas privadas sin lectura anon/authenticated; se conservaron 1 tarea, 2 movimientos y 1 recibo de Google. No se hizo push ni publicación del frontend.

Cliente web creado bajo la cuenta de Xplora en el proyecto Cloud existente: **Xplora Ops · Google Forms central**. Las seis variables `GOOGLE_FORMS_CLIENT_ID`, `GOOGLE_FORMS_CLIENT_SECRET`, `GOOGLE_FORMS_ENCRYPTION_KEY`, `GOOGLE_FORMS_REDIRECT_URI`, `GOOGLE_FORMS_ACCOUNT_EMAIL` y `GOOGLE_FORMS_WORKER_ENABLED` están guardadas en Railway; no en `.env` ni en el repositorio. El retorno autorizado es `https://xplora-production.up.railway.app/api/integrations/points/google/callback`. Sólo se acepta la cuenta configurada de Xplora.

**Pendiente real:** iniciar sesión de administrador en Ops local, autorizar la conexión central desde el botón de Google y probar una tarea nueva. La prueba real anterior confirmó el conector Apps Script, no este nuevo polling. Google OAuth permanece en Testing: los refresh tokens con estos permisos vencen a los 7 días; pasar a uso estable requiere revisar publicación/verificación de Google. No prometer autorización perpetua ni uso estable mientras esto siga pendiente.

### Para el equipo (sin scripts)

1. Ops → Data → Xplora Points → Tasks → **Conectar Google**. Autorizar la cuenta de Xplora; se hace por cuenta, no por formulario. Si Google revoca/vencen permisos, aparece **Reconectar Google**.
2. **Crear tarea** → Google Forms. Cargar nombre, enlace de edición (`/edit`), puntos, cupo y vencimiento; asistencia sólo si corresponde.
3. **Conectar y activar**. Ops comprueba acceso, correo verificado y sincronizador disponible; crea y publica en una transacción. Un formulario sólo puede tener una tarea.
4. Nuevas respuestas elegibles suman puntos automáticamente; pueden demorar unos minutos. El participante debe tener cuenta confirmada antes de responder y usar el mismo email. Abrir el formulario no acredita.

No se descargan scripts, manifiestos ni claves en este flujo. Las conexiones Apps Script existentes se conservan; sus opciones quedan bajo “Conexión anterior · opciones avanzadas”. No se migran ni duplican automáticamente.

### Operación técnica de la conexión central

- OAuth de servidor con permisos de lectura `forms.body.readonly`, `forms.responses.readonly` y `userinfo.email`; state aleatorio de un uso, cookie HttpOnly/SameSite=Lax, PKCE y vencimiento de 10 minutos. El enlace intermedio del backend permite usar el panel en localhost sin compartir cookies con Railway.
- Refresh token cifrado con AES-256-GCM y clave independiente de 32 bytes base64; nunca devuelve tokens al frontend. No rotar esa clave sin recifrar/reconectar. No copiar cuerpos de errores OAuth a logs.
- Worker opt-in (`GOOGLE_FORMS_WORKER_ENABLED=true`), cada 60 segundos, lease de PostgreSQL renovable para coordinar réplicas. Checkpoints de paginación e inbox privado sobreviven reinicios. Se pide sólo ID/email/fechas de respuesta: no respuestas a preguntas. La fecha original evita premiar ediciones de respuestas anteriores a la activación.
- La inserción en inbox precede el avance de cursor; duplicados no sobrescriben la primera recepción. `xp_google_claim` conserva cupos, elegibilidad, asistencia y ledger atómico. Fallos de acreditación se reintentan cada 5 minutos mientras la tarea esté activa y hasta 7 días después de su vencimiento. Los pendientes requieren revisión del administrador si nunca se vuelven elegibles. Los metadatos completados se limpian a los 30 días; recibos de deduplicación permanecen.
- Ante falta de acceso/correos no verificados no se acredita y Ops muestra error de sincronización. No alterar la modalidad de recopilación de emails durante una tarea activa. No hay garantía de inmediatez ni entrega indefinida más allá de la ventana operativa indicada.
- El worker arranca sólo en el proceso Node, no dentro de `createApplication()` ni por una visita al panel. Heartbeat viejo bloquea nuevas publicaciones; errores transitorios no borran la conexión ni se muestran como “conectado” falsamente.
- Para levantar la web local con configuración pública real: `node --import tsx scripts/start-ops-local.ts "<directorio de configuración existente>"`. El launcher pasa sólo variables públicas/allowlist al proceso Vite; las rutas `/api/admin/points/google` se proxifican al backend desplegado. Miembros y el resto del API siguen en localhost:8788. No se guardan credenciales de Google en la máquina.

Verificaciones locales: 51 tests Node/PGlite, typecheck de tests, build completo y 17 tests de navegador con fixtures. El paquete backend aislado pasó 42 tests y build antes del despliegue. No existe comando lint. Las pruebas automatizadas no sustituyen la autorización ni la prueba Google real pendiente.

## Estado de entrega

Migración 003 aplicada en Supabase de producción el 17/09/2026 (Argentina), con autorización explícita. Se verificaron las tablas privadas, ejecución de acreditaciones sólo por `service_role` y conservación de los datos existentes (1 movimiento, 0 acciones). Backend desplegado en Railway: `8dbbe11c-e1ea-483f-9ea5-25799585736a`, estado SUCCESS y `/api/health` 200. La web permanece en localhost; no se hizo push ni deploy de frontend.

El chequeo posterior detectó que la clave de sesiones preexistente era demasiado corta. Con autorización específica del usuario, se reemplazó únicamente `MEMBER_JWT_SECRET` por una clave criptográfica generada y enviada por stdin, sin mostrarla ni persistirla en archivos. Se republicó el mismo artefacto de API (`b23654f7-0c52-41cc-a0d2-6cd0c7b35ea6`): las rutas de miembros y administración responden 401 sin sesión; el callback consultó la conexión inexistente de prueba y la rechazó con 401, confirmando acceso al esquema nuevo. Healthcheck: 200. Las sesiones previas de miembros productivos requieren nuevo acceso; la clave y la sesión local no se modificaron.

El formulario proporcionado por el usuario recopila correos **Verificadas** y ya tiene el conector Apps Script autorizado e instalado. El usuario completó la respuesta y confirmó el saldo actualizado; el chequeo posterior encontró un recibo Google y dos movimientos totales (bienvenida + formulario). Esto verifica el flujo anterior, no la conexión central nueva.

Preparación en Google: el usuario habilitó MFA y autorizó la conexión bajo `xplora.ucema@gmail.com`. Se creó el proyecto Cloud `massive-seer-509000-c9` (número `360808603204`), sin facturación, con Google Forms API habilitada y OAuth externo en Testing, restringido a esa cuenta de prueba. Se asoció el proyecto vinculado `Xplora Points · Google Forms · Prueba`, ID `1Z0VG3fsrdLMu3XSCA3b6ayYOs8_D2l49utraqfEm_Oxk0hsIdNgugsKI`, y se guardaron el conector y su manifiesto. La clave privada no se mostró ni guardó en archivos locales; la base conserva sólo su hash.

La tarea `c2a559dd-7648-4499-8ea6-9c62ee3a2bc9` ya existe: Prueba Google Forms, 5 puntos, cupo 1, sin asistencia requerida, vencimiento `2026-09-19 00:32:19.560199+00` (18/09 a las 21:32, Argentina). El propietario revisó personalmente la advertencia de Google y completó la autorización. `xploraInstall` terminó correctamente; se verificaron exactamente dos activadores: `xploraOnSubmit` al enviar el formulario y `xploraRetry` basado en tiempo. La base confirmó conexión a las `2026-09-18 00:37:40.287127+00`; después se habilitó la tarea, con `activated_at=2026-09-18 00:38:54.117587+00`. La cuenta en localhost muestra la tarea +5 pts y su enlace correcto; saldo previo a la prueba: 20. Pendiente: enviar una respuesta real con el mismo correo verificado de la cuenta y comprobar una única acreditación. OAuth permanece en Testing, no como una integración pública verificada.

## Operación anterior: Apps Script (compatibilidad)

1. Con autorización de producción, aplicar las migraciones 000–003 en orden y desplegar el backend compatible. No ejecutar 000–002 de nuevo si ya están instaladas. Mantener el frontend en localhost si así se desea. El backend debe tener `pointsEnabled` configurado y responder por HTTPS público.
2. En Ops → Data → Xplora Points → Tasks, crear una tarea Google Forms con título, enlace de edición, puntos (1–100), cupo y vencimiento. Elegir un evento sólo si se exige asistencia confirmada. Se crea pausada.
3. Descargar el script privado indicando el origen HTTPS de **ese backend**. No usar la URL del frontend ni localhost. La clave es por tarea, se devuelve una vez y sólo su hash queda en la base. No se guarda en localStorage ni en el repositorio. Guardar el archivo descargado como una credencial.
4. Abrir Apps Script desde el formulario. Reemplazar Code.gs por la descarga y appsscript.json por el manifiesto. Asociarlo a un proyecto de Google Cloud con Google Forms API habilitada. El propietario autoriza permisos de Forms, consulta de configuración y ejecución de triggers/solicitudes externas.
5. Ejecutar `xploraInstall`. Comprueba el ID del formulario y `emailCollectionType=VERIFIED`, confirma el enlace público con Google, conecta con la API y crea triggers de envío y reintento cada cinco minutos. No modifica preguntas ni envía respuestas. Cada formulario tiene una sola tarea vinculada; no instalar varias veces desde distintos administradores.
6. Actualizar estado en Ops. Habilitar únicamente cuando indique conectado. La cuenta debe estar confirmada antes de enviar la respuesta y usar el correo verificado de Google.
7. Probar una respuesta real con autorización; comprobar acreditaciones en Ops y saldo/movimientos en la cuenta. Reenviar el aviso no debe duplicar puntos. La validación real sigue pendiente.

## Verificación y límites

- El trigger valida de nuevo que Google recoge correos verificados. Envía sólo ID del formulario, ID de respuesta, correo y fecha; **no transmite las respuestas del formulario**.
- La API valida el contrato, la clave del conector y el formulario. No acepta puntos ni identidad de miembro desde el navegador del participante. Una respuesta o un miembro no puede cobrar dos veces la misma tarea.
- PostgreSQL bloquea miembro y acción, valida cuenta confirmada, ventana de publicación, cupo, programa activo y asistencia si corresponde. Recibo, reclamo y ledger se escriben en una transacción. La clave se vuelve a verificar dentro de la transacción para impedir una carrera con su rotación.
- Una respuesta enviada antes del vencimiento puede acreditarse después si el transporte se demoró y la tarea sigue habilitada. Pausar detiene nuevos pagos. Rehabilitar o reemplazar la conexión inicia una nueva ventana: avisos anteriores aún no acreditados no se procesan automáticamente. No hay acreditación retroactiva de respuestas históricas.
- Los avisos fallidos quedan en las Script Properties privadas y se reintentan de a 50 cada cinco minutos. Cuenta no confirmada a tiempo, falta de asistencia, cupo agotado o configuración incorrecta requieren revisión del equipo. Google Apps Script tiene cuotas y límites de almacenamiento; monitorear Ejecuciones y avisos pendientes. No se promete entrega infalible ni reemplaza una cola externa durable. Las propiedades contienen correos: acceso restringido a administradores, nunca copiar a logs públicos.
- Reemplazar conexión en Ops invalida la clave anterior y pausa la tarea. Reinstalar el nuevo script y habilitar nuevamente. Guardar/descargar la configuración sólo en ubicaciones privadas.
- Sin permiso `points_manage` no se puede administrar. Tablas y RPC nuevos no son accesibles a `anon`/`authenticated`. La ruta de integración usa la credencial exclusiva del conector, no una sesión de miembro ni la clave KYNCODE.
- QR continúa premiando el uso del enlace, no la presencia física. Para asistencia real usar el registro/importación autorizada de eventos. El cierre cronológico conserva las rachas y evita dobles acreditaciones.

## Pruebas

PGlite comprueba transacciones, idempotencia, ventana de publicación, entrega tardía, cupo y bloqueo de reclamos directos. Pruebas del adaptador verifican credenciales y correos verificados; el script se ejecuta contra mocks sin llamar a Google. Playwright usa sesiones y datos sintéticos, no el perfil del usuario.

Comandos: `npm test`, `npm run typecheck:tests`, `npm run test:browser`, `npm run build`, `git diff --check`. No existe script lint. Se agregó Zod para contratos de entrada/salida; no se cambiaron las validaciones anteriores ni se tocó `.env`.

Referencias oficiales: [configuración de Forms y VERIFIED](https://developers.google.com/workspace/forms/api/reference/rest/v1/forms#EmailCollectionType), [Apps Script con Forms API](https://developers.google.com/workspace/forms/api/guides/apps-script-setup), [respuestas de Forms](https://developers.google.com/apps-script/reference/forms/form-response).
