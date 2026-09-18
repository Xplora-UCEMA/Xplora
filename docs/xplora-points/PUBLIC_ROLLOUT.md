# Acceso anticipado a la cuenta

La web se publica con el acceso a la cuenta oculto por defecto en el header compartido de Xplora, Startup Day y Sponsors, tanto para visitantes como para miembros. La ruta `/cuenta` y el login siguen funcionando por enlace directo.

Flag pública de build: `VITE_PUBLIC_MEMBER_ENTRY_ENABLED`. Solamente el valor exacto `true` muestra el botón (Iniciar sesión / Mi cuenta). Ausente o cualquier otro valor lo oculta. Para habilitarlo, configurar `true` en Netlify y volver a desplegar; no requiere cambios de base ni backend. No es un secreto.

Esto no es control de acceso: cualquiera que conozca `/cuenta` puede iniciar sesión. Los permisos siguen siendo responsabilidad del backend.

Verificación: Playwright prueba la flag apagada por defecto y el acceso directo. Ejecutar también `tests/browser/member-navigation.spec.ts` con la variable de proceso `VITE_PUBLIC_MEMBER_ENTRY_ENABLED=true` para verificar la variante visible. No se modifican archivos `.env`.
