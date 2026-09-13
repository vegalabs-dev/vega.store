# Protección del panel de VegaStore

La migración `harden_vega_admin` se aplicó en Supabase el 12 de septiembre de 2026, versión `20260912230954`. GitHub Pages publicó los archivos compatibles de la tienda y la redirección del panel antiguo. Las futuras publicaciones deben mantener coordinadas las reglas de la base de datos y los archivos web.

La ampliación de fichas y mensajes corresponde a la migración `20260913035721_client_profiles_and_messages.sql`, aplicada el 13 de septiembre de 2026.

## Cambios

- La cuenta de administrador pertenece a una lista privada en la base de datos. Registrarse en Supabase no concede permisos de administración.
- RLS controla las operaciones aunque alguien use la API directamente o modifique el navegador. Solo el administrador puede gestionar clientes, catálogo, promociones e imágenes.
- Los visitantes no pueden leer correos, teléfonos, tokens de pedido ni hashes de acceso. Un enlace privado permite consultar únicamente los servicios asociados y su estado.
- Cada enlace contiene 192 bits aleatorios. Los pedidos conservan las huellas SHA-256; las fichas guardan el código reutilizable bajo los permisos exclusivos del propietario para poder preparar mensajes sin cambiar el enlace. El código viaja en `x-vega-access`, no en filtros de URL. La tienda elimina el fragmento de la barra de direcciones al abrirlo y mantiene la sesión de consulta separada de Supabase Auth.
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

En **Fichas de clientes** se puede buscar por nombre, usuario, teléfono o código de ficha. Una ficha agrupa los servicios de una persona y conserva su identidad cuando cambian sus datos de contacto. El correo de activación se mantiene por servicio.

El registro manual permite crear una ficha nueva con nombre o alias, teléfono o usuario de WhatsApp, o añadir un servicio a una ficha existente. La operación es atómica en la base de datos. La tienda también permite indicar un usuario de WhatsApp en lugar del teléfono.

El botón **💬** abre un mensaje editable con el enlace privado de esa ficha. Hay atajos de enlace, activación, vencimiento y renovación. Con teléfono se abre el chat directamente; sin teléfono se abre el selector de chats. También hay un botón para copiar el texto. Ninguna de estas acciones envía mensajes automáticamente.

Los enlaces anteriores se conservan. **Revocar y crear otro enlace** invalida explícitamente tanto el enlace de la ficha como los enlaces anteriores de sus pedidos. Abrir un mensaje o actualizar el contacto no cambia el enlace. Vincular un servicio a otra ficha revoca el acceso de la ficha anterior a ese servicio.

Durante la migración se agrupan únicamente los registros existentes por su teléfono normalizado. Los pedidos futuros no se asocian a una ficha por declarar el mismo teléfono o usuario: el administrador debe vincularlos o deben demostrar posesión del mismo código privado. Las fichas y sus códigos no se pueden consultar desde la API anónima ni desde cuentas ajenas.

## Stock y ofertas programadas

Migración `20260913043149_stock_and_scheduled_offers.sql`, aplicada el 13 de septiembre de 2026.

En **Catálogo → Editar**, el administrador puede mantener stock ilimitado (`NULL`), fijar los cupos disponibles o marcar un producto como agotado. Los 16 productos existentes conservan el modo ilimitado hasta configurar sus cantidades reales. Todos los planes de un producto comparten el stock.

Cada solicitud se vincula por `servicio_id`; un nombre repetido nunca elige arbitrariamente otro producto. Los registros anteriores se vinculan solo cuando el nombre es único y las ventas ya activadas no se descuentan retroactivamente. Una solicitud antigua sin producto asociado pide seleccionarlo antes de aprobarla. Los servicios manuales fuera del catálogo no llevan inventario.

El trigger `vega_private.order_catalogue_sync` usa los permisos del llamador y un bloqueo de fila para descontar un cupo al activar una venta. La aprobación y el descuento forman parte de la misma transacción. La API anónima no puede modificar el stock ni activar pedidos. Repetir la aprobación, restaurar o renovar el mismo acceso no descuenta otra unidad. Cancelar o eliminar un acceso entregado no repone inventario: el administrador debe hacerlo explícitamente. Cambiar a otro producto consume una unidad del nuevo producto. Para vender un acceso adicional, se registra otro servicio.

La edición del stock comprueba `stock_version`, evitando sobrescribir una venta realizada mientras el formulario estaba abierto. Editar otros campos sin tocar la cantidad no vuelve a guardar un stock antiguo. Ocultar un producto conserva las ventas que lo referencian y permite volver a mostrarlo desde Editar.

Los precios de oferta sin fechas conservan su funcionamiento anterior. Al programarlos se requieren inicio y fin, en hora de Perú, guardados como instantes `timestamptz`. El inicio es inclusivo y el fin exclusivo. Durante ese intervalo, los productos disponibles con descuentos aparecen en **Ofertas que terminan pronto**. El navegador actualiza las fechas y vuelve a consultar disponibilidad al comprar; Supabase valida de nuevo el producto, el plan y el precio. Un precio vencido enviado desde una pestaña antigua se rechaza. `precio_acordado` conserva el importe válido al crear la solicitud, visible al administrador aunque el catálogo cambie después. Las solicitudes no reservan cupos; la disponibilidad se confirma al aprobar el pago.

Las pruebas adicionales cubren stock agotado, cantidades no negativas, aprobación repetida, dos pedidos compitiendo secuencialmente por la última unidad, restauración, registro manual sin fichas huérfanas, productos con nombres duplicados, descuentos futuros y vencidos, filtros combinados y conversión de fechas de Perú. La prueba local no es una prueba de carga concurrente; la exclusión entre transacciones depende del bloqueo `FOR UPDATE` de PostgreSQL.

## Verificación

Con Node.js 24: `npm ci --ignore-scripts` y `npm test`.

Las 31 pruebas usan datos sintéticos y no se conectan a producción. Cubren consultas anónimas, enlaces separados, rechazo de modificaciones por cuentas ajenas, pedidos válidos y manipulados, permisos del propietario, imágenes y XSS. Las políticas se ejecutan en PostgreSQL mediante PGlite; el SHA-256 de pgcrypto se representa mediante la función SHA-256 integrada de PostgreSQL. El flujo HTML/JavaScript se comprueba con jsdom.

Después del despliegue se verificó por HTTP: consultas anónimas de contactos, hashes e historial rechazadas con 401; consulta de servicios contratados sin enlace devuelve cero filas; catálogo público devuelve 16 servicios; las tres páginas publicadas contienen los cambios. Los registros existentes siguen siendo 11 clientes y 30 imágenes. La lista privada contiene una sola cuenta confirmada. No se inició sesión usando la contraseña del propietario ni se crearon compras reales de prueba.

El asesor de seguridad de Supabase únicamente conserva el aviso de protección de contraseñas filtradas desactivada. El límite de tres pedidos pendientes por enlace evita duplicados habituales; no es una protección completa contra spam distribuido. Esta actualización no activa MFA ni cambia contraseñas.

Referencias: [RLS en Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [control de acceso a Storage](https://supabase.com/docs/guides/storage/security/access-control).
