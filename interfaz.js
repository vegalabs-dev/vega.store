(() => {
    'use strict';
    const region=document.createElement('div');region.className='toast-region';region.setAttribute('aria-live','polite');document.body.append(region);
    function toast(message,type='info') {
        const box=document.createElement('div');box.className='vega-toast '+type;
        const text=document.createElement('span');text.textContent=message;
        const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Cerrar aviso');close.onclick=()=>box.remove();
        box.append(text,close);region.append(box);setTimeout(()=>box.remove(),type==='error'?12000:6000);
    }
    let queue=Promise.resolve();
    function confirm(message,{title='Confirmar acción',accept='Confirmar',danger=false}={}) {
        const task=queue.then(()=>new Promise(resolve=>{
            const previous=document.activeElement,overlay=document.createElement('div');overlay.className='vega-confirm-overlay';
            overlay.innerHTML='<section class="vega-confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message"><h2 id="confirm-title"></h2><p id="confirm-message"></p><div class="confirm-actions"><button class="btn-gestionar" data-cancel>Seguir aquí</button><button class="btn-primary" data-accept></button></div></section>';
            overlay.querySelector('h2').textContent=title;overlay.querySelector('p').textContent=message;
            const yes=overlay.querySelector('[data-accept]'),no=overlay.querySelector('[data-cancel]');yes.textContent=accept;if(danger)yes.classList.add('danger');
            const finish=value=>{overlay.remove();document.removeEventListener('keydown',key,true);document.body.classList.remove('has-confirm');previous?.focus?.();resolve(value);};
            function key(e){if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish(false);}if(e.key==='Tab'){e.preventDefault();e.stopImmediatePropagation();(document.activeElement===no?yes:no).focus();}}
            yes.onclick=()=>finish(true);no.onclick=()=>finish(false);overlay.onclick=e=>{if(e.target===overlay)finish(false);};
            document.body.append(overlay);document.body.classList.add('has-confirm');document.addEventListener('keydown',key,true);no.focus();
        }));queue=task.catch(()=>{});return task;
    }
    function loading(container,count=3){container.innerHTML=Array.from({length:count},()=>'<div class="skeleton-card" aria-hidden="true"><i></i><i></i><i></i></div>').join('');container.setAttribute('aria-busy','true');}
    function error(container,message,retry){container.replaceChildren();container.removeAttribute('aria-busy');const p=document.createElement('p');p.className='empty-state';p.textContent=message;const b=document.createElement('button');b.className='btn-gestionar';b.textContent='Reintentar';b.onclick=retry;container.append(p,b);}
    async function read(request){
        let timer;const controller=new AbortController();
        if(request.abortSignal)request=request.abortSignal(controller.signal);
        try{return await Promise.race([Promise.resolve(request),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('La consulta tardó demasiado. Reintenta.'));},12000);})]);}
        finally{clearTimeout(timer);}
    }
    const snapshots=new WeakMap();
    const values=modal=>JSON.stringify([...modal.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(e=>!e.readOnly).map(e=>[e.id,e.type==='checkbox'?e.checked:e.value]));
    const clean=modal=>snapshots.set(modal,values(modal));
    async function canClose(modal){
        if(modal.dataset.busy==='true'){toast('Espera a que termine de guardarse.');return false;}
        if(snapshots.has(modal)&&snapshots.get(modal)!==values(modal))return window.VegaUI.confirm('Tienes cambios sin guardar en esta ventana.',{title:'¿Descartar cambios?',accept:'Descartar cambios',danger:true});
        return true;
    }
    window.VegaUI={toast,confirm,loading,error,read,clean,canClose};
    window.addEventListener('offline',()=>toast('Sin conexión. Espera a reconectar antes de guardar cambios.','error'));
})();
