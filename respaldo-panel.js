/* Owner-only UI. Passwords and decrypted files are kept in memory for one action. */
(() => {
    'use strict';
    const modal=document.getElementById('modal-respaldo'),result=document.getElementById('respaldo-resultado');
    let busy=false,revision=0;
    function clear(){
        revision++;
        modal.querySelectorAll('input').forEach(input=>input.value='');result.replaceChildren();VegaUI.clean(modal);
    }
    window.addEventListener('vega:logout',clear);
    new MutationObserver(()=>{if(modal.style.display==='none')clear();}).observe(modal,{attributes:true,attributeFilter:['style']});
    window.abrirRespaldo=()=>{if(!adminAuthorized)return;clear();abrirModal('modal-respaldo');};
    function show(summary,message){
        const heading=document.createElement('p');heading.textContent=message;
        const date=document.createElement('p');date.className='cliente-help';date.textContent='Fecha de la copia: '+new Date(summary.createdAt).toLocaleString('es-PE',{timeZone:'America/Lima'});
        const list=document.createElement('dl');list.className='backup-counts';
        for(const item of summary.counts){const term=document.createElement('dt'),count=document.createElement('dd');term.textContent=item.label;count.textContent=item.count;list.append(term,count);}
        result.replaceChildren(heading,date,list);
    }
    async function run(operation){
        if(busy||!adminAuthorized)return;
        busy=true;modal.dataset.busy='true';const current=revision;
        modal.querySelectorAll('input,button').forEach(button=>button.disabled=true);
        result.textContent='Procesando la copia de forma segura…';result.setAttribute('aria-busy','true');
        const active=()=>adminAuthorized&&current===revision;
        try{await operation(active);}
        catch(error){if(active())result.textContent=error.message||'No se pudo procesar la copia. Reintenta.';}
        finally{busy=false;delete modal.dataset.busy;result.removeAttribute('aria-busy');modal.querySelectorAll('input,button').forEach(button=>button.disabled=false);modal.querySelectorAll('input[type=password]').forEach(input=>input.value='');VegaUI.clean(modal);}
    }
    document.getElementById('respaldo-crear').onsubmit=event=>{
        event.preventDefault();
        let pass=document.getElementById('respaldo-clave').value;
        if(pass.length<12||pass.length>256){result.textContent='Usa una contraseña de entre 12 y 256 caracteres.';return;}
        if(pass!==document.getElementById('respaldo-repetir').value){result.textContent='Las contraseñas no coinciden.';return;}
        run(async active=>{
            let raw;
            try{
                const response=await VegaUI.read(supabaseClient.rpc('vega_exportar_datos'));
                if(response.error)throw new Error('No se pudo obtener la copia completa. Recarga el panel e inténtalo de nuevo.');
                if(!active())return;raw=response.data;
                const encrypted=await VegaBackup.encrypt(raw,pass);
                const checked=await VegaBackup.decrypt(encrypted,pass);
                if(checked.text!==raw)throw new Error('No se pudo comprobar la integridad de la copia.');
                if(!active())return;
                const url=URL.createObjectURL(new Blob([encrypted],{type:'application/octet-stream'}));
                const a=document.createElement('a');a.href=url;a.download='vega-datos-'+new Date(checked.summary.createdAt).toISOString().replace(/[:.]/g,'-')+'.vega';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
                show(checked.summary,'Descarga preparada. Guarda el archivo y compruébalo abajo.');
            }finally{pass='';raw=null;}
        });
    };
    document.getElementById('respaldo-comprobar').onsubmit=event=>{
        event.preventDefault();
        const file=document.getElementById('respaldo-archivo').files?.[0];let pass=document.getElementById('respaldo-clave-archivo').value;
        if(!file){result.textContent='Selecciona la copia guardada.';return;}
        if(file.size>VegaBackup.maxFileBytes){result.textContent='El archivo supera el máximo de 30 MB.';return;}
        run(async active=>{
            try{const checked=await VegaBackup.decrypt(await file.text(),pass);if(active())show(checked.summary,'Copia legible e íntegra. La comprobación no cambia los datos del panel.');}
            finally{pass='';document.getElementById('respaldo-archivo').value='';}
        });
    };
})();
