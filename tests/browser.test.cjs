const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { webcrypto } = require('node:crypto');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
const attack = `<img src=x onerror="window.pwned=true">' & test`;
const service = {id:1,nombre:attack,categoria:attack,etiqueta:attack,caracteristicas:attack,
  imagen_url:'javascript:alert(1)',activo:true,precio:10,tipo_ingreso:'correo',
  planes:[{cantidad:1,unidad:'meses',precio:10}]};

async function page(kind, {allowed=true, code=null}={}) {
  const html = readFileSync(kind === 'admin' ? 'admin.html' : 'index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  const dom = new JSDOM(html, {url:'https://vegalabs-dev.github.io/vega.store/' + (kind==='admin'?'admin.html':'') + (code?'#acceso='+code:''),runScripts:'outside-only'});
  const w = dom.window, calls = [], alerts = [], authCalls = [], rpcHandlers = {}, functionHandlers = {}, intervals = [];
  const originalInterval=w.setInterval.bind(w);w.setInterval=(fn,ms)=>{intervals.push({fn,ms});return originalInterval(fn,ms);};
  Object.defineProperty(w,'crypto',{value:webcrypto}); w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
  w.alert=x=>alerts.push(x); w.confirm=()=>true; w.open=()=>null;
  w.fetch=async()=>({json:async()=>({country_code:'PE'})});
  w.navigator.clipboard={writeText:async()=>{}};
  w.intlTelInput=()=>({setCountry(){},isValidNumber:()=>true,getNumber:()=>'+51900000000'});
  const data = {vega_clientes:[],servicios:[service],promociones:[],admin_accesos:[],usuarios_canva:[]};
  w.supabase={createClient:(url,key,options={})=>({
    auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{},getUser:async()=>({data:{user:{id:'fixture'}}}),
      signInWithPassword:async()=>({error:null}),signOut:async()=>{authCalls.push('signOut');}},
    rpc:async(name,args)=>{authCalls.push(name); calls.push({rpc:name,args}); return rpcHandlers[name] ? rpcHandlers[name](args) : name==='vega_panel_pagina' ? {data:{version:2,profiles:[],orders:[],notices:[],catalog:data.servicios,total:0,stats:{}},error:null} : {data:allowed,error:null};},
    functions:{invoke:async(name,args)=>{calls.push({fn:name,body:args.body});return functionHandlers[name]?functionHandlers[name](args.body):{data:{enabled:false},error:null};}},
    from(table){
      const call={table,options,op:'select',filters:[]};calls.push(call);
      const query={
        select(columns){call.columns=columns;return query;},
        insert(rows){call.op='insert';call.rows=rows;return query;},
        update(values){call.op='update';call.values=values;return query;},
        delete(){call.op='delete';return query;},
        eq(key,value){call.filters.push(['eq',key,value]);return query;},
        neq(key,value){call.filters.push(['neq',key,value]);return query;},
        order(){return query;},limit(){return query;},
        then(resolve,reject){
          let rows=data[table]||[];
          for(const [op,k,v] of call.filters) rows=rows.filter(x=>op==='eq'?x[k]===v:x[k]!==v);
          return Promise.resolve({data:rows,error:null}).then(resolve,reject);
        }
      };return query;
    }
  })};
  for (const file of (kind==='admin' ? ['catalogo.js','vigencia.js','interfaz.js','security.js','mensaje-formato.js','clientes.js','admin.js','historial.js','gestion.js','respaldo.js','respaldo-panel.js','chat-mensajes.js','ventanas.js'] : ['catalogo.js','vigencia.js','interfaz.js','security.js','main.js','historial.js','ventanas.js']))
    vm.runInContext(readFileSync(file,'utf8'),dom.getInternalVMContext(),{filename:file});
  w.VegaUI.confirm=async()=>w.confirm();w.VegaUI.toast=x=>alerts.push(x);
  await tick();
  return {w,dom,calls,alerts,authCalls,data,rpcHandlers,functionHandlers,intervals};
}

test('private code uses cryptographic entropy, SHA-256 and a fragment removed on entry', async t=>{
  const code='a'.repeat(48); const {w,dom}=await page('store',{code}); t.after(()=>dom.window.close());
  assert.equal(w.location.hash,'');
  assert.equal(w.VegaSecurity.loadCode(),code);
  assert.match(w.VegaSecurity.newCode(),/^[a-f0-9]{48}$/);
  assert.equal((await w.VegaSecurity.hashCode(code)).length,64);
  assert.equal(w.VegaSecurity.privateLink(code),'https://vegalabs-dev.github.io/vega.store/#acceso='+code);
  assert.equal(w.VegaSecurity.imageUrl('javascript:alert(1)'),'');
  assert.equal(w.VegaSecurity.imageUrl('data:text/html,test'),'');
});

test('admin rejects registered non-admin before loading management data', async t=>{
  const {w,dom,calls,authCalls}=await page('admin',{allowed:false});t.after(()=>dom.window.close());
  await assert.rejects(w.mostrarPanel(),/no tiene permiso/);
  assert.equal(calls.filter(c=>c.table).length,0);
  assert.deepEqual(authCalls,['is_vega_admin','signOut']);
});

test('admin renders submitted values as text and startup does not delete records', async t=>{
  const {w,dom,calls,data}=await page('admin');t.after(()=>dom.window.close());
  data.usuarios_canva=[{id:1,correo:attack,telefono:'+51900000000',servicio:attack,token:attack,
    estado:'Pendiente',meses:1,unidad:'meses',creado_en:'2026-01-01T00:00:00Z'}];
  await w.mostrarPanel();
  await w.cargarServicios();
  const table=w.document.getElementById('tabla-solicitudes');
  assert.ok(table.textContent.includes(attack));
  assert.equal(w.document.querySelectorAll('[onerror]').length,0);
  assert.equal(w.document.querySelectorAll('img[src^="javascript:"]').length,0);
  assert.equal(table.querySelector('[data-email]').dataset.email,attack);
  assert.equal(calls.filter(c=>c.op==='delete').length,0);
});

test('store preserves malicious catalogue values as text and requests private columns only', async t=>{
  const code='b'.repeat(48);const {w,dom,calls}=await page('store',{code});t.after(()=>dom.window.close());
  assert.ok(w.document.getElementById('contenedor-servicios').textContent.includes(attack));
  assert.equal(w.document.querySelectorAll('[onerror]').length,0);
  assert.equal(w.document.querySelectorAll('img[src^="javascript:"]').length,0);
  const customerRead=calls.find(c=>c.table==='usuarios_canva');
  assert.equal(customerRead.options.global.headers['x-vega-access'],code);
  assert.equal(customerRead.options.auth.persistSession,false);
  assert.equal(customerRead.columns,'id,servicio,estado,fecha_inicio,fecha_fin,vigencia_inicio,ultima_ampliacion,creado_en,meses,unidad');
  assert.equal(customerRead.filters.some(f=>f[1]==='telefono'),false);
  await w.cerrarSesionCliente();
  assert.equal(w.VegaSecurity.loadCode(),null);
});

test('new purchase keeps contact separate, inserts no activation fields and offers WhatsApp fallback', async t=>{
  const {w,dom,calls}=await page('store');t.after(()=>dom.window.close());
  await w.prepararCompra({id:1,nombre:'Fixture service',precio:10,cantidad:1,unidad:'meses',tipo_ingreso:'correo'});
  assert.equal(w.document.getElementById('modal-login').classList.contains('oculto'),false);
  await w.procesarLogin();
  w.document.getElementById('correo-compra').value='fixture@example.test';
  w.document.getElementById('btn-otro-medio').click();
  for(let i=0;i<5&&!calls.some(c=>c.op==='insert');i++)await tick();
  await tick();
  const order=calls.find(c=>c.table==='usuarios_canva'&&c.op==='insert');
  assert.ok(order);
  const row=order.rows[0];
  assert.equal(row.telefono,'+51900000000'); assert.equal(row.correo,'fixture@example.test');
  assert.equal('estado' in row,false); assert.equal('fecha_fin' in row,false);
  assert.match(row.consulta_hash,/^[a-f0-9]{64}$/);
  assert.notEqual(row.consulta_hash,order.options.global.headers['x-vega-access']);
  assert.match(row.token,/^TK-[A-F0-9]{12}$/);
  const link=w.document.getElementById('pagar-pedido-link');
  assert.equal(link.hidden,false); assert.ok(link.href.startsWith('https://wa.me/'));
  assert.equal(w.document.getElementById('modal-panel-cliente').classList.contains('oculto'),false);
});

const customer={id:'00000000-0000-4000-8000-000000000099',nombre:attack,telefono:null,whatsapp_usuario:'maria_test',codigo_privado:'f'.repeat(48)};
const activeOrder={id:99,cliente_id:customer.id,nombre_cliente:customer.nombre,whatsapp_usuario:customer.whatsapp_usuario,telefono:null,
  correo:'fixture@example.test',servicio:'Canva Pro',estado:'Activo',meses:1,unidad:'meses',fecha_fin:'2026-12-01',creado_en:'2026-09-12T00:00:00Z'};

test('profile and message screens contain unique IDs and keep username-only customers searchable',async t=>{
  const {w,dom,data}=await page('admin');t.after(()=>dom.window.close());
  const ids=[...w.document.querySelectorAll('[id]')].map(x=>x.id);assert.equal(ids.length,new Set(ids).size);
  data.vega_clientes=[customer];data.usuarios_canva=[activeOrder];await w.mostrarPanel();
  assert.ok(w.document.getElementById('lista-fichas').textContent.includes(attack));
  assert.equal(w.document.querySelectorAll('[onerror]').length,0);
  w.document.getElementById('buscador-clientes').value='maria_test';w.filtrarClientes();
  assert.ok(w.document.getElementById('tabla-clientes').textContent.includes('Canva Pro'));
  w.abrirFicha(customer.id);
  assert.equal(w.document.getElementById('ficha-enlace').value,w.VegaSecurity.privateLink(customer.codigo_privado));
  assert.equal(w.document.getElementById('ficha-servicios').children.length,1);
  w.registroManual(customer.id);
  assert.equal(w.document.getElementById('manual-ficha').value,customer.id);
  assert.equal(w.document.getElementById('manual-nuevo-cliente').hidden,true);
});

test('all message shortcuts reuse the private link and choose a chat without a phone',async t=>{
  const {w,dom,calls,data}=await page('admin');t.after(()=>dom.window.close());
  data.vega_clientes=[customer];data.usuarios_canva=[activeOrder];await w.mostrarPanel();
  await w.abrirMensajesCliente(99);
  const expected=w.VegaSecurity.privateLink(customer.codigo_privado);
  for(const tipo of ['enlace','activacion','vencimiento','renovacion']){
    w.document.getElementById('mensaje-atajo').value=tipo;w.prepararMensajeCliente();
    const message=w.document.getElementById('mensaje-texto').value;
    assert.ok(message.includes(expected));
    const url=new URL(w.document.getElementById('mensaje-whatsapp').href);
    assert.equal(url.origin,'https://wa.me');assert.equal(url.pathname,'/');assert.equal(url.searchParams.get('text'),message);
  }
  await w.abrirMensajesCliente(99);assert.ok(w.document.getElementById('mensaje-texto').value.includes(expected));
  assert.equal(calls.some(c=>c.op==='update'||c.op==='insert'),false);
  w.document.getElementById('mensaje-texto').value='Texto revisado '+expected;w.actualizarDestinosMensaje();
  assert.equal(new URL(w.document.getElementById('mensaje-whatsapp').href).searchParams.get('text'),'Texto revisado '+expected);
});

test('phone contacts open a direct chat and still offer the chat picker',async t=>{
  const {w,dom,data}=await page('admin');t.after(()=>dom.window.close());
  data.vega_clientes=[{...customer,telefono:'+51900000000'}];data.usuarios_canva=[activeOrder];await w.mostrarPanel();
  await w.abrirMensajesCliente(99);
  assert.equal(new URL(w.document.getElementById('mensaje-whatsapp').href).pathname,'/51900000000');
  assert.equal(new URL(w.document.getElementById('mensaje-elegir-chat').href).pathname,'/');
});

test('manual username-only registration calls the atomic RPC then prepares activation',async t=>{
  const {w,dom,data,rpcHandlers}=await page('admin');t.after(()=>dom.window.close());await w.mostrarPanel();
  w.registroManual();
  w.document.getElementById('manual-nombre').value='María';w.document.getElementById('manual-usuario').value='@maria_test';
  w.document.getElementById('manual-producto').value='libre';w.document.getElementById('manual-servicio').value='Canva Pro';
  rpcHandlers.vega_registro_seguro=async args=>{
    assert.equal(args.p_telefono,null);assert.equal(args.p_usuario,'maria_test');assert.equal(args.p_nombre,'María');assert.equal(args.p_cantidad,1);
    data.vega_clientes=[{...customer,nombre:'María'}];data.usuarios_canva=[activeOrder];return {data:99,error:null};
  };
  await w.guardarRegistroManual();
  assert.equal(w.document.getElementById('manual-guardar').disabled,false);
  assert.equal(w.document.getElementById('mensaje-atajo').value,'activacion');
  assert.ok(w.document.getElementById('mensaje-texto').value.includes('está activo'));
});

test('store checkout accepts a username instead of a telephone',async t=>{
  const {w,dom,calls}=await page('store');t.after(()=>dom.window.close());
  await w.prepararCompra({id:1,nombre:'Canva Pro',precio:10,cantidad:1,unidad:'meses',tipo_ingreso:'numero'});
  w.document.getElementById('login-tipo-contacto').value='usuario';w.cambiarTipoContacto();
  assert.equal(w.document.getElementById('login-campo-telefono').hidden,true);
  w.document.getElementById('login-usuario').value='@maria_test';w.document.getElementById('login-nombre').value='María';
  await w.procesarLogin();w.document.getElementById('correo-compra').value='fixture@example.test';w.document.getElementById('btn-otro-medio').click();
  for(let i=0;i<5&&!calls.some(c=>c.op==='insert');i++)await tick();
  const row=calls.find(c=>c.op==='insert').rows[0];
  assert.equal(row.telefono,null);assert.equal(row.whatsapp_usuario,'maria_test');assert.equal(row.nombre_cliente,'María');
});

test('limited offers respect exact start/end and Peru dates independently of local timezone',async t=>{
  const {w,dom}=await page('store');t.after(()=>dom.window.close());
  const s={...service,promocion_inicio:'2026-09-20T15:00:00Z',promocion_fin:'2026-09-21T15:00:00Z',planes:[{cantidad:1,unidad:'meses',precio:20,promo:10}]};
  const start=Date.parse(s.promocion_inicio),end=Date.parse(s.promocion_fin);
  assert.equal(w.VegaCatalog.planes(s,start-1)[0].total,20);
  assert.equal(w.VegaCatalog.planes(s,start)[0].total,10);
  assert.equal(w.VegaCatalog.planes(s,end)[0].total,20);
  assert.equal(w.VegaCatalog.inputPeru(s.promocion_inicio),'2026-09-20T10:00');
  assert.equal(w.VegaCatalog.desdePeru('2026-09-20T10:00'),s.promocion_inicio.replace('Z','.000Z'));
});

test('offers show discounted plans, sold-out controls are disabled, and filters combine',async t=>{
  const {w,dom,data}=await page('store');t.after(()=>dom.window.close());
  const offer={...service,nombre:'Canva',categoria:'Diseño',stock:3,promocion_inicio:new Date(Date.now()-3600000).toISOString(),promocion_fin:new Date(Date.now()+3600000).toISOString(),planes:[{cantidad:1,unidad:'meses',precio:2},{cantidad:6,unidad:'meses',precio:20,promo:10}]};
  data.servicios=[offer,{...service,id:2,nombre:'Gemini',stock:0}];await w.cargarCatalogo();
  const ofertas=w.document.getElementById('ofertas-limitadas');assert.equal(ofertas.hidden,false);
  assert.match(ofertas.textContent,/S\/ 10.00/);assert.match(ofertas.textContent,/3 cupos disponibles/);
  w.document.querySelectorAll('#contenedor-servicios .card')[0].querySelectorAll('.btn-plan-tarjeta')[1].click();
  await w.cargarCatalogo();
  assert.match(w.document.querySelector('#contenedor-servicios .price').textContent,/10.00/);
  const sold=w.document.querySelector('.is-sold-out');assert.ok(sold.querySelector('.btn-primary').disabled);
  w.abrirModalDetalles(data.servicios[1]);assert.equal(w.document.querySelector('#detalles-btn-comprar button').disabled,true);
  const ids=[...w.document.querySelectorAll('[id]')].map(x=>x.id);assert.equal(ids.length,new Set(ids).size);
  w.document.getElementById('solo-disponibles').checked=true;w.actualizarVistaCatalogo();
  assert.equal(w.document.querySelectorAll('#contenedor-servicios .card').length,1);
  w.document.querySelector('.search-bar input').value='Gemini';w.actualizarVistaCatalogo();
  assert.equal(w.document.querySelectorAll('#contenedor-servicios .card').length,0);assert.equal(ofertas.hidden,true);
});

test('checkout rechecks stock and changed prices before inserting a request',async t=>{
  const {w,dom,data,calls,alerts}=await page('store');t.after(()=>dom.window.close());
  data.servicios=[{...service,stock:1}];await w.prepararCompra({...service,cantidad:1,unidad:'meses'});await w.procesarLogin();
  w.document.getElementById('correo-compra').value='fixture@example.test';
  data.servicios=[{...service,stock:0}];w.document.getElementById('btn-otro-medio').click();await tick();
  assert.equal(calls.some(c=>c.op==='insert'),false);assert.ok(alerts.some(x=>x.includes('agotado')));
  data.servicios=[{...service,stock:1,planes:[{cantidad:1,unidad:'meses',precio:12}]}];
  w.document.getElementById('btn-otro-medio').click();await tick();
  assert.equal(calls.some(c=>c.op==='insert'),false);assert.ok(alerts.some(x=>x.includes('precio cambió')));
  assert.match(w.document.getElementById('btn-otro-medio').innerText,/12.00/);
});

test('admin saves stock and Peru schedule with a stale-stock guard, without overwriting untouched counts',async t=>{
  const {w,dom,data,calls}=await page('admin');t.after(()=>dom.window.close());
  data.servicios=[{...service,stock:5,stock_version:3,planes:[{cantidad:1,unidad:'meses',precio:20,promo:10}]}];
  await w.mostrarPanel();await w.cargarServicios();w.editarServicioPorId(1);
  w.document.getElementById('serv-stock').value='8';
  w.document.getElementById('serv-promo-programada').checked=true;
  w.document.getElementById('serv-promo-inicio').value='2026-09-20T10:00';
  w.document.getElementById('serv-promo-fin').value='2026-09-21T10:00';
  await w.guardarServicio();
  let saved=calls.filter(c=>c.table==='servicios'&&c.op==='update').at(-1);
  assert.equal(saved.values.stock,8);assert.equal(saved.values.promocion_inicio,'2026-09-20T15:00:00.000Z');
  assert.ok(saved.filters.some(f=>f[1]==='stock_version'&&f[2]===3));
  w.editarServicioPorId(1);await w.guardarServicio();
  saved=calls.filter(c=>c.table==='servicios'&&c.op==='update').at(-1);
  assert.equal('stock' in saved.values,false);assert.equal('agotado' in saved.values,false);
});

test('offer carousel stays compact, preserves exact discounted plan, and supports navigation/pause',async t=>{
  const {w,dom,data,intervals}=await page('store');t.after(()=>dom.window.close());
  Object.defineProperty(w.document,'hidden',{value:false,configurable:true});
  const offer={...service,nombre:'Oferta A',stock:3,promocion_inicio:new Date(Date.now()-3600000).toISOString(),promocion_fin:new Date(Date.now()+3600000).toISOString(),planes:[{cantidad:1,unidad:'meses',precio:2},{cantidad:6,unidad:'meses',precio:20,promo:10}]};
  data.servicios=[offer,{...offer,id:2,nombre:'Oferta B'}];await w.cargarCatalogo();
  const track=w.document.getElementById('contenedor-ofertas');
  assert.equal(track.querySelectorAll('.card').length,0);assert.equal(track.children.length,2);
  w.document.getElementById('oferta-siguiente').click();assert.equal(track.style.transform,'translateX(-100%)');
  assert.equal(track.children[0].inert,true);assert.equal(track.children[1].inert,false);
  w.document.getElementById('oferta-pausa').click();intervals.find(i=>i.ms===6000).fn();
  assert.equal(track.style.transform,'translateX(-100%)');
  w.document.getElementById('oferta-pausa').click();intervals.find(i=>i.ms===6000).fn();assert.equal(track.style.transform,'translateX(-0%)');
  track.children[0].querySelector('.offer-open').click();
  assert.match(w.document.getElementById('detalles-precio-box').textContent,/6 Meses/);
  assert.match(w.document.getElementById('precio-dinamico-modal').textContent,/10.00/);
  data.servicios=[offer];await w.cargarCatalogo();assert.equal(w.document.getElementById('ofertas-controles').hidden,true);
});

test('outside click and Escape close windows without removing private access; cancelling logout preserves it',async t=>{
  const code='a'.repeat(48);const {w,dom}=await page('store',{code});t.after(()=>dom.window.close());
  const panel=w.document.getElementById('modal-panel-cliente');
  await tick();panel.querySelector('.customer-heading').click();assert.equal(panel.classList.contains('oculto'),false);
  panel.click();await tick();assert.equal(panel.classList.contains('oculto'),true);assert.equal(w.VegaSecurity.loadCode(),code);
  w.abrirMiCuenta();await tick();w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await tick();
  assert.equal(panel.classList.contains('oculto'),true);assert.equal(w.VegaSecurity.loadCode(),code);
  w.confirm=()=>false;await w.cerrarSesionCliente();assert.equal(w.VegaSecurity.loadCode(),code);
  w.confirm=()=>true;await w.cerrarSesionCliente();assert.equal(w.VegaSecurity.loadCode(),null);
  assert.ok(panel.querySelector('.customer-footer .logout-button'));assert.ok(panel.querySelector('button.cerrar-modal'));
});

test('admin logout requires confirmation and dismissing a window does not sign out',async t=>{
  const {w,dom,authCalls}=await page('admin');t.after(()=>dom.window.close());
  await w.mostrarPanel();w.confirm=()=>false;await w.cerrarSesion();assert.equal(authCalls.includes('signOut'),false);
  w.abrirModal('modal-servicio');await tick();w.document.getElementById('modal-servicio').click();await tick();
  assert.equal(w.document.getElementById('modal-servicio').classList.contains('show'),false);
  assert.equal(authCalls.includes('signOut'),false);
});


test('current service duration, status and dates replace the original purchase label',async t=>{
 const {w,dom,data}=await page('store',{code:'a'.repeat(48)});t.after(()=>dom.window.close());
 data.usuarios_canva=[{id:1,servicio:'Fixture',estado:'Activo',meses:1,unidad:'meses',fecha_inicio:'2028-01-31',vigencia_inicio:'2028-01-31',fecha_fin:'2029-01-31',ultima_ampliacion:'+11 meses'},
 {id:2,servicio:'Expired',estado:'Activo',meses:1,fecha_fin:'2000-01-01'}, {id:3,servicio:'Missing',estado:'Activo',meses:1}];
 await w.cargarMisServicios();const cards=w.document.querySelectorAll('.customer-service');
 assert.match(cards[0].textContent,/1 año/);assert.match(cards[0].textContent,/11 meses/);assert.doesNotMatch(cards[0].textContent,/Quedan/);
 assert.equal(cards[1].querySelector('.status-chip').textContent,'Vencido');assert.equal(cards[2].querySelector('.status-chip').textContent,'Revisar fecha');assert.doesNotMatch(cards[2].textContent,/permanente/i);
 assert.equal(w.VegaDates.add('2028-01-31',1,'meses'),'2028-02-29');assert.equal(w.VegaDates.add('2028-02-29',1,'años'),'2029-02-28');
});

test('extension form sends a stable operation ID and server version then prepares its notice',async t=>{
 const {w,dom,data,calls,rpcHandlers}=await page('admin');t.after(()=>dom.window.close());
 const p={id:22,cliente_id:'12345678-1234-4234-8234-123456789012',servicio:'Fixture',estado:'Activo',meses:1,unidad:'meses',fecha_inicio:'2028-01-31',fecha_fin:'2028-02-29',version:3};
 data.usuarios_canva=[p];data.vega_clientes=[{id:p.cliente_id,nombre:'Fixture',codigo_privado:'b'.repeat(48)}];
 await w.mostrarPanel();w.abrirGestionCliente(p.id);w.abrirAmpliacion('regalo');
 w.document.getElementById('ampliacion-cantidad').value='1';w.document.getElementById('ampliacion-unidad').value='años';w.actualizarVistaAmpliacion();
 assert.match(w.document.getElementById('ampliacion-preview').textContent,/2029/);
 rpcHandlers.vega_actualizar_vigencia=args=>{p.fecha_fin='2029-02-28';p.ultima_ampliacion='+1 año';return {data:p.fecha_fin,error:null};};
 await w.guardarAmpliacion();const call=calls.find(c=>c.rpc==='vega_actualizar_vigencia');assert.equal(call.args.p_version,3);assert.equal(call.args.p_motivo,'regalo');assert.match(call.args.p_operacion,/^[a-f0-9-]{36}$/);
 assert.equal(w.document.getElementById('mensaje-atajo').value,'ampliacion');assert.match(w.document.getElementById('mensaje-texto').value,/1 año/);
});

test('tomorrow follow-up recomputes after renewal and opening WhatsApp never marks delivery',async t=>{
 const {w,dom,data,calls}=await page('admin');t.after(()=>dom.window.close());
 const p={id:23,cliente_id:'12345678-1234-4234-8234-123456789012',servicio:'Fixture',estado:'Activo',meses:1,fecha_fin:w.VegaDates.add(w.VegaDates.today(),1,'dias')};
 data.usuarios_canva=[p];data.vega_clientes=[{id:p.cliente_id,nombre:'Fixture',codigo_privado:'b'.repeat(48)}];await w.mostrarPanel();
 assert.equal(w.document.querySelectorAll('.follow-up-row').length,1);await w.abrirMensajesCliente(p.id,'vencimiento');
 assert.equal(calls.filter(c=>c.table==='vega_avisos_manuales'&&c.op!=='select').length,0);
 p.fecha_fin=w.VegaDates.add(p.fecha_fin,1,'meses');await w.cargarDatosPrincipales();assert.equal(w.document.querySelectorAll('.follow-up-row').length,0);
});

test('outside dismissal protects unsaved fields while a saved read-only window closes',async t=>{
 const {w,dom}=await page('admin');t.after(()=>dom.window.close());await w.mostrarPanel();w.registroManual();await tick();
 const modal=w.document.getElementById('modal-registro-manual');w.document.getElementById('manual-nombre').value='Unsaved';w.confirm=()=>false;
 modal.click();await tick();assert.equal(modal.classList.contains('show'),true);
 w.confirm=()=>true;modal.click();await tick();assert.equal(modal.classList.contains('show'),false);
});


test('backup form never sends passwords, exports plaintext or downloads after logout',async t=>{
  const {w,dom,calls,rpcHandlers}=await page('admin');t.after(()=>dom.window.close());
  await w.mostrarPanel();w.abrirRespaldo();
  const byId=id=>w.document.getElementById(id);
  const pass='Local password fixture 1234';
  byId('respaldo-clave').value=pass;byId('respaldo-repetir').value='Not the same password';
  byId('respaldo-crear').dispatchEvent(new w.Event('submit',{cancelable:true}));
  assert.equal(calls.some(x=>x.rpc==='vega_exportar_datos'),false);
  byId('respaldo-repetir').value=pass;
  let resolve;rpcHandlers.vega_exportar_datos=()=>new Promise(r=>resolve=r);
  let downloads=0;w.URL.createObjectURL=()=>{downloads++;return 'blob:fixture';};
  byId('respaldo-crear').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
  const call=calls.find(x=>x.rpc==='vega_exportar_datos');assert.equal(call.args,undefined);
  w.dispatchEvent(new w.Event('vega:logout'));resolve({data:'not returned to a signed-out user',error:null});await tick();
  assert.equal(downloads,0);assert.equal(byId('respaldo-clave').value,'');assert.equal(byId('respaldo-resultado').textContent,'');
  assert.equal(JSON.stringify(calls).includes(pass),false);
});


test('AI chat protects customer fields, previews safely and applies only after review',async t=>{
  const {w,dom,data,rpcHandlers,functionHandlers,calls}=await page('admin');t.after(()=>dom.window.close());
  const code='c'.repeat(48),customer='Private Customer';
  data.vega_clientes=[{id:'00000000-0000-4000-8000-000000000001',nombre:customer,telefono:'+51999999999',codigo_privado:code}];
  data.usuarios_canva=[{id:1,cliente_id:data.vega_clientes[0].id,servicio:'Canva Pro',estado:'Activo',meses:1,fecha_inicio:'2026-09-01',fecha_fin:'2026-10-01'}];
  rpcHandlers.vega_estilo_mensajes=()=>({data:{estilo:'Breve y amable',version:1}});
  let version=1;functionHandlers['vega-redactar']=body=>({data:body.action==='estado'?{enabled:true}:{respuesta:'Listo para revisar.',mensaje:'*Propuesta* '+version+'\n'+body.borrador,sticker:'gracias'}});
  await w.mostrarPanel();await w.abrirMensajesCliente(1,'vencimiento');await tick();
  w.confirm=()=>false;assert.equal(await w.VegaUI.canClose(w.document.getElementById('modal-mensajes')),true);
  const editor=w.document.getElementById('mensaje-texto'),original=editor.value,form=w.document.getElementById('ia-formulario'),input=w.document.getElementById('ia-instruccion');
  input.value='Más breve y amable';form.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
  const call=calls.find(c=>c.fn&&c.body.action==='chat');assert.ok(call);assert.doesNotMatch(JSON.stringify(call.body),new RegExp(code+'|Private Customer|51999999999'));
  assert.match(call.body.borrador,/\[\[ENLACE_PRIVADO\]\]/);assert.equal(editor.value,original);
  w.document.querySelector('[data-apply]').click();assert.match(editor.value,/Propuesta/);assert.ok(editor.value.includes(code));
  input.value='Otro ajuste';version=2;form.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
  const candidate=[...w.document.querySelectorAll('[data-apply]')].at(-1);editor.value='Manual edit';candidate.click();assert.equal(editor.value,'Manual edit');
  assert.ok(w.document.querySelector('.sticker-tip').textContent.includes('dentro de WhatsApp'));
});

test('style is saved explicitly, reloads across drafts and late chat responses cannot cross customers',async t=>{
  const {w,dom,data,rpcHandlers,functionHandlers,calls}=await page('admin');t.after(()=>dom.window.close());
  data.vega_clientes=[{id:'00000000-0000-4000-8000-000000000001',nombre:'Fixture',codigo_privado:'d'.repeat(48)}];
  data.usuarios_canva=[{id:1,cliente_id:data.vega_clientes[0].id,servicio:'Test',estado:'Activo',meses:1}];
  let style={estilo:'',version:0},resolve;
  rpcHandlers.vega_estilo_mensajes=args=>{if(args?.p_estilo!==undefined)style={estilo:args.p_estilo,version:style.version+1};return {data:style};};
  functionHandlers['vega-redactar']=body=>body.action==='estado'?{data:{enabled:true}}:new Promise(r=>resolve=r);
  await w.mostrarPanel();await w.abrirMensajesCliente(1);await tick();
  const input=w.document.getElementById('ia-instruccion');input.value='Usa pocos emojis';w.document.getElementById('ia-recordar').click();await tick();assert.equal(style.estilo,'Usa pocos emojis');
  w.document.getElementById('ia-formulario').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
  w.prepararMensajeCliente();resolve({data:{respuesta:'Stale reply',mensaje:'Wrong customer',sticker:'ninguno'}});await tick();
  assert.doesNotMatch(w.document.getElementById('ia-conversacion').textContent,/Stale reply|Wrong customer/);
  await w.comprobarIA();await tick();assert.equal(w.document.getElementById('ia-estilo').value,'Usa pocos emojis');
  w.document.getElementById('ia-estilo').value='';w.document.getElementById('ia-guardar-estilo').click();await tick();assert.equal(style.estilo,'');
  assert.equal(calls.some(c=>c.table&&['usuarios_canva','vega_clientes'].includes(c.table)&&c.op!=='select'),false);
  let loaded;rpcHandlers.vega_estilo_mensajes=()=>new Promise(r=>loaded=r);
  await w.comprobarIA();w.VegaChat.reset();loaded({data:{estilo:'Persistent style',version:4}});await tick();
  assert.equal(w.document.getElementById('ia-estilo').value,'Persistent style');
  rpcHandlers.vega_estilo_mensajes=()=>({error:{message:'temporary failure'}});
  w.document.getElementById('ia-recargar-estilo').click();await tick();
  assert.equal(w.document.getElementById('ia-recargar-estilo').disabled,false);
  w.dispatchEvent(new w.Event('vega:logout'));assert.equal(w.document.getElementById('ia-estilo').value,'');assert.equal(w.document.getElementById('ia-conversacion').textContent,'');
});


test('phase 2 navigation retains all management screens and labels the editor groups',async t=>{
 const {w,dom}=await page('admin');t.after(()=>dom.window.close());
 for(const file of ['panel-v2.js','panel-datos-v2.js','catalogo-admin-v2.js'])vm.runInContext(readFileSync(file,'utf8'),dom.getInternalVMContext(),{filename:file});
 assert.equal(w.document.querySelectorAll('.admin-nav .tab-btn').length,6);
 for(const id of ['tab-ventas','tab-fichas','tab-solicitudes','tab-papelera','tab-seguimiento','tab-catalogo'])assert.ok(w.document.getElementById(id));
 assert.equal(w.document.querySelectorAll('.editor-group').length,4);
 assert.ok(w.document.querySelector('#editor-group-1 #contenedor-planes'));
 assert.ok(w.document.querySelector('#editor-group-2 #serv-stock'));
 assert.ok(w.document.querySelector('#editor-group-3 #serv-activo'));
 w.abrirModalServicio();
 assert.equal(w.document.getElementById('titulo-modal-servicio').textContent,'Nuevo producto');
});

test('phase 2 saves private drafts before publishing and preserves failed edits',async t=>{
 const {w,dom,rpcHandlers,calls}=await page('admin');t.after(()=>dom.window.close());
 for(const file of ['panel-v2.js','panel-datos-v2.js','catalogo-admin-v2.js'])vm.runInContext(readFileSync(file,'utf8'),dom.getInternalVMContext(),{filename:file});
 await w.mostrarPanel();
 const byId=id=>w.document.getElementById(id);
 w.abrirModalServicio();byId('serv-nombre').value='Draft title';
 byId('contenedor-planes').querySelector('.plan-precio').value='10';
 rpcHandlers.vega_catalogo_borrador=args=>({data:{id:args.p_id,producto_id:null,datos:args.p_datos,version:args.p_esperada+1,producto_version:null,stock_version:null},error:null});
 rpcHandlers.vega_catalogo_publicar=()=>({data:null,error:{message:'Concurrent change'}});
 byId('editor-guardar-borrador').click();await tick();
 assert.equal(calls.filter(c=>c.rpc==='vega_catalogo_publicar').length,0);
 assert.match(byId('editor-estado').textContent,/guardado/);
 await assert.rejects(w.guardarServicio(),/Concurrent change/);
 assert.equal(byId('serv-nombre').value,'Draft title');
 assert.match(byId('editor-estado').textContent,/borrador se conserva/);
 assert.equal(byId('editor-guardar-borrador').disabled,false);
 w.dispatchEvent(new w.Event('vega:logout'));
 assert.equal(byId('serv-nombre').value,'');
});

test('phase 2 catalogue uses server paging and escaped names',async t=>{
 const {w,dom,rpcHandlers,calls}=await page('admin');t.after(()=>dom.window.close());
 for(const file of ['panel-v2.js','panel-datos-v2.js','catalogo-admin-v2.js'])vm.runInContext(readFileSync(file,'utf8'),dom.getInternalVMContext(),{filename:file});
 await w.mostrarPanel();
 rpcHandlers.vega_catalogo_pagina=args=>({data:{version:2,items:[{...service,posicion:0,catalogo_version:0}],total:25,drafts:[],draft_total:0},error:null});
 await w.cargarServicios();
 assert.equal(w.document.querySelector('#tabla-servicios img[onerror]'),null);
 assert.match(w.document.getElementById('tabla-servicios').textContent,/onerror/);
 w.document.getElementById('catalogue-next').click();await tick();
 assert.equal(calls.filter(c=>c.rpc==='vega_catalogo_pagina').at(-1).args.p_pagina,1);
 assert.equal(calls.filter(c=>c.rpc==='vega_catalogo_pagina').at(-1).args.p_tamano,12);
});

test('catalogue priority keeps featured sold-out products after all available products',async t=>{
 const {w,dom}=await page('store');t.after(()=>dom.window.close());
 const ordered=w.VegaCatalog.ordenar([{id:1,activo:true,agotado:true,destacado:true,posicion:0},
 {id:2,activo:true,stock:5,posicion:4},{id:3,activo:true,stock:1,destacado:true,posicion:8},
 {id:4,activo:true,stock:2,posicion:1}]);
 assert.equal(ordered.map(x=>x.id).join(','),'3,4,2,1');
});


test('management reads only the requested page and details remain available outside it',async t=>{
 const {w,dom,rpcHandlers,calls}=await page('admin');t.after(()=>dom.window.close());
 for(const file of ['panel-v2.js','panel-datos-v2.js','catalogo-admin-v2.js'])vm.runInContext(readFileSync(file,'utf8'),dom.getInternalVMContext(),{filename:file});
 const profile={id:'10000000-0000-4000-8000-000000000111',nombre:'Page customer',codigo_privado:'a'.repeat(48)};
 const order={id:9999,cliente_id:profile.id,servicio:'Example',estado:'Activo',meses:0,fecha_fin:null};
 rpcHandlers.vega_panel_pagina=args=>({data:{version:2,total:37,profiles:args.p_vista==='fichas'?[profile]:[],orders:args.p_vista==='fichas'?[order]:[],notices:[],catalog:[],stats:{activos:2000,pendientes:14,manana:3,agotados:2}},error:null});
 rpcHandlers.vega_panel_detalle=()=>({data:{profiles:[profile],orders:[order]},error:null});
 await w.mostrarPanel();w.switchTab('fichas');await tick();
 assert.match(w.document.getElementById('lista-fichas').textContent,/Page customer/);
 assert.equal(w.document.getElementById('stat-activos').textContent,'2000');
 w.document.getElementById('page-next-fichas').click();await tick();
 assert.equal(calls.filter(c=>c.rpc==='vega_panel_pagina').at(-1).args.p_pagina,1);
 await w.abrirFicha(profile.id);
 assert.match(w.document.getElementById('ficha-servicios').textContent,/Example/);
 assert.equal(calls.some(c=>c.rpc==='vega_panel_detalle'&&c.args.p_cliente_id===profile.id),true);
 const batchReads=calls.filter(c=>['usuarios_canva','vega_clientes'].includes(c.table)&&c.op==='select');
 assert.equal(batchReads.length,0);
 w.dispatchEvent(new w.Event('vega:logout'));
 assert.equal(w.document.getElementById('lista-fichas').textContent,'');
});

test('uncertain publication retries the same operation without creating another draft',async t=>{
 const {w,dom,rpcHandlers,calls}=await page('admin');t.after(()=>dom.window.close());
 for(const file of ['panel-v2.js','panel-datos-v2.js','catalogo-admin-v2.js'])vm.runInContext(readFileSync(file,'utf8'),dom.getInternalVMContext(),{filename:file});
 await w.mostrarPanel();w.abrirModalServicio();
 w.document.getElementById('serv-nombre').value='Retry fixture';
 w.document.querySelector('.plan-precio').value='12';
 rpcHandlers.vega_catalogo_borrador=args=>({data:{id:args.p_id,version:1,producto_id:null,producto_version:null,stock_version:null,datos:args.p_datos},error:null});
 let attempt=0;rpcHandlers.vega_catalogo_publicar=()=>++attempt===1?Promise.reject(new Error('Network lost')):{data:{id:70,repetida:true},error:null};
 rpcHandlers.vega_catalogo_pagina=()=>({data:{version:2,items:[],total:0,drafts:[],draft_total:0},error:null});
 await assert.rejects(w.guardarServicio(),/Network lost/);
 await w.guardarServicio();
 assert.equal(calls.filter(c=>c.rpc==='vega_catalogo_borrador').length,1);
 const publications=calls.filter(c=>c.rpc==='vega_catalogo_publicar');
 assert.equal(publications.length,2);assert.equal(publications[0].args.p_id,publications[1].args.p_id);
});
