// Customer profile and message tools. WhatsApp links prepare drafts; they never send messages.
let mensajeActual = null;
const codigoFicha = ficha => 'CL-' + ficha.id.slice(0, 8).toUpperCase();
const nombreFicha = ficha => ficha.nombre || (ficha.whatsapp_usuario ? '@' + ficha.whatsapp_usuario : ficha.telefono) || codigoFicha(ficha);
function textoBusquedaPedido(pedido) {
    const ficha = fichasGlobal.find(f => f.id === pedido.cliente_id);
    return [pedido.correo, pedido.telefono, pedido.nombre_cliente, pedido.whatsapp_usuario,
        ficha?.nombre, ficha?.telefono, ficha?.whatsapp_usuario, ficha && codigoFicha(ficha)].filter(Boolean).join(' ').toLowerCase();
}
function opcionesFichas(id, nueva = true) {
    const select = document.getElementById(id);
    select.replaceChildren(new Option(nueva ? 'Crear cliente nuevo' : 'Selecciona una ficha', ''));
    [...fichasGlobal].sort((a,b) => nombreFicha(a).localeCompare(nombreFicha(b))).forEach(f => {
        select.add(new Option([nombreFicha(f), f.telefono, f.whatsapp_usuario && '@'+f.whatsapp_usuario, codigoFicha(f)].filter(Boolean).join(' · '), f.id));
    });
}
function renderizarFichas() {
    const texto = document.getElementById('buscador-fichas').value.toLowerCase().trim();
    const cont = document.getElementById('lista-fichas'); cont.replaceChildren();
    const fichas = fichasGlobal.filter(f => [f.nombre,f.telefono,f.whatsapp_usuario,codigoFicha(f)].filter(Boolean).join(' ').toLowerCase().includes(texto));
    if (!fichas.length) { cont.textContent = 'No hay fichas que coincidan. Puedes registrar un cliente y su servicio.'; return; }
    for (const ficha of fichas) {
        const pedidos = pedidosGlobal.filter(p => p.cliente_id === ficha.id);
        const card = document.createElement('article'); card.className = 'ficha-card';
        card.innerHTML = `<h3>${h(nombreFicha(ficha))}</h3><p>${h(codigoFicha(ficha))}</p><p>${h(ficha.telefono || 'Sin teléfono')} ${h(ficha.whatsapp_usuario ? '· @'+ficha.whatsapp_usuario : '')}</p><p>${pedidos.length} servicio(s) · ${pedidos.filter(p=>p.estado==='Activo').length} activo(s)</p>`;
        const button = document.createElement('button'); button.className='btn-gestionar'; button.textContent='Ver ficha'; button.onclick=()=>abrirFicha(ficha.id); card.append(button); cont.append(card);
    }
}
async function asegurarFichaPedido(id) {
    if (!adminAuthorized) throw new Error('Inicia sesión como administrador.');
    const pedido = pedidosGlobal.find(p => Number(p.id)===Number(id));
    const known = pedido && fichasGlobal.find(f => f.id===pedido.cliente_id);
    if (known) return known;
    const {data} = await verificarOperacion(supabaseClient.rpc('vega_ficha_pedido',{p_pedido_id:Number(id)}));
    const ficha = Array.isArray(data) ? data[0] : data;
    if (!ficha?.id || !VegaSecurity.validCode(ficha.codigo_privado)) throw new Error('No se pudo abrir la ficha del cliente.');
    await cargarDatosPrincipales();
    return fichasGlobal.find(f=>f.id===ficha.id) || ficha;
}
function abrirFicha(id) {
    const ficha = fichasGlobal.find(f=>f.id===id); if(!ficha)return;
    cerrarModal('modal-gestionar-cliente'); cerrarModal('modal-registro-manual');
    document.getElementById('ficha-id').value=id;
    document.getElementById('ficha-codigo').textContent=codigoFicha(ficha);
    document.getElementById('ficha-nombre').value=ficha.nombre || '';
    document.getElementById('ficha-telefono').value=ficha.telefono || '';
    document.getElementById('ficha-usuario').value=ficha.whatsapp_usuario ? '@'+ficha.whatsapp_usuario : '';
    document.getElementById('ficha-enlace').value=VegaSecurity.privateLink(ficha.codigo_privado);
    const cont=document.getElementById('ficha-servicios');cont.replaceChildren();
    for(const p of pedidosGlobal.filter(p=>p.cliente_id===id)){
        const row=document.createElement('div');row.className='ficha-servicio';
        row.innerHTML=`<div><strong>${h(p.servicio)}</strong><small>${h(p.estado)} · ${p.meses==0?'Permanente':h(p.meses+' '+(p.unidad||'meses'))}</small><small>${h(p.correo||'')}${p.fecha_fin ? ' · Hasta '+h(p.fecha_fin) : ''}</small></div>`;
        const message=document.createElement('button');message.className='btn-gestionar';message.textContent='💬 Mensaje';message.onclick=()=>abrirMensajesCliente(p.id);row.append(message);
        if(p.estado==='Activo'){
            const manage=document.createElement('button');manage.className='btn-gestionar';manage.textContent='Gestionar';manage.onclick=()=>{cerrarModal('modal-ficha');abrirGestionCliente(p.id);};row.append(manage);
        }
        cont.append(row);
    }
    if(!cont.childElementCount)cont.textContent='Esta ficha aún no tiene servicios.';
    abrirModal('modal-ficha');
}
async function abrirFichaDelPedido() {
    const ficha=await asegurarFichaPedido(document.getElementById('gestion-id').value);abrirFicha(ficha.id);
}
function datosContacto(prefix) {
    const nombre=document.getElementById(prefix+'-nombre').value.trim();
    if(nombre.length>100)throw new Error('El nombre debe tener como máximo 100 caracteres.');
    return {nombre:nombre||null, telefono:VegaSecurity.phone(document.getElementById(prefix+'-telefono').value),
        whatsapp_usuario:VegaSecurity.username(document.getElementById(prefix+'-usuario').value)};
}
async function guardarFicha() {
    const id=document.getElementById('ficha-id').value;
    await verificarOperacion(supabaseClient.from('vega_clientes').update(datosContacto('ficha')).eq('id',id));
    await cargarDatosPrincipales();abrirFicha(id);alert('Ficha guardada. El contacto se actualizó para todos sus servicios.');
}
async function renovarEnlaceFicha() {
    const id=document.getElementById('ficha-id').value;
    if(!confirm('¿Revocar los enlaces anteriores de este cliente y crear otro? Tendrás que compartirle el enlace nuevo.'))return;
    await verificarOperacion(supabaseClient.from('vega_clientes').update({codigo_privado:VegaSecurity.newCode()}).eq('id',id));
    mensajeActual=null;document.getElementById('mensaje-texto').value='';
    for(const key of ['mensaje-whatsapp','mensaje-elegir-chat'])document.getElementById(key).removeAttribute('href');
    cerrarModal('modal-mensajes');await cargarDatosPrincipales();abrirFicha(id);
}
async function vincularServicioFicha() {
    const id=Number(document.getElementById('gestion-id').value), destino=document.getElementById('gestion-ficha-destino').value;
    if(!destino)throw new Error('Selecciona la ficha del cliente.');
    const ficha=fichasGlobal.find(f=>f.id===destino);
    if(!ficha||!confirm('¿Vincular este servicio a '+nombreFicha(ficha)+'? Comprueba que pertenece a ese cliente.'))return;
    await verificarOperacion(supabaseClient.from('usuarios_canva').update({cliente_id:destino}).eq('id',id));
    await cargarDatosPrincipales();abrirFicha(destino);
}
function registroManual(clienteId='') {
    cerrarModal('modal-ficha');cerrarModal('modal-mensajes');
    opcionesFichas('manual-ficha');document.getElementById('manual-ficha').value=clienteId;
    for(const field of ['nombre','telefono','usuario','correo','servicio'])document.getElementById('manual-'+field).value='';
    document.getElementById('manual-cantidad').value='1';document.getElementById('manual-unidad').value='meses';
    const lista=document.getElementById('manual-producto');lista.replaceChildren(new Option('Selecciona un producto',''),new Option('Servicio fuera del catálogo','libre'));
    for(const s of catalogoOpciones.filter(s=>s.activo!==false)) {
        const option=new Option(`${s.nombre} (#${s.id}) · ${VegaCatalog.stockTexto(s)}`,String(s.id));
        option.disabled=!VegaCatalog.disponible(s);lista.append(option);
    }
    cambiarProductoManual();
    cambiarClienteManual();abrirModal('modal-registro-manual');
}
function cambiarClienteManual() {
    document.getElementById('manual-nuevo-cliente').hidden=!!document.getElementById('manual-ficha').value;
}
async function guardarRegistroManual() {
    const btn=document.getElementById('manual-guardar');if(btn.disabled)return;
    const clienteId=document.getElementById('manual-ficha').value;
    const contacto=clienteId ? {nombre:null,telefono:null,whatsapp_usuario:null} : datosContacto('manual');
    if(!clienteId&&!Object.values(contacto).some(Boolean))throw new Error('Indica el nombre, teléfono o usuario del cliente.');
    const productValue=document.getElementById('manual-producto').value;
    if(!productValue) throw new Error('Selecciona un producto o la opción fuera del catálogo.');
    const product=catalogoOpciones.find(s=>String(s.id)===productValue);
    if(product&&!VegaCatalog.disponible(product))throw new Error('Este producto está agotado.');
    const cantidad=Number(document.getElementById('manual-cantidad').value),servicio=product?.nombre || document.getElementById('manual-servicio').value.trim();
    if(!servicio||!document.getElementById('manual-cantidad').value.trim()||!Number.isInteger(cantidad)||cantidad<0||cantidad>36500)throw new Error('Revisa el servicio y la duración.');
    if(!product && catalogoOpciones.some(s=>s.nombre===servicio))throw new Error('Este servicio pertenece al catálogo. Selecciona su producto para controlar el stock.');
    const correo=document.getElementById('manual-correo');if(correo.value&&!correo.checkValidity())throw new Error('Revisa el correo.');
    btn.disabled=true;btn.textContent='Guardando...';
    try {
        const {data:id}=await verificarOperacion(supabaseClient.rpc('vega_registro_manual',{
            p_cliente_id:clienteId||null,p_nombre:contacto.nombre,p_telefono:contacto.telefono,p_usuario:contacto.whatsapp_usuario,
            p_servicio_id:product?.id||null,p_correo:correo.value.trim()||null,p_servicio:servicio,p_cantidad:cantidad,p_unidad:document.getElementById('manual-unidad').value
        }));
        await cargarDatosPrincipales();cerrarModal('modal-registro-manual');await abrirMensajesCliente(Number(id),'activacion');
    } finally {btn.disabled=false;btn.textContent='Guardar servicio activo';}
}
async function abrirMensajesCliente(id,atajo='enlace') {
    const ficha=await asegurarFichaPedido(id);
    const pedido=pedidosGlobal.find(p=>Number(p.id)===Number(id));if(!pedido)throw new Error('Recarga el panel para ver este servicio.');
    mensajeActual={ficha,pedido};cerrarModal('modal-ficha');cerrarModal('modal-gestionar-cliente');
    document.getElementById('mensaje-cliente').textContent=nombreFicha(ficha)+' · '+pedido.servicio;
    document.getElementById('mensaje-atajo').value=atajo;
    document.getElementById('mensaje-copiado').textContent='';prepararMensajeCliente();abrirModal('modal-mensajes');
}
function prepararMensajeCliente() {
    if(!mensajeActual)return;
    const {ficha,pedido:p}=mensajeActual, tipo=document.getElementById('mensaje-atajo').value;
    const saludo=ficha.nombre ? 'Hola '+ficha.nombre+' 👋' : 'Hola 👋';
    const fecha=p.fecha_fin ? new Date(p.fecha_fin+'T12:00:00').toLocaleDateString('es-PE') : null;
    let cuerpo='Aquí tienes tu enlace privado para consultar tus servicios de VegaStore.';
    if(tipo==='activacion')cuerpo=p.estado==='Activo' ? `Tu servicio de *${p.servicio}* está activo. ${fecha ? 'Vigente hasta el '+fecha+'.' : 'Tienes acceso permanente.'}` : `Tu solicitud de *${p.servicio}* está ${p.estado.toLowerCase()}. Te avisaremos cuando esté activa.`;
    if(tipo==='vencimiento')cuerpo=fecha ? `Te recordamos que tu servicio de *${p.servicio}* ${p.fecha_fin < new Date().toISOString().slice(0,10) ? 'venció' : 'vence'} el *${fecha}*. Escríbenos si deseas renovarlo.` : `Tu servicio de *${p.servicio}* no tiene una fecha de vencimiento registrada. Puedes consultar su estado en tu enlace privado.`;
    if(tipo==='renovacion')cuerpo=`¿Deseas renovar tu servicio de *${p.servicio}*? Escríbenos para coordinar el plan y el pago.${fecha ? ' La fecha de vencimiento registrada es '+fecha+'.' : ''}`;
    document.getElementById('mensaje-texto').value=saludo+'\n\n'+cuerpo+'\n\n🔗 Mis servicios: '+VegaSecurity.privateLink(ficha.codigo_privado)+'\n\nGuarda este enlace en privado. — VegaStore';
    actualizarDestinosMensaje();
}
function actualizarDestinosMensaje() {
    if(!mensajeActual)return;
    const text=encodeURIComponent(document.getElementById('mensaje-texto').value);
    const ficha=mensajeActual.ficha, phone=ficha.telefono ? ficha.telefono.replace(/\D/g,'') : '';
    const share='https://wa.me/?text='+text, target=document.getElementById('mensaje-whatsapp');
    target.href=phone ? 'https://wa.me/'+phone+'?text='+text : share;
    target.textContent=phone ? 'Abrir chat en WhatsApp' : 'Elegir chat en WhatsApp';
    document.getElementById('mensaje-elegir-chat').href=share;
    document.getElementById('mensaje-elegir-chat').hidden=!phone;
    document.getElementById('mensaje-destino').textContent=phone ? 'Chat de '+ficha.telefono+'. Comprueba el destinatario antes de enviar.' : 'Elige el chat de '+nombreFicha(ficha)+(ficha.whatsapp_usuario ? ' (@'+ficha.whatsapp_usuario+')' : '')+' en WhatsApp. También puedes copiar el mensaje y pegarlo en su conversación.';
}
async function copiarMensajeCliente() {
    await navigator.clipboard.writeText(document.getElementById('mensaje-texto').value);
    document.getElementById('mensaje-copiado').textContent='Mensaje copiado. Pégalo en el chat del cliente.';
}

function cambiarProductoManual() {
    document.getElementById('manual-servicio-libre').hidden = document.getElementById('manual-producto').value !== 'libre';
}
