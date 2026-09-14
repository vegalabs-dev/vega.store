async function cargarHistorialPedido(id,container,client=supabaseClient){
    VegaUI.loading(container,2);
    try{
        const {data,error}=await client.from('vega_movimientos').select('id,pedido_id,tipo,cantidad,unidad,modo,fecha_anterior,fecha_nueva,creado_en').eq('pedido_id',Number(id)).order('creado_en',{ascending:false}).limit(100);
        if(error)throw error;
        container.replaceChildren();container.removeAttribute('aria-busy');
        const names={registro_anterior:'Vigencia anterior al historial',alta:'Servicio registrado',regalo:'Regalo',renovacion:'Renovación',correccion:'Corrección de plazo',archivo:'Archivado',restauracion:'Restaurado',activacion:'Activado',ajuste:'Ajuste de vencimiento',cambio_servicio:'Cambio de servicio',actualizacion:'Datos actualizados'};
        for(const m of data||[]){const row=document.createElement('div');row.className='history-row';
            const title=document.createElement('strong');title.textContent=(names[m.tipo]||'Actualización')+(m.cantidad?' · '+(m.modo==='sumar'?'+':'')+VegaDates.amount(m.cantidad,m.unidad):'');
            const line=document.createElement('small');line.textContent=m.tipo==='registro_anterior'?'Se conservó la vigencia existente; las ampliaciones anteriores no tienen detalle.':new Date(m.creado_en).toLocaleString('es-PE',{timeZone:'America/Lima'});
            row.append(title,line);if(m.fecha_nueva){const date=document.createElement('small');date.textContent='Hasta '+VegaDates.format(m.fecha_nueva);row.append(date);}container.append(row);
        }if(!data?.length)container.textContent='Todavía no hay movimientos.';
    }catch(e){VegaUI.error(container,'No pudimos cargar el historial.',()=>cargarHistorialPedido(id,container,client));}
}
