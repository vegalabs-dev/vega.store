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
  const w = dom.window, calls = [], alerts = [], authCalls = [], rpcHandlers = {}, intervals = [];
  const originalInterval=w.setInterval.bind(w);w.setInterval=(fn,ms)=>{intervals.push({fn,ms});return originalInterval(fn,ms);};
  Object.defineProperty(w,'crypto',{value:webcrypto}); w.TextEncoder = TextEncoder;
  w.alert=x=>alerts.push(x); w.confirm=()=>true; w.open=()=>null;
  w.fetch=async()=>({json:async()=>({country_code:'PE'})});
  w.navigator.clipboard={writeText:async()=>{}};
  w.intlTelInput=()=>({setCountry(){},isValidNumber:()=>true,getNumber:()=>'+51900000000'});
  const data = {vega_clientes:[],servicios:[service],promociones:[],admin_accesos:[],usuarios_canva:[]};
  w.supabase={createClient:(url,key,options={})=>({
    auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{},getUser:async()=>({data:{user:{id:'fixture'}}}),
      signInWithPassword:async()=>({error:null}),signOut:async()=>{authCalls.push('signOut');}},
    rpc:async(name,args)=>{authCalls.push(name); calls.push({rpc:name,args}); return rpcHandlers[name] ? rpcHandlers[name](args) : {data:allowed,error:null};},
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
  for (const file of (kind==='admin' ? ['catalogo.js','security.js','clientes.js','admin.js','ventanas.js'] : ['catalogo.js','security.js','main.js','ventanas.js']))
    vm.runInContext(readFileSync(file,'utf8'),dom.getInternalVMContext(),{filename:file});
  await tick();
  return {w,dom,calls,alerts,authCalls,data,rpcHandlers,intervals};
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
  assert.equal(customerRead.columns,'id,servicio,estado,fecha_inicio,fecha_fin,creado_en,meses,unidad');
  assert.equal(customerRead.filters.some(f=>f[1]==='telefono'),false);
  w.cerrarSesionCliente();
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
  rpcHandlers.vega_registro_manual=async args=>{
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
  panel.click();assert.equal(panel.classList.contains('oculto'),true);assert.equal(w.VegaSecurity.loadCode(),code);
  w.abrirMiCuenta();await tick();w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(panel.classList.contains('oculto'),true);assert.equal(w.VegaSecurity.loadCode(),code);
  w.confirm=()=>false;w.cerrarSesionCliente();assert.equal(w.VegaSecurity.loadCode(),code);
  w.confirm=()=>true;w.cerrarSesionCliente();assert.equal(w.VegaSecurity.loadCode(),null);
  assert.ok(panel.querySelector('.customer-footer .logout-button'));assert.ok(panel.querySelector('button.cerrar-modal'));
});

test('admin logout requires confirmation and dismissing a window does not sign out',async t=>{
  const {w,dom,authCalls}=await page('admin');t.after(()=>dom.window.close());
  await w.mostrarPanel();w.confirm=()=>false;await w.cerrarSesion();assert.equal(authCalls.includes('signOut'),false);
  w.abrirModal('modal-servicio');await tick();w.document.getElementById('modal-servicio').click();
  assert.equal(w.document.getElementById('modal-servicio').classList.contains('show'),false);
  assert.equal(authCalls.includes('signOut'),false);
});
