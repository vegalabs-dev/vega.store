'use strict';
// Shared display rules; Supabase independently validates price and inventory.
window.VegaCatalog = Object.freeze({
    disponible(s) { return s.activo !== false && !s.agotado && (s.stock == null || Number(s.stock) > 0); },
    stockTexto(s) {
        if (s.activo === false) return 'Oculto';
        if (!this.disponible(s)) return 'Agotado';
        return s.stock == null ? 'Disponible' : `${s.stock} ${Number(s.stock) === 1 ? 'cupo disponible' : 'cupos disponibles'}`;
    },
    vigente(s, now = Date.now()) {
        return !s.promocion_inicio && !s.promocion_fin ||
            now >= Date.parse(s.promocion_inicio) && now < Date.parse(s.promocion_fin);
    },
    planes(s, now = Date.now()) {
        const source = Array.isArray(s.planes) && s.planes.length ? s.planes :
            [{cantidad:1, unidad:'meses', precio:s.precio, promo:s.precio_promocional}];
        return source.map(p => {
            const precio = Number(p.precio), promo = Number(p.promo);
            const descuento = this.vigente(s, now) && promo > 0 && promo < precio ? promo : null;
            return {...p, cantidad:Number(p.cantidad ?? p.meses ?? 1), unidad:p.unidad || 'meses',
                precio, promo:descuento, total:descuento ?? precio};
        }).sort((a,b) => a.total - b.total);
    },
    limitada(s, now = Date.now()) {
        return !!s.promocion_fin && this.disponible(s) && this.planes(s,now).some(p => p.promo != null);
    },
    fechaPeru(value) {
        return new Intl.DateTimeFormat('es-PE', {timeZone:'America/Lima',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
    },
    inputPeru(value) {
        return value ? new Date(Date.parse(value)-5*3600000).toISOString().slice(0,16) : '';
    },
    desdePeru(value) {
        if (!value) return null;
        const date = new Date(value+'-05:00');
        if (!Number.isFinite(date.getTime())) throw new Error('Revisa las fechas de la promoción.');
        return date.toISOString();
    },
    tiempoRestante(fin, now = Date.now()) {
        const minutes = Math.max(0, Math.ceil((Date.parse(fin)-now)/60000));
        if (!minutes) return 'Promoción finalizada';
        const days = Math.floor(minutes/1440), hours = Math.floor(minutes%1440/60), mins = minutes%60;
        return 'Termina en '+(days ? `${days} d ` : '')+(hours ? `${hours} h ` : '')+`${mins} min`;
    }
});
