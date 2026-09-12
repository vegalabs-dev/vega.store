# Protección del panel de VegaStore

La migración `harden_vega_admin` se aplicó en Supabase el 12 de septiembre de 2026, versión `20260912230954`. GitHub Pages publicó los archivos compatibles de la tienda y la redirección del panel antiguo. Las futuras publicaciones deben mantener coordinadas las reglas de la base de datos y los archivos web.

## Cambios

- La cuenta de administrador pertenece a una lista privada en la base de datos. Registrarse en Supabase no concede permisos de administración.
- RLS controla las operaciones aunque alguien use la API directamente o modifique el navegador. Solo el administrador puede gestionar clientes, catálogo, promociones e imágenes.
- Los visitantes no pueden leer correos, teléfonos, tokens de pedido ni hashes de acceso. Un enlace privado permite consultar únicamente los servicios asociados y su estado.
- Cada enlace contiene 192 bits aleatorios; solo se guarda su SHA-256 en la base de datos. El código viaja en `x-vega-access`, no en filtros de URL. La tienda elimina el fragmento de la barra de direcciones al abrirlo y mantiene la sesión de consulta separada de Supabase Auth.
- Una compra pública solo puede crear un pedido pendiente de un plan activo. No puede definir fechas, aprobarse, editarse ni borrarse por la API pública.
- Los textos procedentes de la base de datos se escapan al construir HTML. Los datos de productos dejan de insertarse como código en manejadores de botones.
- Se elimina el borrado automático de pedidos y cancelaciones de más de 24 horas. El administrador conserva las acciones manuales existentes.
- Las imágenes públicas siguen visibles. Las futuras subidas se limitan al administrador, formatos de imagen admitidos y 5 MB.

## Procedimiento de activación

1. Revisar que siga existiendo la misma cuenta confirmada del propietario en Auth. La migración se detiene si encuentra más de una cuenta activa o ninguna confirmada. No elige automáticamente entre varias cuentas.
2. Aplicar `supabase/migrations/20260912230954_harden_vega_admin.sql` mediante una conexión administrativa con escritura. La herramienta de consultas usa solo lectura; la herramienta específica de migraciones sí permitió aplicar los cambios. No deshabilitar RLS para resolver errores de acceso.
3. Publicar esta rama y la propuesta de redirección de `vegalabs-dev/vegalabs-dev.github.io`. El panel antiguo usa la misma base y debe retirarse para que no siga ejecutando su código anterior.
4. Comprobar la publicación de GitHub Pages, recargar el panel e iniciar sesión con la cuenta propietaria. Verificar catálogo, solicitudes, gestión de un cliente y generación de enlaces.
5. Confirmar por HTTP que las consultas anónimas de contactos se rechazan y que una consulta sin código no devuelve pedidos. Revisar los avisos de seguridad de Supabase.

La migración no elimina pedidos, servicios, registros de acceso ni archivos. Cambia los permisos, añade hashes de consulta inicialmente vacíos y modifica los valores predeterminados de fechas futuras a `now()`.

## Enlaces para clientes

Los clientes nuevos reciben su enlace al generar el pedido y pueden copiarlo en «Mis servicios». El botón de WhatsApp permite continuar si el navegador bloquea la ventana emergente.

Para compras anteriores: abrir **Gestionar → Generar enlace privado del cliente**. El administrador debe comprobar que el teléfono corresponde a ese cliente antes de compartirlo. La acción asigna un enlace nuevo a los registros con ese mismo teléfono y revoca sus enlaces anteriores. No se envían mensajes automáticamente.

Quien posea el enlace podrá consultar esos servicios. No sirve para editar datos ni concede acceso al panel administrativo. Si se pierde o se comparte por error, generar otro desde el panel.

## Verificación

Con Node.js 24: `npm ci --ignore-scripts` y `npm test`.

Las pruebas usan datos sintéticos y no se conectan a producción. Cubren consultas anónimas, enlaces separados, rechazo de modificaciones por cuentas ajenas, pedidos válidos y manipulados, permisos del propietario, imágenes y XSS. Las políticas se ejecutan en PostgreSQL mediante PGlite; el SHA-256 de pgcrypto se representa mediante la función SHA-256 integrada de PostgreSQL. El flujo HTML/JavaScript se comprueba con jsdom.

Después del despliegue se verificó por HTTP: consultas anónimas de contactos, hashes e historial rechazadas con 401; consulta de servicios contratados sin enlace devuelve cero filas; catálogo público devuelve 16 servicios; las tres páginas publicadas contienen los cambios. Los registros existentes siguen siendo 11 clientes y 30 imágenes. La lista privada contiene una sola cuenta confirmada. No se inició sesión usando la contraseña del propietario ni se crearon compras reales de prueba.

El asesor de seguridad de Supabase únicamente conserva el aviso de protección de contraseñas filtradas desactivada. El límite de tres pedidos pendientes por enlace evita duplicados habituales; no es una protección completa contra spam distribuido. Esta actualización no activa MFA ni cambia contraseñas.

Referencias: [RLS en Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [control de acceso a Storage](https://supabase.com/docs/guides/storage/security/access-control).
