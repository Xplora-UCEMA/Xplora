# Xplora Points — implementación y operación

Estado al 18/09/2026: Points está instalado y habilitado contra Supabase de producción. Las migraciones base `202609170000_member_access.sql`, `202609170001_xplora_points.sql`, `202609170002_points_crm_privileges.sql`, `202609170003_google_forms_tasks.sql` y `202609170004_google_forms_central.sql` fueron aplicadas con autorización explícita. Esta revisión incorpora al repositorio el hub de cuenta, la entrega privada de entradas QR y su cobertura; la migración `202609180005_private_qr_ticket_inventory.sql` todavía requiere aplicación explícita antes de cargar stock o desplegar el backend QR. La entrada pública “Mi cuenta” queda oculta en el build de producción, pero `/cuenta` continúa accesible por URL directa.
La cuenta está en `/cuenta`; el panel de gestión, en Data → Xplora Points.

## Puntos por evento y CSV de asistencia

1. En el formulario de creación/edición de Eventos, activar **Participa en Xplora Points**, elegir categoría, puntos base y fecha/hora. Requiere permiso `points_manage`. Los topes son 20 / 50 / 100 según categoría.
2. En la importación de participantes, vincular ese evento y subir el CSV. En modo automático se necesita una columna de asistencia/check-in; una lista de emails sin asistencia sólo inscribe. Usar **Todos asistieron** únicamente si el archivo contiene asistentes confirmados.
3. El backend guarda la asistencia y los triggers de la base acreditan los puntos al miembro verificado vinculado al mismo contacto. No se crea una Task manual adicional para pagar esa asistencia. Se aplica el mayor multiplicador de racha, no ambos.
4. Reimportar el mismo CSV o repetir un email no duplica el premio. Una lista posterior de inscriptos tampoco revierte una asistencia ya confirmada.
5. Al terminar todas las importaciones, cerrar el evento desde **Xplora Points → Eventos y rachas**. No se cierra automáticamente con cada CSV porque puede ser un archivo parcial. Los eventos anteriores deben estar cerrados para liquidar los siguientes; una asistencia posterior queda pendiente hasta que se resuelva ese orden. No se acreditan eventos futuros.

Verificación específica: `server/tests/event-csv-points.test.ts` sube archivos multipart al controlador real de importación y adapta su transporte REST a PostgreSQL local (PGlite) con las migraciones reales. Comprueba inscripción sin premio, ausencia sin premio, asistencia por 40 puntos, emails duplicados, reimportación y cierre sin doble acreditación. No accede a Supabase ni genera puntos productivos.

## Acceso local conectado a la base real

La misma entrada por email crea una cuenta al verificar el acceso o reutiliza la existente. No crea contactos del CRM ni cambia permisos de contactos/asistencias. El backend vincula únicamente un contacto existente del mismo email para mostrar su historial.

API local: `http://127.0.0.1:8788`. Interfaz: `http://127.0.0.1:5174/cuenta`.

Desde esta copia local, sin `.env`, iniciar la API con:

```powershell
powershell.exe -NoProfile -File scripts/start-member-local.ps1 -ConfigRoot "C:\Users\Juanv\OneDrive\Documentos\Folders\Xplora landing"
```

El launcher usa la configuración existente del servidor mediante dotenv, sin copiar ni editar archivos. Genera una clave de sesión local aleatoria y la guarda cifrada con Windows DPAPI (usuario actual), fuera del repositorio, en `%LOCALAPPDATA%\Xplora\local-member-access\member-session-key.dpapi`. No modifica la clave del servidor existente. El archivo cifrado debe conservarse para mantener las sesiones entre reinicios.

La API escucha sólo en loopback. Conserva la integración KYNCODE y espera `Loly.connect('Express')` antes de escuchar. No aplica migraciones al iniciar. Points está habilitado: el saldo se obtiene del servidor y la bienvenida se acredita una sola vez. El caso de programa no instalado mantiene un estado informativo, nunca un saldo ficticio.

Para iniciar Vite en otra terminal de esta copia, sin secretos en el cliente:

```powershell
$env:API_PORT = '8788'
$env:VITE_API_ORIGIN = ''
$env:VITE_SUPABASE_URL = 'http://127.0.0.1:54321'
$env:VITE_SUPABASE_KEY = 'local-preview-public-placeholder'
$env:VITE_PANEL_PATH = '/panel'
npm run dev:vite -- --host 127.0.0.1 --port 5174 --strictPort
```

Los valores públicos de Supabase son placeholders para esta copia: el acceso de miembros usa la API Express real, no Supabase Auth en el navegador. El panel administrativo requiere su configuración pública normal; no se está desplegando ni probando aquí.

Prueba real completada el 17/09/2026: Resend aceptó el correo “Tu acceso a Xplora” para el email autorizado y el usuario confirmó “Sí, entré a mi cuenta”. El enlace dura 10 minutos, requiere confirmar en la página y debe abrirse en esta computadora mientras los servidores locales estén encendidos. No se accedió a la bandeja de entrada ni se imprimieron códigos/tokens.

Verificaciones automatizadas: pruebas Node/PostgreSQL local (`npm test`), navegador con respuestas simuladas (`npm run test:browser`), tipos de pruebas (`npm run typecheck:tests`) y compilación (`npm run build`). No hay script de lint definido.

## Backend de producción: actualización compatible y acotada

Railway `Xplora back` / servicio `Xplora` / entorno `production` ejecutaba el commit `a54e90eeaaea460e799a40fb235e3b157c0d6a0e` de `juanVeronelli/Xplora`, distinto de la base de esta copia. Para no promover cambios ajenos ni publicar frontend, se preparó un parche sobre esa versión exacta: sólo el importador de asistencia y la baja de contactos pasan a usar el cliente servidor, conservando los middleware de autenticación, staff y permisos. La baja usa la función transaccional de Points y sólo conserva el flujo anterior cuando esa función aún no existe; nunca ante un error real de SQL.

- Despliegue Railway: `b7de196f-f3a9-4ac0-8d5b-511797ed4a76`, estado SUCCESS. `/api/health` devolvió `ok: true`, `env: production`.
- Fuente preservada localmente: `C:/Users/Juanv/Projects/Xplora backend points deploy`, rama `codex/backend-points-compat`, commit `983168c`. No se pusheó.
- Artefacto sólo API: `C:/Users/Juanv/AppData/Local/Temp/xplora-points-api-20260917`, con `dist-server`, package/lock originales, Dockerfile Node 22.23.2 y healthcheck. No incluye `dist/`, fuentes de frontend ni archivos `.env`.
- Comandos de preparación: `npm ci --ignore-scripts`, prueba `server/tests/points-crm-compat.test.ts`, typecheck estricto y `npm run build:server`; luego `railway up` con proyecto/servicio/entorno explícitos y `--path-as-root --detach`.

**Antes del próximo despliegue automático desde GitHub**, incorporar el parche de compatibilidad a la rama que alimenta Railway, sin publicar la web local. La configuración de origen de Railway no se cambió: un despliegue del código remoto anterior sin este parche perdería la compatibilidad con los nuevos permisos. No revertir sólo el backend a la versión anterior sin planificar también esta compatibilidad.

Preflight real: cero vínculos verificados duplicados y Points aún no instalado. Tras migrar: tablas privadas disponibles; `anon` y `authenticated` conservan únicamente SELECT sobre contactos/asistencias y sus políticas RLS existentes. No tienen acceso al ledger. No se borraron datos ni se crearon asistencias/canjes de prueba. LaBitConf permanece inactiva y el inventario real está vacío.

## Reglas implementadas

- Cuenta con email confirmado: 20 puntos, una única vez.
- Compromiso: cuentan las asistencias a los eventos inscriptos. No anotarse no corta esta racha; anotarse y faltar sí.
- Calendario: cuenta asistir a todos los eventos consecutivos incorporados al calendario de Points. Saltear uno corta esta racha.
- Tope de ambas rachas: 5. Compromiso: ×1, ×1.5, ×2, ×2.5, ×3. Calendario: ×1, ×3, ×4, ×5, ×6.
- Se toma el mayor multiplicador, nunca se suman ni se multiplican entre sí. Sólo afecta a asistencia; no al registro, QR, encuestas o premios. Las fracciones se redondean hacia abajo.
- Bases máximas: normal 20, grande 50, muy grande 100; acción puntual 100.
- Saldo sin vencimiento ni un límite comercial de acumulación: PostgreSQL `numeric`, transporte de saldo como texto y `BigInt` en la interfaz.
- Cada acreditación tiene una fuente única por miembro. Canjes, inventario y débito se resuelven en una transacción con bloqueos y clave de reintento.
- LaBitConf cuesta 150. La recompensa nace pausada y sin entradas; no hay stock ficticio.

## Preparar un entorno local o de pruebas

1. Usar una base Supabase de prueba, nunca la de producción para probar canjes.
2. Deben existir las tablas del CRM y las cuentas del archivo `supabase-setup-member-accounts.sql`.
3. Respaldar la base de prueba. Verificar duplicados antes de aplicar la migración:

   ```sql
   select usuario_id, count(*)
   from public.member_accounts
   where usuario_id is not null and email_confirmed_at is not null
   group by usuario_id having count(*) > 1;
   ```

   Si hay resultados, resolver la identidad de esas cuentas manualmente; no borrar ni fusionar datos automáticamente.
4. Desplegar primero el backend compatible. Aplicar `202609170000_member_access.sql`, después `202609170001_xplora_points.sql` y `202609170002_points_crm_privileges.sql` desde `supabase/migrations/`. Para importar tickets privados aplicar además `202609180005_private_qr_ticket_inventory.sql` antes de ejecutar `commit`. Son transaccionales, requieren los roles habituales de Supabase y no se ejecutan al iniciar el servidor. La migración principal de Points se aplica una sola vez. Las tres migraciones iniciales ya se aplicaron a producción con autorización; la migración de tickets todavía debe aplicarse de forma explícita antes de cargar stock.
5. Configurar secretos del entorno de prueba fuera del código: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MEMBER_JWT_SECRET` (aleatorio, al menos 32 caracteres), `POINTS_TICKET_FINGERPRINT_SECRET` (aleatorio, estable y de al menos 32 bytes), `RESEND_API_KEY`, `RESEND_FROM` y `PUBLIC_SITE_URL`. El remitente debe estar autorizado en Resend. Los tickets privados reutilizan la configuración Cloudinary existente. Nunca usar variables `VITE_*` para estas claves.
6. Configurar el frontend para esa misma instancia de prueba y el origen local del API. No poner claves privadas en variables VITE ni NEXT_PUBLIC.
7. `npm ci`, luego `npm run dev`. Por defecto Vite usa 5173 y el API 8787. Revisar configuración antes de iniciar: el SDK de observabilidad existente se conserva.
8. Dar al operador de prueba `points_manage` o `access_total` mediante el mecanismo de staff existente.

Se validaron email/login y saldo de bienvenida contra los servicios reales. Importaciones, canjes y sus límites se prueban con fixtures y PostgreSQL local; no se dispararon canjes ni importaciones ficticias en producción.

## Operación desde el panel

### Eventos y rachas

Al crear/editar un evento se puede activar Points, elegir categoría, base y fecha/hora real. Incluir TODOS los eventos que deban contar en la racha de calendario antes de liquidar asistencias posteriores.

Importar asistencia verificada por el flujo existente de Luma/CSV. Registrar un email no prueba asistencia: se usa `asistio=true`. Los puntos se acreditan automáticamente para cuentas verificadas; quien crea su cuenta después puede recuperar su asistencia vinculada al mismo email.

Cerrar acreditaciones en orden cronológico después de revisar el archivo. Un evento abierto puede acreditar a quienes asistieron; los siguientes esperan el cierre del anterior. Las ausencias sólo se liquidan al cerrar. La política y asistencia premiadas/cerradas son definitivas: no se reordenan ni se corrigen silenciosamente porque cambiarían rachas ya premiadas. Revisar fecha, base y registros antes de activar/importar. Si se requiere una corrección histórica, diseñar una compensación auditada; no editar el ledger.

La migración quita escrituras directas de `usuarios` e `inscripciones_evento` a sesiones públicas/ordinarias de Supabase. Los importadores y eliminación existentes se adaptaron al API con permiso de staff y cliente de servicio. Esto impide autoacreditar asistencia o apropiarse del email de un contacto desde el navegador.

### Ejemplo de configuración: Startup Day

1. Configurar Startup Day como evento muy grande, base 100, con fecha real. Hacerlo antes de liquidar eventos posteriores.
2. Importar y revisar asistentes; cerrar acreditación.
3. Crear acción de tipo encuesta por 30, con asistencia requerida a Startup Day, vencimiento futuro y cupo real.
4. Compartir su enlace/QR. El formulario pide valoración y comentario, los guarda y acredita una sola vez.
5. Para LaBitConf, usar el flujo de ZIP privado documentado abajo; revisar la vista previa y recién entonces importar. Habilitar la recompensa sólo después de verificar el stock.

Estos valores son un ejemplo de configuración, no un objetivo del usuario. LaBitConf es una recompensa más del catálogo: no existe una recompensa principal ni una meta obligatoria de puntos.

### Cuenta simplificada y Tasks

- `/cuenta`: hub personal. `/cuenta?vista=tasks`: acciones para sumar Points. `/cuenta?vista=recompensas`: catálogo y Mis canjes. `?vista=rachas`: las dos rachas y sus reglas desplegables. `?vista=movimientos`: acreditaciones y canjes.
- Se retiraron la meta de 150, la recompensa destacada, el progreso hacia una recompensa y el iframe genérico de inscripción. La brújula 3D aparece sólo en el saldo dentro del panel; no en recompensas ni estados vacíos.
- `GET /api/member/points/tasks` exige una sesión verificada, usa sólo consultas de lectura y responde con `no-store`. Incluye eventos configurados en Points; sólo los futuros, abiertos y no archivados pueden tener un enlace HTTP(S) a su inscripción. Los eventos pasados del miembro mantienen su estado, sin enlace para inscribirse.
- Las encuestas de un evento aparecen únicamente a quienes tienen asistencia verificada. Las completadas quedan en un desplegable. Encuestas sin evento, QR y premios manuales no se publican en Tasks ni pierden sus restricciones existentes.
- `POST /api/member/points/tasks/:id/claim` comprueba tipo encuesta, evento y asistencia del miembro autenticado. No acepta identidad, puntos ni hash desde el cliente. Llama a `xp_claim`, que conserva cupo, vencimiento, validación, bloqueos e idempotencia. El hash permanece en el servidor.
- Google Forms también puede aparecer como Task, sólo conectado y habilitado. El enlace público lo confirma Google durante la conexión; abrirlo no acredita. El participante debe usar el mismo correo verificado de su cuenta. Al regresar a Xplora se refrescan saldo y tareas.
- En la cuenta real, Tasks quedó vacío porque no hay acciones elegibles configuradas. No se crearon eventos, encuestas, asistencias ni puntos ficticios para llenar la pantalla. Los datos poblados de las capturas son fixtures aislados.
- Con autorización explícita posterior, se aplicó `202609170003_google_forms_tasks.sql` y se desplegó sólo la API en Railway. Se corrigió la clave de sesiones productiva con autorización específica y se republicó el mismo artefacto (`b23654f7-0c52-41cc-a0d2-6cd0c7b35ea6`). Healthcheck 200; rutas privadas y conector desconocido rechazados con 401. No se publicó la web ni se hizo push. Falta conectar/autorizar el script en Google y realizar la prueba real. Ver `GOOGLE_FORMS_TASKS.md`.

### Acciones, QR y premios

El panel genera el enlace y un QR descargable. Guardarlos al crearlos: sólo se persiste un hash, no el token original. Es un enlace compartible, no prueba física de presencia. Para evitar circulación abierta, limitar vigencia, cupo y exigir asistencia a un evento. Cada cuenta cobra una sola vez por acción.

Encuestas y QR se acreditan al completar el flujo en la cuenta. Concursos, sorteos y seguimiento de redes usan acciones de tipo premio, otorgadas por el equipo a una cuenta verificada; no se simula una verificación automática de redes externas.

Los códigos/instrucciones digitales se entregan al confirmar el canje y permanecen en Mis canjes. No hay logística física. Una eliminación explícita de contacto borra cuenta/datos personales/puntos de forma atómica, pero NO devuelve al stock un ticket consumido.

### Entradas QR privadas de LaBitConf

La carga no se hace desde Ops. Se procesa localmente en dos pasos explícitos:

```bash
npm run tickets:labitconf -- preview --zip /ruta/entradas.zip --out /ruta/preview
npm run tickets:labitconf -- commit --manifest /ruta/preview/manifest.json --reward UUID_DE_LA_RECOMPENSA
```

`preview` no toca Supabase ni Cloudinary. Inspecciona el ZIP sin extraer rutas del usuario, aplica límites de cantidad, tamaño, ratio y píxeles, y rechaza traversal, symlinks, archivos cifrados o anidados y formatos no admitidos. Normaliza las imágenes sin metadata, exige exactamente un QR decodificable mediante el decoder local Node (con helper nativo de macOS como fallback), genera una plancha visual y un manifest firmado. Detecta tanto imágenes idénticas como el mismo contenido QR en archivos distintos. El manifest guarda sólo SHA-256 de imagen y una huella HMAC del QR; nunca guarda ni imprime su contenido. La carpeta generada incluye un `.gitignore` defensivo, pero contiene entradas reales: guardarla como secreto y eliminarla después de confirmar el import.

`commit` vuelve a validar firma, rutas y hashes. Acepta únicamente la recompensa inactiva titulada exactamente `Entrada a LaBitConf`, con costo 150, y rechaza stock legacy. Compara el lote contra todo el inventario, sube cada PNG como asset Cloudinary `authenticated` sin overwrite e inserta el lote con `xp_import_ticket_inventory`. La migración `202609180005_private_qr_ticket_inventory.sql` agrega unicidad global por huella y valida el descriptor completo. La inserción en PostgreSQL es atómica y el comando nunca activa la recompensa. Ante un fallo no borra assets automáticamente, porque otro import concurrente podría haberlos referenciado; se reconcilian antes de reintentar.

Al canjear, `xp_redeem` conserva la asignación atómica existente. La base guarda un descriptor versionado, no una URL pública ni el payload QR. `GET /api/member/points/redemptions/:id/qr` comprueba dueño y proxyea los bytes desde una URL privada corta, con `no-store`, límite de tamaño, magic bytes y verificación SHA-256. La interfaz obtiene un blob autenticado sólo cuando el miembro abre su entrada en Mis canjes y revoca su URL local al cerrar. El email transaccional adjunta el mismo QR por CID/base64 y mantiene un enlace de respaldo a Mis canjes; si falla email o storage, el canje no se revierte.

### Acceso y privacidad

Email único para crear cuenta o entrar. Magic link de alta entropía y código de seis dígitos, ambos con hash HMAC y vencimiento de 10 minutos. Comparten un único uso. Cinco intentos por código; reenvío con espera y límites por IP/email. El enlace requiere un clic de confirmación antes del POST, para no consumirlo con lectores automáticos de correo. Los tokens del enlace se limpian de la URL y no se registran.

Se conserva compatibilidad con enlaces anteriores. Crear cuenta no suscribe automáticamente al newsletter. El perfil conserva nombre, apellido, email, foto, estudios, empleo, teléfono y CV. Los handlers de error y KYNCODE existentes no se reemplazaron.

### Eventual cierre

`xp_program` contiene aviso y fechas; exige al menos 90 días entre anuncio y cierre. Publicar el aviso con meses de anticipación, permitir canjear en ese período y comunicarlo por los canales de la comunidad. No hay botón de cierre inmediato en el panel.

No cambiar fechas retroactivamente. Al llegar la fecha se bloquean canjes/acciones y la cuenta muestra el cierre. La retirada completa del programa también requiere detener nuevas campañas de asistencia/registro; no se implementó un apagado automático de la web ni eliminación de saldos.

## Verificaciones

- `npm run typecheck:tests`: tipos de servidor y pruebas.
- `npm test`: 78 pruebas; incluye importación CSV → acreditación, PostgreSQL local PGlite, rachas, redondeo, expiración, roles, canjes, borrado, inventario QR privado, deduplicación global, email idempotente, ownership del proxy, compatibilidad CRM, emails HTML, contratos del conector de Google y seguridad de Tasks.
- `npm run test:tickets:labitconf`: 12 pruebas del ZIP local y su wrapper TypeScript, decoder QR real, fallos explícitos del decoder, duplicados exactos/semánticos, firma, límites, traversal, archivos anidados/corruptos y ausencia de payloads.
- `npm run test:browser`: 26 pruebas con API de fixtures y Chrome aislado, sin perfil personal. Incluye creación/conexión/habilitación de Tasks, descarga privada, formulario externo sin reclamo del navegador, QR lazy en Mis canjes —también en modo read-only con Points pausado— y actualización de saldo al regresar, además de las verificaciones anteriores de cuenta, navegación, canjes y acceso.
- `npm run build`: frontend y servidor. No existe script lint.
- `git diff --check`: control de whitespace.
- `npm audit --json`: reporta 13 vulnerabilidades en el árbol actual (1 baja, 4 moderadas, 6 altas, 2 críticas). No se ejecutó audit fix ni actualizaciones masivas fuera del alcance.

Límites de esta validación: PGlite no sustituye una prueba de concurrencia con conexiones independientes de PostgreSQL; las pruebas automatizadas del navegador usan datos sintéticos. La verificación manual real cubrió login, bienvenida y permisos, no canjes/importaciones productivos. Las capturas de email no validan todos los clientes de correo. Revisar esas integraciones y las dependencias antes de cualquier publicación futura.

## Archivos principales

- Migraciones: `supabase/migrations/202609170001_xplora_points.sql` y `202609170002_points_crm_privileges.sql`.
- API: `server/src/http/controllers/points.controller.ts`, rutas/permisos y servicios de cuenta/eliminación.
- Email: `server/src/services/member-access-email.ts`.
- Cuenta: `src/components/member/`, `src/pages/MemberAccount.tsx`, `src/pages/MemberConfirm.tsx`, `src/lib/points.ts`, `src/styles/points.css`.
- Administración: `src/components/admin/PointsPanel.tsx`, integración en `src/pages/Admin.tsx`.
- Pruebas: `server/tests/points.test.ts`, `server/tests/member-access-email.test.ts`, `tests/browser/points.spec.ts`, `playwright.config.ts`.
- Dependencias y scripts: `package.json`, `package-lock.json`.

Diseño: se reutilizó la identidad real y el logo de Xplora. La compactación anterior fue rechazada por exceso de texto y desorden; esta versión reemplaza el apilado por vistas separadas. La revisión independiente inspeccionó 12 capturas, pidió corregir el encabezado de 320 px y luego marcó ese único hallazgo resuelto (`ship` para entrega local). El sistema visual está documentado por separado del recap de Startup Day.
