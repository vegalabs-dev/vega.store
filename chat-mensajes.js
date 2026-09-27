/* Drafting assistant: temporary conversation, explicit persistent style, manual sending. */
(() => {
    'use strict';
    const el=id=>document.getElementById(id),editor=el('mensaje-texto'),log=el('ia-conversacion');
    let epoch=0,settingsEpoch=0,busy=false,enabled=false,history=[],lastInstruction='',styleVersion=null,saving=false,loadingStyle=false;
    const stickerNames={saludo:'un saludo 👋',gracias:'agradecimiento 🙌',recordatorio:'un recordatorio ⏰',celebracion:'una celebración 🎉'};
    function active(rev,context){return adminAuthorized&&rev===epoch&&mensajeActual===context;}
    function settingsActive(rev,context){return adminAuthorized&&rev===settingsEpoch&&mensajeActual===context;}
    function controls(){el('ia-enviar').disabled=busy||!enabled;el('ia-enviar').textContent=busy?'Redactando…':'Pedir ajuste';el('ia-guardar-estilo').disabled=saving||styleVersion===null;el('ia-recordar').disabled=saving||styleVersion===null;el('ia-estilo').disabled=saving||styleVersion===null;el('ia-recargar-estilo').disabled=saving||loadingStyle;}
    function bubble(text,role='model'){
        const row=document.createElement('div');row.className='ai-bubble '+role;
        const label=document.createElement('strong');label.textContent=role==='user'?'Tú':'Asistente';
        const p=document.createElement('p');p.textContent=text;row.append(label,p);log.append(row);
        while(log.children.length>12)log.firstElementChild.remove();log.scrollTop=log.scrollHeight;return row;
    }
    function values(){
        const {ficha:f,pedido:p}=mensajeActual;
        return {ENLACE_PRIVADO:VegaSecurity.privateLink(f.codigo_privado),CLAVE_PRIVADA:f.codigo_privado,CLIENTE:f.nombre||'',SERVICIO:p.servicio||'',FECHA:p.fecha_fin?VegaDates.format(p.fecha_fin):'',FECHA_ISO:p.fecha_fin||'',CAMBIO:p.ultima_ampliacion||'',DURACION:VegaDates.label(p),CORREO:p.correo||'',TELEFONO:f.telefono||p.telefono||'',USUARIO:f.whatsapp_usuario||'',TOKEN:p.token||'',OPERACION:p.num_operacion||''};
    }
    function reset(){
        epoch++;busy=false;history=[];lastInstruction='';log.replaceChildren();log.removeAttribute('aria-busy');el('ia-instruccion').value='';
        bubble('Dime cómo quieres ajustar el mensaje. Por ejemplo: «Hazlo breve, amable y resalta el vencimiento».');controls();
    }
    async function loadStyle(){
        const rev=settingsEpoch,context=mensajeActual;
        styleVersion=null;loadingStyle=true;controls();el('ia-estilo-estado').textContent='Cargando preferencias…';
        try{
            const {data,error}=await VegaUI.read(supabaseClient.rpc('vega_estilo_mensajes'));
            if(!settingsActive(rev,context))return;
            if(error||!data||typeof data.estilo!=='string'||!Number.isSafeInteger(data.version))throw new Error('No se pudo cargar tu estilo. Pulsa Recargar para reintentar.');
            styleVersion=data.version;el('ia-estilo').value=data.estilo;el('ia-estilo-estado').textContent=data.estilo?'Este estilo se usará en futuros mensajes.':'Aún no tienes preferencias guardadas.';
            VegaUI.cleanField(el('modal-mensajes'),el('ia-estilo'));
        }catch(error){if(settingsActive(rev,context))el('ia-estilo-estado').textContent=error.message;}
        finally{if(settingsActive(rev,context)){loadingStyle=false;controls();}}
    }
    async function open(){
        const rev=++settingsEpoch,context=mensajeActual;enabled=false;controls();el('mensaje-ia-estado').textContent='Comprobando IA…';
        loadStyle();
        try{
            const {data,error}=await supabaseClient.functions.invoke('vega-redactar',{body:{action:'estado'}});
            if(!settingsActive(rev,context))return;
            if(error)throw error;
            enabled=data?.enabled===true;
            el('mensaje-ia-estado').textContent=enabled?'Ajusta el texto y revisa la propuesta antes de usarla.':'Falta activar Gemini. Puedes editar el mensaje y guardar tu estilo.';
        }catch{if(settingsActive(rev,context))el('mensaje-ia-estado').textContent='No se pudo conectar con la IA. Puedes editar el mensaje y volver a abrir esta ventana.';}
        finally{if(settingsActive(rev,context)){controls();el('ia-configuracion').hidden=enabled;}}
    }
    async function saveStyle(text){
        if(saving||styleVersion===null||!adminAuthorized)return;
        if(text.length>2000)throw new Error('Guarda un estilo de hasta 2000 caracteres.');
        if(VegaMessage.privateData(text)||/\[\[/.test(VegaMessage.protect(text,values())))throw new Error('Guarda indicaciones de estilo, sin datos del cliente, claves o enlaces.');
        const rev=settingsEpoch,context=mensajeActual;saving=true;controls();
        try{
            const {data,error}=await supabaseClient.rpc('vega_estilo_mensajes',{p_estilo:text,p_version:styleVersion});
            if(!settingsActive(rev,context))return;
            if(error)throw new Error(error.code==='40001'?'El estilo cambió en otra ventana. Copia tus cambios y pulsa Recargar antes de guardar.':'No se guardaron las preferencias. Reintenta.');
            if(!data||typeof data.estilo!=='string'||!Number.isSafeInteger(data.version))throw new Error('No se pudo confirmar el guardado. Pulsa Recargar.');
            styleVersion=data.version;el('ia-estilo').value=data.estilo;el('ia-estilo-estado').textContent=data.estilo?'Preferencias guardadas para futuros mensajes.':'Preferencias borradas.';
            VegaUI.cleanField(el('modal-mensajes'),el('ia-estilo'));
        }finally{saving=false;controls();}
    }
    async function send(event){
        event.preventDefault();if(busy||!enabled||!mensajeActual||!adminAuthorized)return;
        const instruction=el('ia-instruccion').value.trim();if(!instruction)return;
        const context=mensajeActual,rev=epoch,original=editor.value,map=values();
        const solicitud=VegaMessage.protect(instruction,map),borrador=VegaMessage.protect(original,map);
        if(instruction.length>800||original.length>4000||VegaMessage.privateData(solicitud)||VegaMessage.privateData(borrador)){VegaUI.toast('Acorta el mensaje o retira datos personales y enlaces adicionales de la solicitud.','error');return;}
        busy=true;controls();log.setAttribute('aria-busy','true');
        log.querySelectorAll('[data-apply]').forEach(b=>b.disabled=true);bubble(instruction,'user');lastInstruction=instruction;
        try{
            const {data,error}=await supabaseClient.functions.invoke('vega-redactar',{body:{action:'chat',pedido_id:Number(context.pedido.id),tipo:el('mensaje-atajo').value,solicitud,borrador,historial:history.slice(-6)}});
            if(!active(rev,context))return;
            let message=data?.error;
            if(error?.context?.json){try{message=(await error.context.json()).error;}catch{/* provider error body is optional */}}
            if(error||!data?.mensaje)throw new Error(message||'No se pudo redactar. Tu mensaje se conserva; puedes reintentar.');
            const resolved=VegaMessage.restore(data.mensaje,map);
            if(/\[\[/.test(resolved))throw new Error('La propuesta contiene datos incompletos. Tu mensaje se conserva.');
            history=[...history,{role:'user',text:solicitud},{role:'model',text:data.mensaje}].slice(-6);
            if(el('ia-instruccion').value.trim()===instruction)el('ia-instruccion').value='';
            const row=bubble(data.respuesta||'Revisa esta propuesta.');
            const preview=document.createElement('div');preview.className='wa-preview ai-proposal';preview.innerHTML=VegaMessage.preview(resolved);row.append(preview);
            if(stickerNames[data.sticker]){const tip=document.createElement('p');tip.className='sticker-tip';tip.textContent='Sticker sugerido: '+stickerNames[data.sticker]+'. Elígelo dentro de WhatsApp después de enviar el texto.';row.append(tip);}
            const apply=document.createElement('button');apply.type='button';apply.className='btn-gestionar';apply.textContent='Usar este mensaje';apply.dataset.apply='true';
            apply.onclick=()=>{
                if(!active(rev,context))return;
                if(editor.value!==original){VegaUI.toast('Editaste el mensaje. Pide otro ajuste para conservar tus cambios.','error');return;}
                editor.value=resolved;actualizarDestinosMensaje();apply.disabled=true;apply.textContent='Aplicado';
            };
            row.append(apply);log.scrollTop=log.scrollHeight;
        }catch(error){if(active(rev,context))bubble(error.message);}
        finally{if(active(rev,context)){busy=false;controls();log.removeAttribute('aria-busy');}}
    }
    el('ia-formulario').addEventListener('submit',send);
    el('ia-guardar-estilo').onclick=()=>saveStyle(el('ia-estilo').value.trim()).catch(e=>VegaUI.toast(e.message,'error'));
    el('ia-recordar').onclick=()=>{
        const text=(el('ia-instruccion').value.trim()||lastInstruction).trim();if(!text){VegaUI.toast('Escribe primero la indicación que quieres recordar.');return;}
        const prior=el('ia-estilo').value.trim(),next=prior?prior+'\n'+text:text;
        saveStyle(next).catch(e=>VegaUI.toast(e.message,'error'));
    };
    el('ia-recargar-estilo').onclick=()=>loadStyle();
    el('ia-nueva-conversacion').onclick=()=>reset();
    document.querySelectorAll('[data-ia-prompt]').forEach(button=>button.onclick=()=>{el('ia-instruccion').value=button.dataset.iaPrompt;el('ia-instruccion').focus();});
    document.querySelectorAll('[data-wa-format]').forEach(button=>button.onclick=()=>{
        const start=editor.selectionStart,end=editor.selectionEnd,selected=editor.value.slice(start,end)||'texto',format=button.dataset.waFormat;
        const result=format==='quote'?selected.split('\n').map(line=>'> '+line).join('\n'):format+selected+format;
        editor.setRangeText(result,start,end,'select');editor.focus();actualizarDestinosMensaje();
    });
    const updatePreview=()=>{el('mensaje-vista-previa').innerHTML=VegaMessage.preview(editor.value);};
    editor.addEventListener('input',updatePreview);
    window.addEventListener('vega:logout',()=>{settingsEpoch++;reset();enabled=false;styleVersion=null;el('ia-estilo').value='';el('ia-estilo-estado').textContent='';el('mensaje-vista-previa').replaceChildren();log.replaceChildren();controls();});
    new MutationObserver(()=>{if(el('modal-mensajes').style.display==='none'){settingsEpoch++;reset();log.replaceChildren();el('mensaje-vista-previa').replaceChildren();}}).observe(el('modal-mensajes'),{attributes:true,attributeFilter:['style']});
    window.VegaChat={open,reset,updatePreview};
})();
