/* Service management: all entitlement writes are validated atomically in Postgres. */
let ampliacionActual=null;
let avisosGlobal=[];
let seguimientoFiltro='manana';
function abrirAmpliacion(motivo='renovacion') {
    const pedido=pedidosGlobal.find(p=>String(p.id)===document.getElementById('gestion-id').value);
    if(!pedido)return;
    ampliacionActual={pedido:{...pedido},operacion:crypto.randomUUID()};
    document.getElementById('ampliacion-servicio').textContent=pedido.servicio;
    document.getElementById('ampliacion-cantidad').value='1';
    document.getElementById('ampliacion-unidad').value=motivo==='regalo'?'dias':'meses';
    document.getElementById('ampliacion-motivo').value=motivo;
    document.getElementById('ampliacion-modo').value=pedido.fecha_fin?'sumar':'desde_hoy';
    actualizarVistaAmpliacion();abrirModal('modal-ampliacion');
}
function datosAmpliacion(){
    const cantidad=Number(document.getElementById('ampliacion-cantidad').value),unidad=document.getElementById('ampliacion-unidad').value;
    if(!Number.isInteger(cantidad)||cantidad<1||cantidad>({dias:36500,meses:1200,años:100}[unidad]||0))throw new Error('Indica una duración válida, de hasta 100 años.');
    return {cantidad,unidad,modo:document.getElementById('ampliacion-modo').value,motivo:document.getElementById('ampliacion-motivo').value};
}
function actualizarVistaAmpliacion(){
    if(!ampliacionActual)return;
    const p=ampliacionActual.pedido,box=document.getElementById('ampliacion-preview');
    try{
        const d=datosAmpliacion(),hoy=VegaDates.today();
        const base=d.modo==='desde_hoy'?hoy:d.modo==='reemplazar'?(p.vigencia_inicio||p.fecha_inicio):(p.fecha_fin&&p.fecha_fin>hoy?p.fecha_fin:hoy);
        if(!base)throw new Error('Sin inicio registrado: selecciona comenzar hoy.');
        const fin=VegaDates.add(base,d.cantidad,d.unidad);
        box.textContent=`Vencimiento actual: ${VegaDates.permanent(p)?'Permanente':VegaDates.format(p.fecha_fin)}. Nuevo vencimiento: ${VegaDates.format(fin)}. ${d.modo==='reemplazar'?'El plazo reemplaza la duración desde el inicio del período.':d.modo==='desde_hoy'||p.fecha_fin<hoy?'El período comienza hoy.':'La duración se suma al vencimiento actual.'}`;
        document.getElementById('ampliacion-guardar').disabled=false;
    }catch(e){box.textContent=e.message;document.getElementById('ampliacion-guardar').disabled=true;}
}
async function guardarAmpliacion(){
    const button=document.getElementById('ampliacion-guardar');if(button.disabled||!ampliacionActual)return;
    const {pedido:p,operacion}=ampliacionActual,d=datosAmpliacion();
    if(!await VegaUI.confirm(document.getElementById('ampliacion-preview').textContent,{title:'Actualizar vigencia',accept:'Guardar ampliación'}))return;
    button.disabled=true;document.getElementById('modal-ampliacion').dataset.busy='true';
    try{
        await verificarOperacion(supabaseClient.rpc('vega_actualizar_vigencia',{p_id:Number(p.id),p_cantidad:d.cantidad,p_unidad:d.unidad,p_modo:d.modo,p_motivo:d.motivo,p_version:p.version,p_operacion:operacion}));
        cerrarModal('modal-ampliacion');cerrarModal('modal-gestionar-cliente');ampliacionActual=null;
        await cargarDatosPrincipales();VegaUI.toast('Vigencia actualizada. El cambio ya aparece en sus servicios.');
        await abrirMensajesCliente(p.id,'ampliacion');
    }finally{button.disabled=false;delete document.getElementById('modal-ampliacion').dataset.busy;}
}
function verSeguimiento(filtro='manana'){
    seguimientoFiltro=filtro;switchTab('seguimiento');renderizarSeguimiento();
}
function renderizarSeguimiento(){
    const tomorrow=VegaDates.add(VegaDates.today(),1,'dias');
    const vencen=clientesGlobal.filter(p=>p.fecha_fin===tomorrow);
    document.getElementById('stat-manana').textContent=vencen.length;
    document.getElementById('stat-agotados').textContent=catalogoOpciones.filter(s=>s.activo!==false&&!VegaCatalog.disponible(s)).length;
    document.getElementById('seguimiento-filtro').value=seguimientoFiltro;
    const list=document.getElementById('lista-seguimiento');list.replaceChildren();
    const orders=clientesGlobal.filter(p=>p.fecha_fin&&(seguimientoFiltro==='vencidos'?p.fecha_fin<VegaDates.today():seguimientoFiltro==='semana'?p.fecha_fin>=VegaDates.today()&&p.fecha_fin<=VegaDates.add(VegaDates.today(),7,'dias'):p.fecha_fin===tomorrow));
    for(const p of orders){const ficha=fichasGlobal.find(f=>f.id===p.cliente_id),row=document.createElement('article');row.className='follow-up-row';
        const done=avisosGlobal.some(a=>Number(a.pedido_id)===Number(p.id)&&a.fecha_fin===p.fecha_fin);
        row.innerHTML=`<div><strong>${h(ficha?nombreFicha(ficha):p.nombre_cliente||p.telefono||'Cliente')}</strong><small>${h(p.servicio)} · ${h(VegaDates.format(p.fecha_fin))}</small><small>${done?'Atendido manualmente':'Pendiente de contactar'}</small></div>`;
        const msg=document.createElement('button');msg.className='btn-gestionar';msg.textContent='Preparar mensaje';msg.onclick=()=>abrirMensajesCliente(p.id,'vencimiento');
        const mark=document.createElement('button');mark.className='btn-gestionar';mark.textContent=done?'Volver a pendiente':'Marcar atendido';mark.onclick=async()=>{mark.disabled=true;try{if(done)await verificarOperacion(supabaseClient.from('vega_avisos_manuales').delete().eq('pedido_id',p.id).eq('fecha_fin',p.fecha_fin).eq('tipo','vencimiento'));else await verificarOperacion(supabaseClient.from('vega_avisos_manuales').insert({pedido_id:p.id,fecha_fin:p.fecha_fin,tipo:'vencimiento'}));await cargarDatosPrincipales();}finally{mark.disabled=false;}};
        row.append(msg,mark);list.append(row);
    }if(!orders.length)list.innerHTML='<p class="empty-state">Todo al día. No hay servicios en este período.</p>';
}
async function archivarPedido(id,restaurar=false){
    let p=pedidosGlobal.find(x=>Number(x.id)===Number(id));if(!p){await cargarDatosPrincipales();p=pedidosGlobal.find(x=>Number(x.id)===Number(id));}if(!p)return;
    if(!await VegaUI.confirm(restaurar?'El servicio volverá a su estado anterior. Se conservará su vencimiento.':'Se conservarán el servicio y su historial. Podrás recuperarlo desde Archivados.',{title:restaurar?'Restaurar servicio':'Archivar servicio',accept:restaurar?'Restaurar':'Archivar',danger:!restaurar}))return;
    await verificarOperacion(supabaseClient.rpc('vega_archivar_servicio',{p_id:Number(id),p_version:p.version,p_restaurar:restaurar}));
    cerrarModal('modal-gestionar-cliente');await cargarDatosPrincipales();if(restaurar)await cargarPapelera();VegaUI.toast(restaurar?'Servicio restaurado.':'Servicio archivado. Puedes recuperarlo desde Archivados.');
}
function abrirCambioServicio(){
    const select=document.getElementById('cambio-servicio');select.replaceChildren(new Option('Selecciona un producto',''));
    for(const s of catalogoOpciones.filter(s=>s.activo!==false)){const option=new Option(`${s.nombre} · ${VegaCatalog.stockTexto(s)}`,s.id);option.disabled=!VegaCatalog.disponible(s);select.append(option);}
    abrirModal('modal-cambio-servicio');
}
async function guardarCambioServicio(){
    const p=pedidosGlobal.find(x=>String(x.id)===document.getElementById('gestion-id').value),s=catalogoOpciones.find(x=>String(x.id)===document.getElementById('cambio-servicio').value);if(!p||!s)throw new Error('Selecciona el nuevo producto.');
    if(!await VegaUI.confirm(`Cambiar a ${s.nombre}. Se conserva el vencimiento ${VegaDates.format(p.fecha_fin)} y se descontará un cupo del nuevo producto cuando corresponda.`,{accept:'Cambiar producto'}))return;
    const {data}=await verificarOperacion(supabaseClient.from('usuarios_canva').update({servicio:s.nombre,servicio_id:s.id}).eq('id',p.id).eq('version',p.version).select('id'));
    if(!data?.length)throw new Error('El servicio cambió. Recarga antes de continuar.');
    cerrarModal('modal-cambio-servicio');cerrarModal('modal-gestionar-cliente');await cargarDatosPrincipales();VegaUI.toast('Producto actualizado.');
}
