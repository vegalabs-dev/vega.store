const {test}=require('node:test');
const assert=require('node:assert/strict');
const backup=require('../respaldo.js');
const fixture=()=>({format:'vega-datos',version:1,schema_version:'20260913204706',project:'rhuhuvevynovfekwhlhb',created_at:'2026-09-14T00:00:00Z',tables:{
    servicios:[{id:1,nombre:'Service fixture',stock:3,planes:[{precio:9.99}]}],
    vega_clientes:[{id:'00000000-0000-4000-8000-000000000001',nombre:'Private fixture',codigo_privado:'a'.repeat(48)}],
    usuarios_canva:[{id:5,cliente_id:'00000000-0000-4000-8000-000000000001',servicio_id:1,fecha_fin:'2028-02-29',ultima_ampliacion:'1 año'}],
    promociones:[],vega_movimientos:[{id:1,pedido_id:5}],vega_avisos_manuales:[],vega_auditoria:[],admin_accesos:[]
}});
test('encrypted export hides customer links and detects a wrong password or modified file',async()=>{
    const raw=JSON.stringify(fixture()),pass='Synthetic long password 123';
    const file=await backup.encrypt(raw,pass);
    assert.equal(file.includes('Private fixture'),false);assert.equal(file.includes('a'.repeat(48)),false);
    const recovered=await backup.decrypt(file,pass);assert.equal(recovered.text,raw);
    assert.equal(recovered.summary.counts.find(x=>x.name==='usuarios_canva').count,1);
    await assert.rejects(backup.decrypt(file,'A different long password'),/incorrecta|dañado/);
    const tampered=JSON.parse(file);tampered.data=(tampered.data[0]==='A'?'B':'A')+tampered.data.slice(1);
    await assert.rejects(backup.decrypt(JSON.stringify(tampered),pass),/incorrecta|dañado/);
    assert.notEqual(file,await backup.encrypt(raw,pass));
});
test('backup rejects missing relationships, incomplete tables, duplicate IDs and excessive work parameters',async()=>{
    const data=fixture();data.tables.vega_clientes=[];
    assert.throws(()=>backup.inspect(JSON.stringify(data)),/Falta una ficha/);
    const partial=fixture();delete partial.tables.admin_accesos;assert.throws(()=>backup.inspect(JSON.stringify(partial)),/incompleta/);
    const duplicate=fixture();duplicate.tables.servicios.push({...duplicate.tables.servicios[0]});assert.throws(()=>backup.inspect(JSON.stringify(duplicate)),/repetidos/);
    const other=fixture();other.project='other';assert.throws(()=>backup.inspect(JSON.stringify(other)),/versión/);
    await assert.rejects(backup.encrypt(JSON.stringify(fixture()),'short'),/12/);
    const file=JSON.parse(await backup.encrypt(JSON.stringify(fixture()),'Synthetic long password 123'));file.iterations=99999999999;
    await assert.rejects(backup.decrypt(JSON.stringify(file),'Synthetic long password 123'),/compatible/);
});
