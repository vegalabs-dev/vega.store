/* Drafts are owner-only Supabase records. Publishing is an atomic, versioned RPC. */
(() => {
'use strict';
const el=id=>document.getElementById(id),modal=el('modal-servicio');
if(!modal)return;
let query='',filter='todos',page=0,request=0,ready=false,epoch=0,timer;
let editing=null,stockTouched=false;
const originals={create:window.abrirModalServicio,edit:window.editarServicio,upload:window.subirImagen};
const content=modal.querySelector('.modal-content');
content.classList.add('product-editor');
el('titulo-modal-servicio').textContent='Nuevo producto';
const nav=document.createElement('div');nav.className='editor-nav';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Editor de producto');
const workspace=document.createElement('div');workspace.className='editor-workspace';
const form=document.createElement('div');form.className='editor-form';
const groups=['Presentación','Planes y precios','Disponibilidad','Publicación'].map((name,index)=>{
 const field=document.createElement('section');field.className='editor-group';field.id='editor-group-'+index;field.hidden=index!==0;field.setAttribute('role','tabpanel');field.setAttribute('aria-labelledby','editor-tab-'+index);
 const b=document.createElement('button');b.type='button';b.id='editor-tab-'+index;b.textContent=name;b.setAttribute('role','tab');b.setAttribute('aria-controls',field.id);b.setAttribute('aria-selected',String(index===0));b.onclick=()=>showStep(index);nav.append(b);form.append(field);return field;
});
const fieldGroup=id=>el(id).closest('.input-group,.stock-settings')||el(id);
groups[0].append(fieldGroup('serv-nombre'),fieldGroup('serv-categoria'),fieldGroup('serv-imagen-file'),fieldGroup('serv-etiqueta'),fieldGroup('serv-caracteristicas'));
groups[1].append(fieldGroup('serv-promo-programada'));
const plans=el('contenedor-planes'),addPlan=plans.nextElementSibling;
const planInfo=document.createElement('p');planInfo.className='editor-help';planInfo.textContent='Añade tus planes en días, meses o años. Usa 0 para pago único o permanente.';
groups[1].append(planInfo,plans,addPlan);
groups[2].append(fieldGroup('serv-stock-modo'),fieldGroup('serv-geo-tipo'));
const visibility=el('serv-activo').closest('label');groups[3].append(visibility);
groups[3].insertAdjacentHTML('beforeend','<label class="check-label"><input type="checkbox" id="serv-destacado"> Destacar en la tienda</label><div class="input-group"><label for="serv-posicion">Posición dentro de su grupo</label><input type="number" id="serv-posicion" min="0" max="1000000" step="1" value="1000000"><p class="editor-help">Un número menor aparece antes. Los agotados siempre bajan al final; los ocultos no aparecen.</p></div><button type="button" class="btn-gestionar" id="editor-duplicar">Duplicar como borrador</button>');
el('serv-caracteristicas').previousElementSibling.textContent='Beneficios · uno por línea';
el('serv-caracteristicas').placeholder='Un beneficio por línea';
el('upload-text').textContent='Seleccionar imagen · hasta 5 MB';
el('serv-tipo-ingreso').options[0].textContent='Contacto (teléfono o usuario)';
const preview=document.createElement('aside');preview.className='editor-preview';preview.innerHTML='<p class="panel-eyebrow">Vista previa de la tarjeta</p><div id="editor-tarjeta"></div><p class="editor-help">Guardar borrador conserva la versión publicada.</p>';
workspace.append(form,preview);
const footer=document.createElement('div');footer.className='editor-footer';
const draftButton=document.createElement('button');draftButton.type='button';draftButton.id='editor-guardar-borrador';draftButton.className='btn-gestionar';draftButton.textContent='Guardar borrador';draftButton.onclick=()=>saveDraft().catch(mostrarErrorAdmin);
const save=el('btn-guardar-servicio');save.textContent='Revisar y publicar';save.removeAttribute('style');
const message=document.createElement('p');message.id='editor-estado';message.className='editor-help';message.setAttribute('role','status');
footer.append(draftButton,save);
content.querySelectorAll(':scope > hr,:scope > h3,:scope > p').forEach(n=>n.remove());
content.append(nav,workspace,message,footer);
const imageMarker=document.createElement('input');imageMarker.id='editor-imagen-estado';imageMarker.type='text';imageMarker.hidden=true;content.append(imageMarker);
const heading=el('tab-catalogo').querySelector('.filtros-admin');heading.className='panel-page-heading';heading.removeAttribute('style');heading.querySelector('h2').textContent='Catálogo de productos';heading.querySelector('button').textContent='+ Nuevo producto';
const filters=document.createElement('div');filters.className='catalogue-toolbar';filters.innerHTML='<label>Buscar producto<input type="search" id="catalogue-search" maxlength="120" placeholder="Nombre o categoría"></label><label>Mostrar<select id="catalogue-filter"><option value="todos">Todos</option><option value="disponibles">Disponibles</option><option value="agotados">Agotados</option><option value="ocultos">Ocultos</option><option value="borradores">Borradores</option></select></label><span id="catalogue-count" role="status"></span>';
heading.after(filters);
const pager=document.createElement('nav');pager.className='catalogue-pager';pager.setAttribute('aria-label','Páginas del catálogo');pager.innerHTML='<button class="btn-gestionar" id="catalogue-prev">Anterior</button><span id="catalogue-page" aria-live="polite"></span><button class="btn-gestionar" id="catalogue-next">Siguiente</button>';
el('tab-catalogo').append(pager);
const error=document.createElement('div');error.id='catalogue-error';error.className='load-error';error.hidden=true;filters.after(error);
el('catalogue-search').oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{query=el('catalogue-search').value.trim();page=0;load().catch(mostrarErrorAdmin);},250);};
el('catalogue-filter').onchange=()=>{filter=el('catalogue-filter').value;page=0;load().catch(mostrarErrorAdmin);};
el('catalogue-prev').onclick=()=>{page=Math.max(0,page-1);load().catch(mostrarErrorAdmin);};
el('catalogue-next').onclick=()=>{page++;load().catch(mostrarErrorAdmin);};
function showStep(index){groups.forEach((g,i)=>g.hidden=i!==index);nav.querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-selected',String(i===index)));}
function previewCard(){
 const name=el('serv-nombre').value||'Nombre del producto',img=VegaSecurity.imageUrl(el('serv-imagen-url').value);
 const first=plans.querySelector('.plan-row'),price=Number(first?.querySelector('.plan-precio').value||0);
 const unavailable=el('serv-agotado').checked||(el('serv-stock-modo').value==='limitado'&&Number(el('serv-stock').value)===0);
 const card=el('editor-tarjeta');card.replaceChildren();
 const media=document.createElement('div');media.className='editor-card-image';
 if(img){const image=document.createElement('img');image.src=img;image.alt='';media.append(image);}else media.textContent='V';
 if(unavailable){const seal=document.createElement('span');seal.className='sold-out-seal';seal.textContent='Agotado';media.append(seal);}
 const title=document.createElement('h3');title.textContent=name;
 const category=document.createElement('p');category.className='editor-help';category.textContent=el('serv-categoria').value||'Categoría';
 const amount=document.createElement('strong');amount.textContent=Number.isFinite(price)?'Desde S/ '+price.toFixed(2):'Completa el precio';
 card.append(media,category,title,amount);
}
function rawData(){
 const rows=[...plans.querySelectorAll('.plan-row')].map(row=>({cantidad:row.querySelector('.plan-cantidad').value,unidad:row.querySelector('.plan-unidad').value,precio:row.querySelector('.plan-precio').value,promo:row.querySelector('.plan-promo').value||null}));
 const scheduled=el('serv-promo-programada').checked;
 return {nombre:el('serv-nombre').value.trim(),categoria:el('serv-categoria').value.trim(),tipo_ingreso:el('serv-tipo-ingreso').value,geo_tipo:el('serv-geo-tipo').value,geo_paises:el('serv-geo-paises').value.trim().toUpperCase(),
 etiqueta:el('serv-etiqueta').value.trim(),caracteristicas:el('serv-caracteristicas').value.trim(),imagen_url:VegaSecurity.imageUrl(el('serv-imagen-url').value)||null,
 stock_modo:el('serv-stock-modo').value,stock:el('serv-stock').value,agotado:el('serv-agotado').checked,stock_modificado:stockTouched,activo:el('serv-activo').checked,
 destacado:el('serv-destacado').checked,posicion:el('serv-posicion').value,planes:rows,promo_programada:scheduled,
 promocion_inicio:scheduled?VegaCatalog.desdePeru(el('serv-promo-inicio').value):null,promocion_fin:scheduled?VegaCatalog.desdePeru(el('serv-promo-fin').value):null};
}
function fresh(product=null){
 editing={id:crypto.randomUUID(),producto_id:product?.id??null,version:0,producto_version:product?.catalogo_version??null,stock_version:product?.stock_version??null};
 stockTouched=!product;el('serv-destacado').checked=!!product?.destacado;el('serv-posicion').value=product?.posicion??1000000;
 el('titulo-modal-servicio').textContent=product?'Editar producto':'Nuevo producto';
 el('editor-estado').textContent='Los cambios se guardan primero como borrador.';imageMarker.value=product?.imagen_url||'';
 showStep(0);previewCard();VegaUI.clean(modal);
}
window.abrirModalServicio=function(){originals.create();fresh();};
window.editarServicio=function(product){originals.edit(product);fresh(product);};
window.editarServicioPorId=function(id){const p=serviciosAdminGlobal.find(x=>Number(x.id)===Number(id));if(p)window.editarServicio(p);};
el('editor-duplicar').onclick=()=>{if(!editing)return;editing={id:crypto.randomUUID(),producto_id:null,version:0,producto_version:null,stock_version:null};stockTouched=true;el('serv-id').value='';el('serv-nombre').value+=' · copia';el('serv-activo').checked=false;el('titulo-modal-servicio').textContent='Duplicar producto';el('editor-estado').textContent='Copia sin publicar. Guarda el borrador para continuar después.';previewCard();};
function busy(on){
 if(on){modal.dataset.busy='true';modal.querySelectorAll('button,input,select,textarea').forEach(n=>{n.dataset.editorDisabled=String(n.disabled);n.disabled=true;});}
 else {delete modal.dataset.busy;modal.querySelectorAll('[data-editor-disabled]').forEach(n=>{n.disabled=n.dataset.editorDisabled==='true';delete n.dataset.editorDisabled;});}
}
async function persist(){
 if(!adminAuthorized||!editing)throw new Error('Inicia sesión y abre un producto.');
 const payload=rawData(),run=epoch;
 const {data}=await verificarOperacion(supabaseClient.rpc('vega_catalogo_borrador',{p_id:editing.id,p_producto_id:editing.producto_id,p_datos:payload,p_esperada:editing.version,p_base:editing.producto_version,p_stock_base:editing.stock_version}));
 if(run!==epoch||!adminAuthorized)return null;
 if(!data?.id)throw new Error('No se confirmó el borrador. Reintenta sin cerrar esta ventana.');
 editing=data;VegaUI.clean(modal);return data;
}
async function saveDraft(){
 if(modal.dataset.busy==='true')return;
 busy(true);
 try{const data=await persist();if(data){el('editor-estado').textContent='Borrador guardado. La versión publicada no cambió.';VegaUI.toast('Borrador guardado.');}}
 finally{busy(false);}
}
window.guardarServicio=async function(){
 if(modal.dataset.busy==='true')return;
 if(!await VegaUI.confirm('Publicar actualizará este producto en la tienda. Las ventas anteriores conservarán sus condiciones.',{title:'Publicar producto',accept:'Publicar cambios'}))return;
 busy(true);
 const run=epoch;
 try{const draft=await persist();if(!draft)return;
 await verificarOperacion(supabaseClient.rpc('vega_catalogo_publicar',{p_id:draft.id,p_version:draft.version}));
 if(run!==epoch||!adminAuthorized)return;
 delete modal.dataset.busy;VegaUI.clean(modal);cerrarModal('modal-servicio');editing=null;VegaUI.toast('Producto publicado.');await load();
 }catch(e){if(run===epoch)el('editor-estado').textContent='No se publicó. Tu borrador se conserva. '+(e.message||'Reintenta.');throw e;}
 finally{busy(false);}
};
window.subirImagen=async function(input){if(modal.dataset.busy==='true')return;busy(true);try{await originals.upload(input);imageMarker.value=el('serv-imagen-url').value;previewCard();}finally{busy(false);}};
modal.addEventListener('input',event=>{if(['serv-stock','serv-stock-modo','serv-agotado'].includes(event.target.id))stockTouched=true;previewCard();});
modal.addEventListener('change',event=>{if(['serv-stock','serv-stock-modo','serv-agotado'].includes(event.target.id))stockTouched=true;previewCard();});
plans.addEventListener('click',()=>queueMicrotask(previewCard));
async function openDraft(draft){
 const p=draft.datos;
 originals.edit({...p,id:draft.producto_id||'',stock:p.stock_modo==='ilimitado'?null:p.stock,planes:p.planes||[]});
 editing=draft;stockTouched=!!p.stock_modificado;
 el('serv-destacado').checked=!!p.destacado;el('serv-posicion').value=p.posicion??1000000;
 el('serv-promo-programada').checked=!!p.promo_programada;togglePromoInput();
 el('titulo-modal-servicio').textContent='Continuar borrador';el('editor-estado').textContent='Borrador guardado; aún no está publicado.';
 imageMarker.value=p.imagen_url||'';showStep(0);previewCard();VegaUI.clean(modal);
}
function rowProduct(p){
 const tr=document.createElement('tr');
 tr.innerHTML='<td data-label="Producto"><div class="catalogue-product">'+(p.imagen_url?'<img alt="" loading="lazy" src="'+h(VegaSecurity.imageUrl(p.imagen_url))+'">':'')+'<div><strong>'+h(p.nombre)+'</strong><small>'+h(p.categoria||'Sin categoría')+(p.destacado?' · Destacado':'')+'</small></div></div></td><td data-label="Estado"><span class="stock-badge '+(!VegaCatalog.disponible(p)?'sold-out':'')+'">'+h(VegaCatalog.stockTexto(p))+'</span></td><td data-label="Planes">'+VegaCatalog.planes(p).length+' plan(es)</td><td data-label="Posición">'+(Number(p.posicion)===1000000?'Al final':h(p.posicion))+'</td><td data-label="Acciones"></td>';
 const action=tr.lastElementChild;
 const edit=document.createElement('button');edit.className='btn-gestionar';edit.textContent='Editar';edit.onclick=()=>window.editarServicio(p);
 const duplicate=document.createElement('button');duplicate.className='btn-gestionar';duplicate.textContent='Duplicar';duplicate.onclick=()=>{window.editarServicio(p);el('editor-duplicar').click();};
 action.append(edit,duplicate);return tr;
}
async function load(){
 if(!adminAuthorized)return;
 const run=++request,authEpoch=epoch;
 const table=el('tabla-servicios');table.setAttribute('aria-busy','true');error.hidden=true;
 try{
 const {data}=await verificarOperacion(VegaUI.read(supabaseClient.rpc('vega_catalogo_pagina',{p_busqueda:query,p_filtro:filter,p_pagina:page,p_tamano:12})));
 if(run!==request||authEpoch!==epoch||!adminAuthorized)return;
 if(data?.version!==2)throw new Error('La actualización de catálogo está pendiente de activación.');
 ready=true;const isDraft=filter==='borradores',items=isDraft?data.drafts:data.items,total=Number(isDraft?data.draft_total:data.total)||0;
 if(page>0&&page*12>=total){page=Math.max(0,Math.ceil(total/12)-1);return await load();}
 serviciosAdminGlobal=data.items||[];table.replaceChildren();
 const header=table.closest('table').querySelector('thead');
 header.innerHTML=isDraft?'<tr><th>Producto</th><th colspan="3">Estado</th><th>Acciones</th></tr>':'<tr><th>Producto</th><th>Estado</th><th>Planes</th><th>Posición</th><th>Acciones</th></tr>';
 if(!items?.length)table.innerHTML='<tr><td colspan="5" class="empty-state">No hay productos en este filtro.</td></tr>';
 for(const item of items||[]){
 if(!isDraft){table.append(rowProduct(item));continue;}
 const tr=document.createElement('tr');tr.innerHTML='<td data-label="Producto"><strong>'+h(item.datos.nombre||'Sin nombre')+'</strong></td><td colspan="3" data-label="Estado">Borrador · sin publicar</td><td data-label="Acciones"></td>';
 const b=document.createElement('button');b.className='btn-gestionar';b.textContent='Continuar';b.onclick=()=>openDraft(item);tr.lastElementChild.append(b);table.append(tr);
 }
 el('catalogue-count').textContent=total+' '+(isDraft?'borradores':'productos');
 el('catalogue-page').textContent='Página '+(page+1)+' de '+Math.max(1,Math.ceil(total/12));
 el('catalogue-prev').disabled=page===0;el('catalogue-next').disabled=(page+1)*12>=total;
 }catch(e){if(run===request){ready=false;error.hidden=false;error.replaceChildren();const text=document.createElement('span');text.textContent='No se pudo cargar el catálogo. '+e.message;const retry=document.createElement('button');retry.className='btn-gestionar';retry.textContent='Reintentar';retry.onclick=()=>load().catch(mostrarErrorAdmin);error.append(text,retry);}throw e;}
 finally{if(run===request)table.removeAttribute('aria-busy');}
}
window.cargarServicios=()=>load();
window.addEventListener('vega:logout',()=>{epoch++;request++;clearTimeout(timer);editing=null;stockTouched=false;ready=false;query='';filter='todos';page=0;serviciosAdminGlobal=[];el('tabla-servicios').replaceChildren();el('editor-tarjeta').replaceChildren();modal.querySelectorAll('input,textarea').forEach(n=>{if(n.type!=='checkbox')n.value='';});plans.replaceChildren();el('editor-estado').textContent='';});
})();