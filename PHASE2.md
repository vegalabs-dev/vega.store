# Fase 2 — Panel y catálogo en revisión

Esta rama conserva el chat IA preparado anteriormente y añade la reorganización del panel, editor en cuatro grupos, vista previa, duplicación, borradores privados en Supabase, publicación transaccional, orden configurable y consulta paginada del catálogo (12 productos por página).

## Publicación pendiente

La web principal y la base de producción no se modifican al crear esta rama. Antes de publicar:

1. Confirmar una copia completa reciente de la base y los archivos de Storage, con recuperación ensayada fuera de producción.
2. Revisar las pruebas de esta rama y la distribución en computadora y celular.
3. Convertir el cambio candidato de Supabase en una migración generada por su CLI; aplicar primero la migración y luego el frontend.
4. Comprobar propietario/visitante/cliente, conservación de datos y carga de la web publicada.

La rama incluye un flujo de pruebas sin credenciales de producción. El entorno de trabajo local dejó de estar disponible durante la implementación. GitHub Actions ejecuta las pruebas con datos sintéticos.

## Reglas

- Guardar borrador nunca actualiza el producto público.
- Publicar bloquea la fila, compara la versión editorial y, si se tocó stock, su versión.
- El stock no editado conserva ventas concurrentes.
- Repetir una publicación confirmada no duplica el producto.
- Duplicar comienza un producto oculto sin copiar ventas.
- Los planes, las imágenes existentes y la duración real de los servicios se conservan.
- Disponible y destacado primero; posición menor antes; agotados al final.
- El respaldo de gestión se amplía con los borradores; admite las copias anteriores. Sigue sin reemplazar un respaldo completo de Supabase/Storage.

## Alcance pendiente de la fase

El catálogo incorpora paginación y búsqueda en servidor. Las listas históricas de clientes/servicios conservan su comportamiento existente y todavía requieren su propia paginación en servidor; esta rama no afirma resolver ese punto. Los ajustes de contacto/pagos/monedas corresponden a la fase 3.

No se envían mensajes de WhatsApp, no se consultan pasarelas y no se reutiliza la clave de Gemini compartida en el chat.

## Archivos principales

- `panel-v2.js` / `panel-v2.css`: navegación y disposición.
- `catalogo-admin-v2.js`: editor, borradores y paginación.
- `supabase/changes/catalogue_workspace.sql`: cambio candidato; CI genera el nombre de migración mediante CLI antes de probar.
- `tests/browser.test.cjs` y `tests/database.test.cjs`: permisos, conflictos, idempotencia y recuperación.
