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

Las 34 pruebas usan datos sintéticos y no se conectan a producción. Cubren consultas anónimas, enlaces separados, rechazo de modificaciones por cuentas ajenas, pedidos válidos y manipulados, permisos del propietario, imágenes y XSS. Las políticas se ejecutan en PostgreSQL mediante PGlite; el SHA-256 de pgcrypto se representa mediante la función SHA-256 integrada de PostgreSQL. El flujo HTML/JavaScript se comprueba con jsdom.

Después del despliegue se verificó por HTTP: consultas anónimas de contactos, hashes e historial rechazadas con 401; consulta de servicios contratados sin enlace devuelve cero filas; catálogo público devuelve 16 servicios; las tres páginas publicadas contienen los cambios. Los registros existentes siguen siendo 11 clientes y 30 imágenes. La lista privada contiene una sola cuenta confirmada. No se inició sesión usando la contraseña del propietario ni se crearon compras reales de prueba.

El asesor de seguridad de Supabase únicamente conserva el aviso de protección de contraseñas filtradas desactivada. El límite de tres pedidos pendientes por enlace evita duplicados habituales; no es una protección completa contra spam distribuido. Esta actualización no activa MFA ni cambia contraseñas.

Referencias: [RLS en Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [control de acceso a Storage](https://supabase.com/docs/guides/storage/security/access-control).

## Interfaz compacta

El catálogo usa tarjetas pequeñas con imagen, disponibilidad, duración y precio. Las ofertas programadas se muestran en un carrusel horizontal, independiente del estilo de las tarjetas: avanza cada seis segundos, permite deslizar, tiene controles de navegación y pausa, y respeta la preferencia de movimiento reducido. Se detiene al interactuar, al abrir una ventana o al ocultar la pestaña. No crea ofertas ni modifica los descuentos de Supabase.

El acceso privado queda en un apartado desplegable. Cerrar sesión requiere confirmación tanto en la tienda como en el administrador. La X, Escape y tocar el fondo cierran la ventana sin cerrar sesión; las ventanas controlan el foco del teclado. Las comprobaciones usan datos sintéticos y no generan ventas reales.

## Propuesta de redacción con IA (sin activar)

Para una siguiente etapa: botón de redacción dentro del administrador, selección de producto y tono, función protegida en Supabase que verifique al propietario y limite las solicitudes, y Gemini Flash-Lite como proveedor inicial. La función leería solo los datos públicos del producto y devolvería un borrador editable; teléfonos, correos y enlaces privados se añadirían localmente después, cuando hicieran falta. La clave del proveedor se guardaría como secreto del servidor. La IA no decidiría precios, stock, fechas ni permisos y no enviaría mensajes automáticamente.

La generación con IA todavía no está conectada: requiere elegir proveedor y configurar su clave y presupuesto. Referencias: [Gemini API](https://ai.google.dev/gemini-api/docs/pricing), [secretos de Edge Functions](https://supabase.com/docs/guides/functions/secrets).

## Vigencia, historial y operaciones recuperables (13 de septiembre de 2026)

Migración aplicada: `20260913204706_service_management_and_history.sql`.

- Se conservan las fechas, compras originales, contactos, stock y enlaces privados existentes. La migración solo añade el inicio del período vigente, versión de edición y una referencia inicial en el historial. Las ampliaciones antiguas no se reconstruyen ni se presentan como regalos conocidos.
- «Ampliar o renovar» permite sumar tiempo, comenzar hoy o reemplazar la duración desde el inicio del período. Las fechas se calculan en PostgreSQL con calendario y horario de Perú. Los meses se ajustan al último día válido y una renovación vencida parte de hoy.
- Las ampliaciones y altas manuales usan identificadores de operación para que un reintento no duplique la venta. Las ampliaciones comprueban la versión y bloquean la fila para evitar sobrescribir un cambio concurrente. La activación calcula las fechas y descuenta stock dentro de la transacción.
- «Archivar» conserva el servicio. «Restaurar» recupera el estado anterior: una solicitud rechazada vuelve a Pendiente. El rol del navegador no tiene DELETE en pedidos, clientes, productos ni promociones. El historial no admite actualizaciones ni borrados; los registros nuevos se escriben mediante triggers.
- El historial público solo expone fechas, tipo y cantidad del cambio para los servicios autorizados por el enlace. No expone autor, datos de contacto, huellas de operación ni auditoría interna. Revocar el enlace también revoca su historial.
- «Por atender» se deriva de la fecha actual de vencimiento; al ampliar se actualiza sin notificaciones obsoletas. «Marcar atendido» es una confirmación manual, no un comprobante de entrega de WhatsApp. No se ha configurado un emisor automático ni se envían mensajes desde las pruebas.
- Los formularios advierten antes de descartar cambios. Las operaciones de guardado bloquean los controles correspondientes; los errores conservan los datos editados. Las consultas del catálogo y la geolocalización son independientes. Mientras el país no se resuelva solo se muestran productos sin restricción geográfica; también se puede elegir el país.

### Asistente Gemini

La función `vega-redactar` comprueba la sesión contra Supabase Auth y la lista de administradores antes de cualquier consulta o generación. Usa exclusivamente la clave pública de Supabase junto al JWT del propietario; no necesita `service_role`. El gateway `verify_jwt` está desactivado porque la función implementa esa autenticación y autorización de manera explícita. No retirar estas comprobaciones.

La integración queda inactiva sin el secreto `GEMINI_API_KEY`. Antes de activarla, reemplazar la clave compartida en el chat y guardar la nueva en **Supabase → Edge Functions → Secrets**. No ponerla en HTML, JavaScript, commits ni mensajes de prueba. `GEMINI_MODEL` es opcional y por defecto usa `gemini-3.1-flash-lite`. El límite inicial es 20 borradores por hora y 100 por día; las alertas de facturación se configuran aparte en Google.

Gemini recibe únicamente el nombre del servicio y el tipo de atajo. Genera una introducción opcional y el administrador decide si añadirla al mensaje. Las fechas, enlaces privados y contactos se conservan en el texto original del panel y no se envían al proveedor de IA. No hay envío automático de mensajes ni modificaciones de pedidos por IA.

### Verificación y reversión

Las 43 pruebas locales usan datos sintéticos. Cubren permisos, enlaces, inventario, meses de distinta longitud, renovaciones vencidas, reintentos, restauración de solicitudes, historial privado, avisos manuales y el endpoint de IA sin una clave real. Las huellas de las 13 compras, 13 fichas y del catálogo coincidieron antes y después de aplicar la migración.

Las migraciones son aditivas; una reversión de interfaz puede conservar sus tablas. Una versión antigua que intente borrar solicitudes recibirá un error de permisos. No habilitar DELETE para hacer funcionar esa versión. El historial operativo no sustituye una copia de seguridad externa de la base. Las copias automáticas y una prueba de restauración completa deben comprobarse según el plan de Supabase antes de considerar resuelta la recuperación ante una pérdida total.

El asesor de seguridad no añadió avisos con esta migración. Sigue pendiente la protección de contraseñas filtradas ya detectada en Auth: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

## Copias cifradas de los datos de gestión

Migración `20260914022137_encrypted_management_backup.sql`, aplicada el 14 de septiembre de 2026. Las huellas de los 14 servicios contratados, 14 fichas y el catálogo coincidieron antes y después. Las 48 pruebas locales pasaron y el asesor no añadió avisos de seguridad.

El botón **Respaldo** crea un archivo `.vega` protegido con una contraseña elegida por el propietario. La contraseña no se transmite al servidor ni se guarda en el navegador. Se usa AES-256-GCM con PBKDF2-SHA256, 600 000 iteraciones, sal aleatoria de 16 bytes y un IV aleatorio de 12 bytes por archivo. La autenticación de GCM detecta cambios del archivo y contraseñas incorrectas. Una contraseña olvidada no se puede recuperar.

`vega_exportar_datos` comprueba la lista privada de administradores, mantiene `SECURITY INVOKER` y respeta RLS. Rechaza visitantes, enlaces de clientes y cuentas ajenas. Obtiene las ocho tablas públicas de gestión en una misma instantánea, incluyendo registros archivados y ocultos. No depende de los filtros ni del límite de filas que carga el panel. Retorna el JSON como texto para conservar su representación exacta antes de cifrar. Si supera 20 MB, falla explícitamente; no entrega una copia parcial.

El archivo contiene contactos y códigos privados de los clientes. Solo se ofrece una descarga cifrada, después de comprobar el descifrado. La acción **Comprobar una copia guardada** descifra localmente y comprueba el formato, las relaciones y los recuentos; no sube el archivo y no modifica la base. Cerrar sesión cancela cualquier descarga pendiente y limpia los campos. El navegador no puede confirmar que el usuario haya guardado el archivo: debe conservarlo fuera del repositorio y verificarlo después de descargarlo.

Esta copia es de **datos de gestión**, no del proyecto completo: excluye Auth, políticas, funciones, esquemas privados, configuración, secretos y archivos binarios de Storage. Conserva las URLs de las imágenes. El código y las migraciones están versionados en GitHub, pero esto no sustituye un respaldo completo de la base ni de Storage. Las copias antiguas pueden contener enlaces posteriormente revocados; cualquier recuperación debe comparar las revocaciones posteriores antes de reactivar accesos.

### Recuperación comprobada y límites

La prueba local cifra una instantánea con más de 1 000 fichas sintéticas, la descifra y la inserta en tablas aisladas con el mismo esquema y relaciones. Excluye las columnas calculadas de la inserción y comprueba la igualdad de todas las filas, incluidos códigos, fechas, stock e historial. Las tablas aisladas no ejecutan los triggers de ventas, evitando nuevos descuentos o ampliaciones. Se comprueban también contraseñas erróneas, archivos alterados, copias incompletas y cierre de sesión durante la descarga.

Para una recuperación real, primero descifrar y revisar la copia en un entorno privado aislado. Comparar con el estado actual, conservar una copia previa y aprobar los cambios exactos antes de escribir en producción. Si se restauran IDs explícitos en una base nueva, ajustar después las secuencias de identidad. No desactivar RLS ni importar todas las filas por los formularios de ventas: sus triggers tienen efectos comerciales. No se ha hecho una restauración del proyecto de producción ni una copia externa automática.

Se comprobó el 14 de septiembre de 2026 que la organización utiliza el plan gratuito. Los respaldos automáticos y la protección contra contraseñas filtradas de Supabase requieren un plan superior; no se cambió la suscripción. Para una copia completa en Free, Supabase recomienda exportar mediante su CLI y mantener una copia externa; los objetos de Storage deben copiarse por separado: [documentación de respaldos](https://supabase.com/docs/guides/platform/backups).

## Canales de WhatsApp

El propietario confirmó que el número público actual de la tienda utiliza WhatsApp normal y tiene otro número en WhatsApp Business. Se conserva el soporte público y los atajos manuales actuales. La aplicación Business por sí sola no configura la API: el número Business, la cuenta de Meta, sus credenciales y una plantilla de aviso deben configurarse antes de activar un emisor automático. No hay un bot conectado ni envíos automáticos habilitados. No se han enviado mensajes a clientes desde este trabajo.
