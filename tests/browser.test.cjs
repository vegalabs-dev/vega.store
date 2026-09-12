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
  const w = dom.window, calls = [], alerts = [], authCalls = [];
  Object.defineProperty(w,'crypto',{value:webcrypto}); w.TextEncoder = TextEncoder;
  w.alert=x=>alerts.push(x); w.confirm=()=>true; w.open=()=>null;
  w.fetch=async()=>({json:async()=>({country_code:'PE'})});
  w.navigator.clipboard={writeText:async()=>{}};
  w.intlTelInput=()=>({setCountry(){},isValidNumber:()=>true,getNumber:()=>'+51900000000'});
  const data = {servicios:[service],promociones:[],admin_accesos:[],usuarios_canva:[]};
  w.supabase={createClient:(url,key,options={})=>({
    auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{},getUser:async()=>({data:{user:{id:'fixture'}}}),
      signInWithPassword:async()=>({error:null}),signOut:async()=>{authCalls.push('signOut');}},
    rpc:async(name)=>{authCalls.push(name);return {data:allowed,error:null};},
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
  for (const file of ['security.js',kind==='admin'?'admin.js':'main.js'])
    vm.runInContext(readFileSync(file,'utf8'),dom.getInternalVMContext(),{filename:file});
  await tick();
  return {w,dom,calls,alerts,authCalls,data};
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
  assert.equal(calls.length,0);
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
  await w.prepararCompra({nombre:'Fixture service',precio:10,cantidad:1,unidad:'meses',tipo_ingreso:'correo'});
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
