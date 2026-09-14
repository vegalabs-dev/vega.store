/* Calendar dates use the store's Peru time zone, independent of the device. */
(() => {
    'use strict';
    const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const valid = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s+'T12:00:00Z'));
    const iso = d => d.toISOString().slice(0,10);
    function add(s,n,u) {
        if (!valid(s) || !Number.isInteger(n) || n < 0 || !['dias','meses','años'].includes(u)) throw new Error('Revisa la duración.');
        const d = new Date(s+'T12:00:00Z');
        if (u === 'dias') d.setUTCDate(d.getUTCDate()+n);
        else {
            const day = d.getUTCDate(); d.setUTCDate(1);
            d.setUTCMonth(d.getUTCMonth()+n*(u==='años'?12:1));
            const last = new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
            d.setUTCDate(Math.min(day,last));
        }
        return iso(d);
    }
    const format = s => valid(s) ? new Intl.DateTimeFormat('es-PE',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(s+'T12:00:00Z')) : 'Sin fecha registrada';
    const amount = (n,u) => `${n} ${n===1 ? ({dias:'día',meses:'mes',años:'año'}[u]||u) : (u==='dias'?'días':u)}`;
    function duration(start,end) {
        if (!valid(start) || !valid(end) || end < start) return '';
        let months = (Number(end.slice(0,4))-Number(start.slice(0,4)))*12+Number(end.slice(5,7))-Number(start.slice(5,7));
        if (add(start,months,'meses')>end) months--;
        const days = Math.round((Date.parse(end)-Date.parse(add(start,months,'meses')))/86400000);
        return [months>=12 ? amount(Math.floor(months/12),'años') : '', months%12 ? amount(months%12,'meses') : '', days ? amount(days,'dias') : ''].filter(Boolean).join(' + ') || 'Hasta hoy';
    }
    const permanent = p => Number(p.meses)===0 && p.meses != null && !p.fecha_fin;
    function status(p) {
        if (p.estado !== 'Activo') return p.estado === 'Cancelado' ? 'Archivado' : p.estado || 'Pendiente';
        if (permanent(p)) return 'Activo';
        if (!valid(p.fecha_fin)) return 'Revisar fecha';
        return p.fecha_fin < today() ? 'Vencido' : 'Activo';
    }
    const label = p => permanent(p) ? 'Permanente' : duration(p.vigencia_inicio || p.fecha_inicio,p.fecha_fin) || (p.estado==='Pendiente' ? amount(Number(p.meses)||1,p.unidad||'meses') : 'Vigencia actualizada');
    window.VegaDates = Object.freeze({today,valid,add,format,amount,duration,status,permanent,label});
})();
