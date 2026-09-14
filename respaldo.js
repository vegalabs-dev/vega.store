/* Portable encrypted management exports. No network, storage or database writes. */
(function(root,factory){
    const api=factory();
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.VegaBackup=api;
})(globalThis,function(){
    'use strict';
    const project='rhuhuvevynovfekwhlhb',format='vega-datos',version=1;
    const maxBytes=20*1024*1024,maxFileBytes=30*1024*1024,iterations=600000;
    const names=['servicios','vega_clientes','usuarios_canva','promociones','vega_movimientos','vega_avisos_manuales','vega_auditoria','admin_accesos'];
    const labels=['Productos','Clientes','Servicios contratados','Promociones','Movimientos','Avisos atendidos','Cambios del panel','Accesos'];
    const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
    const aad=encoder.encode('VegaStore management backup v1 / AES-256-GCM / PBKDF2-SHA256-600000');
    const fail=message=>{throw new Error(message);};
    function password(value){
        if(typeof value!=='string'||value.length<12||value.length>256)fail('Usa una contraseña de entre 12 y 256 caracteres.');
    }
    function parse(text){try{return JSON.parse(text);}catch{fail('El archivo no tiene un formato válido.');}}
    function inspect(text){
        if(typeof text!=='string'||encoder.encode(text).length>maxBytes)fail('La copia excede el tamaño admitido de 20 MB.');
        const data=parse(text);
        if(!data||data.format!==format||data.version!==version||data.project!==project||data.schema_version!=='20260913204706')fail('Esta copia no corresponde a esta versión de VegaStore.');
        if(!data.created_at||Number.isNaN(Date.parse(data.created_at))||!data.tables||Object.keys(data.tables).sort().join()!==[...names].sort().join())fail('La copia está incompleta.');
        const ids={};
        for(const name of names){
            const rows=data.tables[name];
            if(!Array.isArray(rows))fail('La copia está incompleta.');
            ids[name]=new Set();
            for(const row of rows){
                if(!row||typeof row!=='object'||Array.isArray(row))fail('Hay registros inválidos en la copia.');
                let id=row.id;
                if(name==='vega_avisos_manuales'){
                    if(!Number.isSafeInteger(row.pedido_id)||row.pedido_id<1||!/^\d{4}-\d{2}-\d{2}$/.test(row.fecha_fin)||row.tipo!=='vencimiento')fail('Hay avisos inválidos en la copia.');
                    id=[row.pedido_id,row.fecha_fin,row.tipo].join('|');
                }else if(name==='vega_clientes'){
                    if(typeof id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))fail('Hay fichas inválidas en la copia.');
                }else if(!Number.isSafeInteger(id)||id<1)fail('Hay identificadores inválidos en la copia.');
                if(ids[name].has(id))fail('La copia contiene registros repetidos.');
                ids[name].add(id);
            }
        }
        for(const row of data.tables.usuarios_canva){
            if(row.cliente_id!=null&&!ids.vega_clientes.has(row.cliente_id))fail('Falta una ficha de cliente en la copia.');
            if(row.servicio_id!=null&&!ids.servicios.has(row.servicio_id))fail('Falta un producto en la copia.');
        }
        for(const name of ['vega_movimientos','vega_avisos_manuales'])for(const row of data.tables[name]){
            if(!ids.usuarios_canva.has(row.pedido_id))fail('Falta un servicio contratado en la copia.');
        }
        return {createdAt:data.created_at,counts:names.map((name,i)=>({name,label:labels[i],count:data.tables[name].length}))};
    }
    function base64(bytes){
        let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
        return btoa(binary);
    }
    function bytes(text){
        if(typeof text!=='string'||text.length%4!==0||/[^A-Za-z0-9+/=]/.test(text))fail('El archivo cifrado no es válido.');
        try{return Uint8Array.from(atob(text),x=>x.charCodeAt(0));}catch{fail('El archivo cifrado no es válido.');}
    }
    async function key(pass,salt,usage){
        if(!globalThis.crypto?.subtle)fail('Este navegador no permite crear copias seguras. Abre el panel con HTTPS en un navegador actualizado.');
        const material=await crypto.subtle.importKey('raw',encoder.encode(pass),'PBKDF2',false,['deriveKey']);
        return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations},material,{name:'AES-GCM',length:256},false,[usage]);
    }
    async function encrypt(text,pass){
        password(pass);inspect(text);
        const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
        const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad,tagLength:128},await key(pass,salt,'encrypt'),encoder.encode(text));
        return JSON.stringify({format:'vega-cifrado',version,algorithm:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations,salt:base64(salt),iv:base64(iv),data:base64(new Uint8Array(cipher))});
    }
    async function decrypt(file,pass){
        password(pass);
        if(typeof file!=='string'||encoder.encode(file).length>maxFileBytes)fail('El archivo supera el máximo de 30 MB.');
        const envelope=parse(file);
        if(!envelope||envelope.format!=='vega-cifrado'||envelope.version!==version||envelope.algorithm!=='AES-256-GCM'||envelope.kdf!=='PBKDF2-SHA256'||envelope.iterations!==iterations)fail('No es una copia cifrada compatible de VegaStore.');
        const salt=bytes(envelope.salt),iv=bytes(envelope.iv),cipher=bytes(envelope.data);
        if(salt.length!==16||iv.length!==12||cipher.length<16||cipher.length>maxBytes+16)fail('El archivo cifrado está incompleto.');
        let plaintext;
        try{plaintext=decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad,tagLength:128},await key(pass,salt,'decrypt'),cipher));}
        catch{fail('Contraseña incorrecta o archivo dañado. No se modificó ningún dato.');}
        return {text:plaintext,summary:inspect(plaintext)};
    }
    return {encrypt,decrypt,inspect,maxFileBytes};
});
