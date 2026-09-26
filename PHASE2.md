# Fase 2 — Panel y catálogo en revisión

Esta rama conserva el chat IA preparado anteriormente y añade la reorganización del panel, editor en cuatro grupos, vista previa, duplicación, borradores privados en Supabase, publicación transaccional, orden configurable y consulta paginada del catálogo y de la gestión de clientes y servicios (12 registros por página).

## Publicación pendiente

La web principal y la base de producción no se modifican al crear esta rama. Antes de publicar:

1. Confirmar una copia completa reciente de la base y los archivos de Storage, con recuperación ensayada fuera de producción.
2. Revisar las pruebas de esta rama y la distribución en computadora y celular.
3. Aplicar primero la migración generada por CLI y verificada en CI, y luego el frontend.
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

Catálogo, fichas, servicios contratados, pedidos, archivados y seguimiento consultan páginas en el servidor. Los contadores globales son independientes de la página visible. Los detalles de una ficha se cargan al abrirla y la búsqueda permite seleccionar clientes fuera de la página actual. Los ajustes de contacto/pagos/monedas corresponden a la fase 3.

Continúan pendientes la revisión visual en navegador real y el respaldo completo antes de publicar. Las pruebas DOM no sustituyen esa revisión.

No se envían mensajes de WhatsApp, no se consultan pasarelas y no se reutiliza la clave de Gemini compartida en el chat.

## Archivos principales

- `panel-v2.js` / `panel-v2.css`: navegación y disposición.
- `panel-datos-v2.js`: páginas y búsqueda de clientes/servicios, con detalle bajo demanda.
- `catalogo-admin-v2.js`: editor, borradores y paginación.
- `supabase/migrations/20260926014433_catalogue_workspace.sql`: migración generada mediante CLI; CI prueba el archivo comprometido.
- `tests/browser.test.cjs` y `tests/database.test.cjs`: permisos, conflictos, idempotencia y recuperación.
