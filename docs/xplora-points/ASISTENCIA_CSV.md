# Asistencia y puntos desde Eventos

En localhost: **Ops → Data → Eventos → Editar → Asistencia del evento**.

1. Configurar y guardar Xplora Points (fecha, categoría y puntos base).
2. Volver a editar y elegir CSV o Excel con Email y Asistió (sí/no), o columnas de check-in de Luma.
3. Presionar **Importar asistencia**. Elegir un archivo todavía no lo importa.
4. Si el archivo contiene únicamente asistentes y no tiene columna de asistencia, seleccionar **Todos asistieron**. No usar ese modo con una lista de inscriptos.

Se usa el importador autorizado existente y los triggers de Points, sin un segundo circuito de acreditación. Sólo asistencia confirmada, identidad vinculada por email y cuenta verificada. Un registro de puntos por miembro/evento impide duplicar en reimportaciones. Las rachas mantienen su regla cronológica: cerrar los eventos anteriores pendientes desde Points; no se cierran automáticamente al importar un archivo parcial. Eventos futuros no acreditan antes de su fecha.

La interfaz muestra asistentes reconocidos, no promete que ese número sea el de acreditaciones inmediatas. Sin política de Points se advierte al operador. Los cambios de política sin guardar bloquean la carga; los eventos cerrados no aceptan modificaciones de asistencia. La carga sigue disponible en Archivo por compatibilidad.

Guardar contenido del evento omite los totales y la fecha de importación del PATCH para no sobrescribir ni esta importación ni las de otro operador.

Verificación local: `server/tests/event-csv-points.test.ts` ejecuta CSV → controlador Express → SQL real de migraciones en PGlite (sí/no, registro sin asistencia, email duplicado, reimportación y cierre). `tests/browser/event-attendance.spec.ts` comprueba carga explícita desde Editar, resultado, política sin guardar, conservación de totales y pantallas de escritorio/móvil con fixtures. No se importaron datos ni se modificaron saldos en producción para estas pruebas. No hay nueva migración ni deploy en este cambio.
