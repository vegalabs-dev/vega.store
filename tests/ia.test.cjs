const {test}=require('node:test');
const assert=require('node:assert/strict');
test('AI endpoint validates the owner, keeps contacts private and handles absent credentials',async t=>{
 const priorFetch=global.fetch;let handler,calls=[];const vars={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_ANON_KEY:'public-fixture'};
 global.Deno={env:{get:k=>vars[k]},serve:fn=>{handler=fn;}};
 await import('../supabase/functions/vega-redactar/index.ts');
 t.after(()=>{global.fetch=priorFetch;delete global.Deno;});
 let owner=true,authorized=true;
 global.fetch=async(url,options={})=>{
  calls.push({url:String(url),options});
  if(String(url).endsWith('/auth/v1/user'))return Response.json({id:'fixture-owner'},{status:authorized?200:401});
  if(String(url).endsWith('/is_vega_admin'))return Response.json(owner);
  if(String(url).includes('/usuarios_canva?'))return Response.json([{servicio:'Canva Pro'}]);
  if(String(url).endsWith('/vega_reservar_ia'))return Response.json(null);
  if(String(url).includes('generativelanguage'))return Response.json({candidates:[{content:{parts:[{text:'Tenemos una actualización sobre tu servicio. Consulta los detalles a continuación.'}]}}]});
  throw new Error('Unexpected request');
 };
 const request=body=>new Request('https://fixture/vega-redactar',{method:'POST',headers:{authorization:'Bearer fixture-token',origin:'https://vegalabs-dev.github.io'},body:JSON.stringify(body)});
 assert.equal((await handler(new Request('https://fixture/vega-redactar',{method:'POST'}))).status,401);
 owner=false;assert.equal((await handler(request({action:'estado'}))).status,403);owner=true;
 authorized=false;assert.equal((await handler(request({action:'estado'}))).status,401);authorized=true;
 assert.deepEqual(await (await handler(request({action:'estado'}))).json(),{enabled:false});
 assert.equal((await handler(request({pedido_id:1,tipo:'ampliacion'}))).status,503);
 assert.equal(calls.some(c=>c.url.includes('generativelanguage')),false);
 vars.GEMINI_API_KEY='synthetic-test-only';
 const response=await handler(request({pedido_id:1,tipo:'ampliacion',telefono:'DO NOT SEND',codigo_privado:'DO NOT SEND'}));assert.equal(response.status,200);
 const upstream=calls.find(c=>c.url.includes('generativelanguage'));assert.ok(upstream);assert.doesNotMatch(upstream.options.body,/DO NOT SEND|codigo_privado|telefono|fixture-token/);
 assert.equal((await handler(request({pedido_id:1,tipo:'invented'}))).status,400);
});
