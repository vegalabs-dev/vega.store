/* Paged management views with owner-only on-demand details. */
(() => {
'use strict';
const el=id=>document.getElementById(id),views=['fichas','ventas','solicitudes','papelera','seguimiento'];
const pages=Object.fromEntries(views.map(v=>[v,0]));
const original={profiles:window.renderizarFichas,orders:window.filtrarClientes,requests:window.renderizarSolicitudes,
 followup:window.renderizarSeguimiento,profile:window.abrirFicha,manage:window.abrirGestionCliente,
 ensure:window.asegurarFichaPedido,choices:window.opcionesFichas};
const profiles=new Map(),orders=new Map();let epoch=0,run=0,rendering=false,timer;
const current=()=>document.querySelector('.admin-workspace>.tab-content.active')?.id.replace('tab-','')||'inicio';
function merge(data){
 for(const f of data.profiles||[])profiles.set(f.id,{...profiles.get(f.id),...f});
 for(const p of data.orders||[])orders.set(Number(p.id),p);
 sync();
}
function sync(){
 fichasGlobal=[...profiles.values()];pedidosGlobal=[...orders.values()];
 clientesGlobal=pedidosGlobal.filter(p=>p.estado==='Activo');solicitudesGlobal=pedidosGlobal.filter(p=>p.estado==='Pendiente');
}
for(const view of views){
 const pager=document.createElement('nav');pager.className='catalogue-pager';pager.setAttribute('aria-label','Páginas de '+view);
 const prev=document.createElement('button'),next=document.createElement('button'),info=document.createElement('span');
 prev.className=next.className='btn-gestionar';prev.textContent='Anterior';next.textContent='Siguiente';
 info.id='page-info-'+view;info.setAttribute('aria-live','polite');
 prev.id='page-prev-'+view;next.id='page-next-'+view;
 prev.onclick=()=>{pages[view]=Math.max(0,pages[view]-1);load(view).catch(mostrarErrorAdmin);};
 next.onclick=()=>{pages[view]++;load(view).catch(mostrarErrorAdmin);};
 pager.append(prev,info,next);el('tab-'+view).append(pager);
}
function parameters(view){
 return {p_vista:views.includes(view)?view:'inicio',
 p_busqueda:(view==='fichas'?el('buscador-fichas').value:view==='ventas'?el('buscador-clientes').value:'').trim().slice(0,120),
 p_servicio:view==='ventas'?el('filtro-servicio').value:'ALL',
 p_orden:view==='ventas'?el('filtro-orden').value:view==='seguimiento'?'VENCIMIENTO':'RECIENTES',
 p_pagina:pages[view]||0,p_tamano:12,p_seguimiento:seguimientoFiltro};
}
function archived(items){
 const table=el('tabla-papelera');table.replaceChildren();
 if(!items.length){table.innerHTML='<tr><td colspan="5" class="empty-state">No hay servicios archivados.</td></tr>';return;}
 for(const p of items){
 const f=profiles.get(p.cliente_id),tr=document.createElement('tr');
 tr.innerHTML='<td>'+h(f?nombreFicha(f):p.nombre_cliente||p.telefono||'Cliente')+'<br><small>'+h(p.correo||'')+'</small></td><td>'+h(p.servicio)+'</td><td>Archivado</td><td>'+h(p.fecha_cancelacion?new Date(p.fecha_cancelacion).toLocaleString('es-PE'):'Sin fecha')+'</td><td></td>';
 const b=document.createElement('button');b.className='btn-gestionar';b.textContent='Restaurar';b.onclick=()=>restaurarDePapelera(p.id);tr.lastElementChild.append(b);table.append(tr);
 }
}
function render(view,data){
 // Use only this page while rendering; action handlers later use the visited-record cache.
 rendering=true;fichasGlobal=data.profiles||[];pedidosGlobal=data.orders||[];
 clientesGlobal=pedidosGlobal.filter(p=>p.estado==='Activo');solicitudesGlobal=pedidosGlobal.filter(p=>p.estado==='Pendiente');
 avisosGlobal=data.notices||[];catalogoOpciones=data.catalog||[];
 const select=el('filtro-servicio'),selected=select.value;
 select.replaceChildren(new Option('Todos los servicios','ALL'));
 for(const p of catalogoOpciones)select.add(new Option(p.nombre,p.nombre));
 if([...select.options].some(o=>o.value===selected))select.value=selected;
 try{
 if(view==='fichas')original.profiles();
 if(view==='ventas')original.orders();
 if(view==='solicitudes')original.requests();
 if(view==='seguimiento')original.followup();
 if(view==='papelera')archived(data.orders||[]);
 }finally{sync();rendering=false;}
 const stats=data.stats||{};
 for(const [id,key] of [['stat-activos','activos'],['stat-pendientes','pendientes'],['stat-manana','manana'],['stat-agotados','agotados']])el(id).textContent=String(stats[key]||0);
 if(views.includes(view)){
 const count=Number(data.total)||0;
 el('page-info-'+view).textContent='Página '+(pages[view]+1)+' de '+Math.max(1,Math.ceil(count/12))+' · '+count+' registros';
 el('page-prev-'+view).disabled=pages[view]===0;el('page-next-'+view).disabled=(pages[view]+1)*12>=count;
 }
}
async function load(view=current()){
 if(!adminAuthorized)return;
 const token=++run,session=epoch;el('admin-carga').hidden=false;
 try{
 const {data}=await verificarOperacion(VegaUI.read(supabaseClient.rpc('vega_panel_pagina',parameters(view))));
 if(session!==epoch||token!==run||!adminAuthorized)return;
 if(data?.version!==2)throw new Error('La actualización del panel está pendiente de activación.');
 if(pages[view]>0&&pages[view]*12>=Number(data.total)){pages[view]=Math.max(0,Math.ceil(Number(data.total)/12)-1);return await load(view);}
 merge(data);render(view,data);el('admin-error').hidden=true;
 }catch(e){if(token===run)el('admin-error').hidden=false;throw e;}
 finally{if(token===run)el('admin-carga').hidden=true;}
}
function search(view){clearTimeout(timer);pages[view]=0;timer=setTimeout(()=>load(view).catch(mostrarErrorAdmin),250);}
window.cargarDatosPrincipales=()=>load();
window.cargarPapelera=()=>load('papelera');
window.renderizarFichas=()=>rendering?original.profiles():search('fichas');
window.filtrarClientes=()=>rendering?original.orders():search('ventas');
window.renderizarSeguimiento=()=>rendering?original.followup():search('seguimiento');
const switchPage=window.switchTab;
window.switchTab=function(view){switchPage(view);if(view==='inicio')load(view).catch(mostrarErrorAdmin);};
window.abrirServiciosPorVencer=function(){
 clearTimeout(timer);pages.ventas=0;
 el('buscador-clientes').value='';el('filtro-servicio').value='ALL';
 el('filtro-orden').value='VENCIMIENTO';
 window.switchTab('ventas');
};
async function detail(clientId=null,orderId=null){
 if(!adminAuthorized)throw new Error('Inicia sesión como administrador.');
 const session=epoch;
 const {data}=await verificarOperacion(VegaUI.read(supabaseClient.rpc('vega_panel_detalle',{p_cliente_id:clientId,p_pedido_id:orderId==null?null:Number(orderId)})));
 if(session!==epoch||!adminAuthorized)return false;
 const ids=new Set((data.profiles||[]).map(p=>p.id));
 for(const [id,p] of orders)if(ids.has(p.cliente_id))orders.delete(id);
 merge(data);return true;
}
window.abrirFicha=async function(id){if(await detail(id,null))original.profile(id);};
window.abrirGestionCliente=async function(id){if(await detail(null,id))original.manage(Number(id));};
window.asegurarFichaPedido=async function(id){if(!await detail(null,id))throw new Error('La sesión terminó.');return original.ensure(id);};
window.opcionesFichas=function(id,nueva=true){
 original.choices(id,nueva);
 let searchInput=el('buscar-'+id);
 if(!searchInput){
 const label=document.createElement('label');label.className='editor-help';label.textContent='Buscar una ficha existente';
 searchInput=document.createElement('input');searchInput.id='buscar-'+id;searchInput.type='search';searchInput.maxLength=120;searchInput.placeholder='Nombre, teléfono o usuario';label.append(searchInput);el(id).before(label);
 let job,sequence=0;
 searchInput.addEventListener('input',()=>{
 clearTimeout(job);const n=++sequence,session=epoch;
 job=setTimeout(async()=>{
 try{
 if(!adminAuthorized)return;
 const {data}=await verificarOperacion(VegaUI.read(supabaseClient.rpc('vega_panel_buscar_fichas',{p_busqueda:searchInput.value.trim()})));
 if(n!==sequence||session!==epoch||!adminAuthorized)return;
 const select=el(id),selected=select.value;
 merge({profiles:data||[]});
 const candidates=[...(data||[])];
 if(selected&&profiles.has(selected)&&!candidates.some(p=>p.id===selected))candidates.unshift(profiles.get(selected));
 select.replaceChildren(new Option(nueva?'Crear cliente nuevo':'Selecciona una ficha',''));
 for(const p of candidates)select.add(new Option([nombreFicha(p),p.telefono,p.whatsapp_usuario&&'@'+p.whatsapp_usuario,codigoFicha(p)].filter(Boolean).join(' · '),p.id));
 select.value=selected;
 }catch(e){mostrarErrorAdmin(e);}
 },250);
 });
 }
 searchInput.value='';
};
window.addEventListener('vega:logout',()=>{
 epoch++;run++;clearTimeout(timer);profiles.clear();orders.clear();sync();avisosGlobal=[];catalogoOpciones=[];
 for(const view of views)pages[view]=0;
 for(const id of ['tabla-clientes','tabla-solicitudes','tabla-papelera','lista-fichas','lista-seguimiento','ficha-servicios'])el(id).replaceChildren();
});
})();
