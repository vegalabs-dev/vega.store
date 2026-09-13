// 1. INICIALIZAR SUPABASE
let catalogoGlobal = [];
const supabaseUrl = 'https://rhuhuvevynovfekwhlhb.supabase.co';
const supabaseKey = 'sb_publishable_-8XCScnvNf6QXMsnbyJK9Q_XhrOr9j5';
const h = VegaSecurity.escapeHtml;
const guestAuth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'vega_guest_v1' };
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey, { auth: guestAuth });
let accessCode = VegaSecurity.loadCode();
let pendingPurchase = null;
let privateClient = null;
let privateClientCode = null;
function clientForAccess() {
    if (!VegaSecurity.validCode(accessCode)) throw new Error('Abre tu enlace privado para consultar los servicios.');
    if (privateClientCode !== accessCode) {
        privateClient = window.supabase.createClient(supabaseUrl, supabaseKey, {
            auth: guestAuth, global: { headers: { 'x-vega-access': accessCode } }
        });
        privateClientCode = accessCode;
    }
    return privateClient;
}
function ensureAccessCode() {
    if (!VegaSecurity.validCode(accessCode)) accessCode = VegaSecurity.saveCode(VegaSecurity.newCode());
    return accessCode;
}
window.addEventListener('unhandledrejection', event => {
    event.preventDefault(); alert(event.reason?.message || 'No se pudo completar la operación. Inténtalo nuevamente.');
});

let productoSeleccionado = { nombre: '', precio: 0, cantidad: 1, unidad: 'meses', tipo_ingreso: 'numero' };
const numeroWhatsApp = "51928293163";

// SISTEMA DE SESIÓN Y GEO
let userPhone = localStorage.getItem('vega_user_phone') || null;
let userUsername = localStorage.getItem('vega_user_username') || null;
let userName = localStorage.getItem('vega_user_name') || null;
let paisCliente = 'PE';

const modalCompra = document.getElementById('modal-compra');
const inputDatoCompra = document.getElementById('correo-compra');
const alertaDato = document.getElementById('alerta-correo');

const inputTel = document.querySelector("#login-telefono");
const iti = window.intlTelInput(inputTel, {
    initialCountry: "pe",
    preferredCountries: ["pe", "mx", "co", "ar", "es", "us"],
    utilsScript: "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/utils.js",
});

// =====================================
// INICIO Y GEO
// =====================================
document.addEventListener('DOMContentLoaded', async () => {
    actualizarBotonHeader();
    try {
        const respuesta = await fetch('https://ipapi.co/json/');
        const datos = await respuesta.json();
        if (datos.country_code) {
            paisCliente = datos.country_code;
            iti.setCountry(paisCliente.toLowerCase());
        }
    } catch (e) { console.log("No se pudo detectar IP, usando defecto."); }

    cargarCatalogo();
    if (accessCode) abrirMiCuenta();
});

function actualizarBotonHeader() {
    const btn = document.getElementById('btn-header-cuenta');
    btn.innerText = '👤 Mis servicios';
}
function abrirMiCuenta() {
    if (!accessCode) {
        document.getElementById('modal-acceso-privado').classList.remove('oculto'); return;
    }
    document.getElementById('panel-telefono-txt').innerText = 'Consulta mediante enlace privado';
    document.getElementById('mi-enlace-privado').value = VegaSecurity.privateLink(accessCode);
    document.getElementById('modal-panel-cliente').classList.remove('oculto');
    cargarMisServicios();
}
function cambiarTipoContacto() {
    const username = document.getElementById('login-tipo-contacto').value === 'usuario';
    document.getElementById('login-campo-telefono').hidden = username;
    document.getElementById('login-campo-usuario').hidden = !username;
}
async function procesarLogin() {
    const byUsername = document.getElementById('login-tipo-contacto').value === 'usuario';
    let nextPhone = null, nextUsername = null;
    if (byUsername) {
        nextUsername = VegaSecurity.username(document.getElementById('login-usuario').value);
        if (!nextUsername) throw new Error('Indica tu usuario de WhatsApp.');
    } else {
        if (!iti.isValidNumber()) return alert('Ingresa un número de WhatsApp válido para este país.');
        nextPhone = iti.getNumber();
    }
    userPhone = nextPhone; userUsername = nextUsername;
    userName = document.getElementById('login-nombre').value.trim() || null;
    for (const [key,value] of [['vega_user_phone',userPhone],['vega_user_username',userUsername],['vega_user_name',userName]]) {
        if (value) localStorage.setItem(key,value); else localStorage.removeItem(key);
    }
    document.getElementById('modal-login').classList.add('oculto');
    const plan = pendingPurchase; pendingPurchase = null;
    if (plan) await prepararCompra(plan);
}
function usarEnlacePrivado() {
    const value = document.getElementById('enlace-privado-input').value.trim();
    let code = value;
    try { code = new URLSearchParams(new URL(value).hash.slice(1)).get('acceso'); } catch { /* Also accept a raw code. */ }
    if (!VegaSecurity.validCode(code)) return alert('Pega el enlace privado completo que recibiste de VegaStore.');
    accessCode = VegaSecurity.saveCode(code);
    document.getElementById('modal-acceso-privado').classList.add('oculto');
    document.getElementById('enlace-privado-input').value = '';
    abrirMiCuenta();
}
async function copiarMiEnlace() {
    await navigator.clipboard.writeText(VegaSecurity.privateLink(accessCode));
    document.getElementById('estado-copia-enlace').textContent = 'Enlace copiado. Guárdalo en un lugar privado.';
}
function cerrarSesionCliente() {
    VegaSecurity.forgetCode(); accessCode = null; privateClient = null; privateClientCode = null;
    for (const key of ['vega_user_phone','vega_user_username','vega_user_name']) localStorage.removeItem(key);
    userPhone = null; userUsername = null; userName = null;
    document.getElementById('modal-panel-cliente').classList.add('oculto');
    document.getElementById('lista-mis-servicios').textContent = '';
    document.getElementById('lista-promociones').textContent = '';
    document.getElementById('mi-enlace-privado').value = '';
    const payLink = document.getElementById('pagar-pedido-link'); payLink.hidden = true; payLink.removeAttribute('href');
    actualizarBotonHeader();
}

// =====================================
// PANEL DEL CLIENTE
// =====================================
window.switchPanelTab = function(tab) {
    document.querySelectorAll('.panel-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.panel-tab-content').forEach(content => content.style.display = 'none');
    document.getElementById(`btn-tab-${tab}`).classList.add('active');
    document.getElementById(`panel-tab-${tab}`).style.display = 'block';
    if(tab === 'servicios') cargarMisServicios();
    if(tab === 'promos') cargarPromociones();
}

async function cargarMisServicios() {
    const contenedor = document.getElementById('lista-mis-servicios');
    contenedor.innerHTML = '<p style="text-align: center; color: #6b7280;">Buscando tus servicios...</p>';
    const { data, error } = await clientForAccess().from('usuarios_canva').select('id,servicio,estado,fecha_inicio,fecha_fin,creado_en,meses,unidad').order('creado_en', { ascending: false });

    if (error) { contenedor.textContent = 'No se pudieron consultar los servicios. Inténtalo nuevamente o contacta a soporte.'; return; }
    if (!data || data.length === 0) { contenedor.innerHTML = '<p style="text-align: center; color: #6b7280;">Este enlace no tiene servicios disponibles. Si ya compraste, pide tu enlace privado por WhatsApp.</p>'; return; }

    contenedor.innerHTML = '';
    data.forEach(item => {
        let estadoBadge = item.estado === 'Activo' ? '<span style="background:#D1FAE5; color:#059669; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:bold;">✔️ Activo</span>' : '<span style="background:#FEF3C7; color:#D97706; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:bold;">⏳ Pendiente</span>';
        let infoTiempo = '';

        if (item.estado === 'Activo') {
            if (item.meses == 0 || !item.fecha_fin) { infoTiempo = '<span style="color:var(--primary); font-weight:bold; font-size:13px;">Acceso Permanente</span>'; }
            else {
                let hoy = new Date(); let fin = new Date(item.fecha_fin);
                let dias = Math.ceil((fin.getTime() - hoy.getTime()) / (1000 * 3600 * 24));
                if (dias > 0) infoTiempo = `<span style="color:#10B981; font-weight:bold; font-size:13px;">Quedan ${dias} días</span>`;
                else infoTiempo = `<span style="color:#DC2626; font-weight:bold; font-size:13px;">Vencido</span>`;
            }
        }
        contenedor.innerHTML += `<div class="item-servicio-cliente"><div><h4 style="margin: 0 0 5px 0; font-size: 15px;">${h(item.servicio)}</h4><p style="margin: 0; font-size: 12px; color: #6B7280;">Contratado: ${new Date(item.creado_en).toLocaleDateString()}</p></div><div style="text-align: right;">${estadoBadge}<br><div style="margin-top: 5px;">${infoTiempo}</div></div></div>`;
    });
}

async function cargarPromociones() {
    const contenedor = document.getElementById('lista-promociones');
    contenedor.innerHTML = '<p style="text-align: center; color: #6b7280;">Buscando promociones...</p>';
    const { data: compras } = await clientForAccess().from('usuarios_canva').select('id').eq('estado', 'Activo');
    let tieneCompras = compras && compras.length > 0;
    const { data, error } = await supabaseClient.from('promociones').select('*').eq('activo', true);
    if (error || !data || data.length === 0) { contenedor.innerHTML = '<p style="text-align: center; color: #6b7280;">No hay promociones disponibles.</p>'; return; }

    contenedor.innerHTML = '';
    data.forEach(promo => {
        let bloqueado = promo.requisito_compra && !tieneCompras;
        let btnHtml = bloqueado ? `<button style="background:#D1D5DB; color:white; border:none; padding:8px 12px; border-radius:8px; font-size:12px; font-weight:bold; cursor:not-allowed;">Requiere compra previa</button>` : `<a href="https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent("Hola, quiero reclamar la promoción: " + promo.titulo + " por S/ " + promo.precio_promo)}" target="_blank" rel="noopener noreferrer" style="background:var(--primary); color:white; text-decoration:none; padding:8px 12px; border-radius:8px; font-size:12px; font-weight:bold; display:inline-block;">Reclamar Promo</a>`;
        contenedor.innerHTML += `<div class="item-promo"><h4 style="margin: 0 0 5px 0; font-size: 16px; color:#92400E;">🎁 ${h(promo.titulo)}</h4><p style="margin: 0 0 10px 0; font-size: 13px; color: #B45309;">${h(promo.descripcion)}</p><div style="display: flex; justify-content: space-between; align-items: center;"><span style="font-size: 18px; font-weight: 900; color: #B45309;">S/ ${h(promo.precio_promo)}</span>${btnHtml}</div></div>`;
    });
}

// =====================================
// CARGAR CATÁLOGO Y RENDERIZAR
// =====================================
async function cargarCatalogo() {
    const { data: servicios } = await supabaseClient.from('servicios').select('*').order('id', { ascending: true });

    catalogoGlobal = (servicios || []).filter(s => {
        if (!s.geo_tipo || s.geo_tipo === 'todos') return true;
        let listaPaises = s.geo_paises ? s.geo_paises.split(',').map(p => p.trim().toUpperCase()) : [];
        if (s.geo_tipo === 'solo') return listaPaises.includes(paisCliente);
        if (s.geo_tipo === 'excepto') return !listaPaises.includes(paisCliente);
        return true;
    });

    generarBotonesCategorias(catalogoGlobal);
    renderizarCatalogo(catalogoGlobal);
}

function formatTiempo(c, u) {
    if (c == 0) return "Pago Único";
    let uni = u || 'meses';
    if (c == 1) { if(uni==='meses') uni='Mes'; if(uni==='dias') uni='Día'; if(uni==='años') uni='Año'; }
    else { if(uni==='meses') uni='Meses'; if(uni==='dias') uni='Días'; if(uni==='años') uni='Años'; }
    return `${c} ${uni}`;
}

function generarBotonesCategorias(servicios) {
    const contenedorFiltros = document.getElementById('filtros-categorias');
    if (!contenedorFiltros) return;
    const categoriasUnicas = [...new Set(servicios.map(s => s.categoria).filter(Boolean))];
    let html = `<button class="pill active" onclick="filtrarCategoria('Todos')">Todos</button>`;
    categoriasUnicas.forEach(cat => { html += `<button class="pill" data-category="${h(cat)}" onclick="filtrarCategoria(this.dataset.category)">${h(cat)}</button>`; });
    contenedorFiltros.innerHTML = html;
}

function renderizarCatalogo(serviciosParaMostrar) {
    const contenedor = document.getElementById('contenedor-servicios');
    contenedor.innerHTML = '';
    if (serviciosParaMostrar.length === 0) { contenedor.innerHTML = '<p style="text-align: center; grid-column: 1/-1;">No hay servicios disponibles en tu región.</p>'; return; }

    serviciosParaMostrar.forEach((servicio, indexServicio) => {
        let planes = servicio.planes || [{ cantidad: servicio.meses || 1, unidad: 'meses', precio: servicio.precio, promo: servicio.precio_promocional }];
        let planesOrdenados = [...planes].sort((a, b) => (a.promo ? parseFloat(a.promo) : parseFloat(a.precio)) - (b.promo ? parseFloat(b.promo) : parseFloat(b.precio)));

        const generarHtmlPrecioLimpio = (plan) => {
            let pNorm = parseFloat(plan.precio); let pOfe = plan.promo ? parseFloat(plan.promo) : null;
            if (pOfe && pOfe < pNorm) return `<div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;"><span style="font-size:26px; color:#10B981; font-weight:800; line-height:1;">S/ ${pOfe.toFixed(2)}</span><span style="font-size:14px; color:#9CA3AF; text-decoration:line-through;">S/ ${pNorm.toFixed(2)}</span></div>`;
            return `<div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;"><span style="font-size:26px; font-weight:800; color:var(--text-dark); line-height:1;">S/ ${pNorm.toFixed(2)}</span></div>`;
        };

        let pills = planesOrdenados.map((p, i) => {
            let t = p.cantidad == 0 ? 'Único' : formatTiempo(p.cantidad, p.unidad);
            let activeStyle = i === 0 ? 'background:#111827; color:white; border:1px solid #111827;' : 'background:#F9FAFB; color:#6B7280; border:1px solid #E5E7EB;';
            return `<button class="btn-plan-tarjeta" data-servicio="${indexServicio}" data-plan="${i}" style="padding:4px 10px; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer; transition:0.2s; ${activeStyle}">${h(t)}</button>`;
        }).join('');
        let htmlPlanesInteractivos = `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:15px;" id="contenedor-planes-${indexServicio}">${pills}</div>`;

        const serviceId = Number(servicio.id);
        const imgHtml = servicio.imagen_url ? `<img src="${h(VegaSecurity.imageUrl(servicio.imagen_url))}" class="card-img-top" onclick="abrirDetallesPorId(${serviceId})">` : `<div class="card-img-top" style="display:flex; align-items:center; justify-content:center; color:#64748b; font-size:12px;" onclick="abrirDetallesPorId(${serviceId})">Sin imagen</div>`;

        const card = document.createElement('div'); card.className = 'card';
        card.innerHTML = `
            ${imgHtml}
            ${servicio.etiqueta ? `<div class="badge" style="position:absolute; top:-15px; right:20px; background:var(--primary-gradient); color:white; padding:6px 16px; border-radius:20px; font-size:13px; font-weight:700;">${h(servicio.etiqueta)}</div>` : ''}
            <div style="font-size:12px; color:#6B7280; margin-bottom:5px; font-weight:bold; text-transform:uppercase;">${h(servicio.categoria || 'Servicio')}</div>
            <h2 style="font-size:18px; margin-bottom:12px; line-height:1.2;">${h(servicio.nombre)}</h2>
            ${htmlPlanesInteractivos}
            <div class="price" id="precio-tarjeta-${indexServicio}" style="margin-bottom:15px;">${generarHtmlPrecioLimpio(planesOrdenados[0])}</div>
            <div class="card-botones-mini" style="display:flex; gap:8px; margin-top:auto;">
                <button class="btn-detalles" style="flex:1; background:#F3F4F6; color:#4B5563; border:none; padding:10px 5px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:13px;" onclick="abrirDetallesPorId(${serviceId})">Detalles</button>
                <button class="btn-primary" id="btn-comprar-tarjeta-${indexServicio}" style="flex:1; padding:10px 5px; font-size:13px;">Comprar</button>
            </div>
        `;
        contenedor.appendChild(card);

        let btnComprar = card.querySelector(`#btn-comprar-tarjeta-${indexServicio}`);
        btnComprar.onclick = () => prepararCompra({ ...servicio, ...planesOrdenados[0], nombre: servicio.nombre, tipo_ingreso: servicio.tipo_ingreso });

        if (planesOrdenados.length > 1) {
            const btns = card.querySelectorAll(`.btn-plan-tarjeta`);
            btns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    btns.forEach(b => { b.style.background = '#F9FAFB'; b.style.color = '#6B7280'; b.style.border = '1px solid #E5E7EB'; });
                    e.target.style.background = '#111827'; e.target.style.color = 'white'; e.target.style.border = '1px solid #111827';
                    let planElegido = planesOrdenados[e.target.getAttribute('data-plan')];
                    document.getElementById(`precio-tarjeta-${indexServicio}`).innerHTML = generarHtmlPrecioLimpio(planElegido);
                    btnComprar.onclick = () => prepararCompra({ ...servicio, ...planElegido, nombre: servicio.nombre, tipo_ingreso: servicio.tipo_ingreso });
                });
            });
        }
    });
}

window.abrirDetallesPorId = function(id) {
    const service = catalogoGlobal.find(item => Number(item.id) === Number(id));
    if (service) abrirModalDetalles(service);
};
window.abrirModalDetalles = function(servicio) {
    const modal = document.getElementById('modal-detalles');
    let planes = servicio.planes || [{ cantidad: 1, unidad: 'meses', precio: servicio.precio, promo: servicio.precio_promocional }];
    planes = planes.map(p => ({ cantidad: p.cantidad !== undefined ? p.cantidad : (p.meses || 1), unidad: p.unidad || 'meses', precio: p.precio, promo: p.promo })).sort((a, b) => (a.promo ? parseFloat(a.promo) : parseFloat(a.precio)) - (b.promo ? parseFloat(b.promo) : parseFloat(b.precio)));

    const img = document.getElementById('detalles-imagen');
    if(servicio.imagen_url) { img.src = VegaSecurity.imageUrl(servicio.imagen_url); img.style.display = 'block'; } else { img.style.display = 'none'; }

    const badge = document.getElementById('detalles-badge');
    if(servicio.etiqueta) { badge.innerText = servicio.etiqueta; badge.style.display = 'inline-block'; badge.style.background = 'var(--primary-gradient)'; badge.style.color = 'white'; badge.style.padding = '6px 16px'; badge.style.borderRadius = '20px'; badge.style.fontSize = '13px'; badge.style.fontWeight = '700'; } else { badge.style.display = 'none'; }

    document.getElementById('detalles-titulo').innerText = servicio.nombre;

    const renderPrecioModal = (plan) => {
        let pNorm = parseFloat(plan.precio); let pOfe = plan.promo ? parseFloat(plan.promo) : null;
        let txtTiempo = plan.cantidad == 0 ? "Permanente" : formatTiempo(plan.cantidad, plan.unidad);
        if (pOfe && pOfe < pNorm) return `<div style="display:flex; align-items:center; justify-content:center; gap:10px; flex-wrap:wrap;"><span class="precio-tachado" style="text-decoration:line-through; color:#9CA3AF; font-size:16px;">S/ ${pNorm.toFixed(2)}</span> <span class="precio-oferta" style="color:#10B981; font-size:32px; font-weight:800;">S/ ${pOfe.toFixed(2)}</span></div><div style="font-size:14px; color:#6B7280; margin-top:5px;">por ${h(txtTiempo)}</div>`;
        return `<div style="display:flex; align-items:center; justify-content:center; gap:10px; flex-wrap:wrap;"><span style="font-size:32px; font-weight:800; color:var(--text-dark);">S/ ${pNorm.toFixed(2)}</span></div><div style="font-size:14px; color:#6B7280; margin-top:5px;">por ${h(txtTiempo)}</div>`;
    };

    const box = document.getElementById('detalles-precio-box');
    let htmlPlanes = `<div style="font-size:13px; color:var(--text-light); margin-bottom:10px; font-weight:bold;">Elige tu plan:</div><div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-bottom:20px;">`;
    planes.forEach((p, i) => {
        let active = i === 0 ? 'background:#111827; color:white;' : 'background:#F9FAFB; color:#6B7280; border:1px solid #E5E7EB;';
        htmlPlanes += `<button class="btn-plan-selector" data-index="${i}" style="padding:8px 16px; border-radius:20px; font-size:13px; font-weight:bold; cursor:pointer; transition:0.2s; ${active}">${h(formatTiempo(p.cantidad, p.unidad))}</button>`;
    });
    htmlPlanes += `</div>`;
    box.innerHTML = htmlPlanes + `<div id="precio-dinamico-modal">${renderPrecioModal(planes[0])}</div>`;

    const listaCaract = document.getElementById('detalles-caracteristicas');
    if(servicio.caracteristicas) listaCaract.innerHTML = servicio.caracteristicas.split('\n').map(c => `<li style="margin-bottom:10px; display:flex; gap:8px; color:var(--text-light);"><span style="color:#10B981;">✔️</span> <span style="text-align:left;">${h(c)}</span></li>`).join('');
    else listaCaract.innerHTML = '<li style="margin-bottom:10px; display:flex; gap:8px; color:var(--text-light);"><span style="color:#10B981;">✔️</span> Acceso garantizado y soporte.</li>';

    const updateComprarBtn = (plan) => {
        let pBuy = { nombre: servicio.nombre, precio: plan.promo ? parseFloat(plan.promo) : parseFloat(plan.precio), cantidad: plan.cantidad, unidad: plan.unidad, tipo_ingreso: servicio.tipo_ingreso || 'numero' };
        const button = document.createElement('button');
        button.className = 'btn-primary'; button.style.cssText = 'width:100%;padding:15px;font-size:16px;margin-top:10px;';
        button.textContent = 'Comprar ahora';
        button.onclick = () => { document.getElementById('modal-detalles').classList.add('oculto'); prepararCompra(pBuy); };
        document.getElementById('detalles-btn-comprar').replaceChildren(button);
    };
    updateComprarBtn(planes[0]);

    if (planes.length > 1) {
        const btns = box.querySelectorAll('.btn-plan-selector');
        btns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                btns.forEach(b => { b.style.background = '#F9FAFB'; b.style.color = '#6B7280'; b.style.border = '1px solid #E5E7EB'; });
                e.target.style.background = '#111827'; e.target.style.color = 'white'; e.target.style.border = 'none';
                let idx = e.target.getAttribute('data-index');
                document.getElementById('precio-dinamico-modal').innerHTML = renderPrecioModal(planes[idx]);
                updateComprarBtn(planes[idx]);
            });
        });
    }
    modal.classList.remove('oculto');
};

document.getElementById('cerrar-detalles').addEventListener('click', () => document.getElementById('modal-detalles').classList.add('oculto'));

// =====================================
// COMPRA DIRECTA (SIN MODAL DE YAPE)
// =====================================
window.prepararCompra = async function(plan) {
    if (!userPhone && !userUsername) {
        pendingPurchase = plan;
        document.getElementById('modal-login').classList.remove('oculto');
        return;
    }

    ensureAccessCode();
    const { data: pendientes } = await clientForAccess().from('usuarios_canva').select('id').eq('estado', 'Pendiente');
    if (pendientes && pendientes.length >= 3) {
        return alert("🛑 Tienes demasiadas solicitudes pendientes. Espera a que validemos tus pagos o contáctanos.");
    }

    // ARREGLO DEL PRECIO: Priorizamos el precio de promoción si existe
    let precioFinal = plan.promo ? parseFloat(plan.promo) : parseFloat(plan.precio);

    productoSeleccionado = {
        nombre: plan.nombre,
        precio: precioFinal,
        cantidad: plan.cantidad,
        unidad: plan.unidad,
        tipo_ingreso: plan.tipo_ingreso || 'numero'
    };

    document.getElementById('titulo-producto-modal').innerText = `Comprando: ${productoSeleccionado.nombre}`;

    if (productoSeleccionado.tipo_ingreso === 'numero') {
        inputDatoCompra.style.display = "none"; alertaDato.style.display = "none";
    } else {
        inputDatoCompra.style.display = "block"; inputDatoCompra.placeholder = "Escribe el correo a vincular"; inputDatoCompra.type = "email"; alertaDato.style.display = "none";
    }

    document.getElementById('modal-compra').classList.remove('oculto');
    inputDatoCompra.value = ""; inputDatoCompra.style.borderColor = "#E5E7EB";

    // Ocultar elementos viejos de Yape
    let pasoYape = document.getElementById('txt-paso-yape'); if(pasoYape && pasoYape.parentElement) pasoYape.parentElement.style.display = "none";
    let qrBox = document.querySelector('.qr-box'); if(qrBox) qrBox.style.display = "none";
    let yapeName = document.querySelector('.yape-name-box'); if(yapeName) yapeName.style.display = "none";
    let pasoYape2 = document.getElementById('txt-paso-yape-2'); if(pasoYape2 && pasoYape2.parentElement) pasoYape2.parentElement.style.display = "none";
    let otpInputs = document.getElementById('otp-inputs'); if(otpInputs) otpInputs.style.display = "none";
    let btnConfirmarYape = document.getElementById('btn-confirmar-yape'); if(btnConfirmarYape) btnConfirmarYape.style.display = "none";

    const btnFinal = document.getElementById('btn-otro-medio');
    btnFinal.innerText = `Generar Pedido y Pagar (S/ ${precioFinal.toFixed(2)})`;
    btnFinal.style.background = "var(--primary-gradient)";
    btnFinal.style.color = "white";
};

document.getElementById('btn-otro-medio').addEventListener('click', async () => {
    let datoCliente = null; // Texto por defecto para evitar errores en BD
    if (productoSeleccionado.tipo_ingreso === 'correo') {
        datoCliente = inputDatoCompra.value.trim();
        if(datoCliente === "" || !datoCliente.includes("@")) {
            inputDatoCompra.style.borderColor = "#DC2626"; alertaDato.style.display = "block"; return;
        }
    }

    const token = "TK-" + VegaSecurity.newCode().slice(0, 12).toUpperCase();
    const consulta_hash = await VegaSecurity.hashCode(ensureAccessCode());
    const btn = document.getElementById('btn-otro-medio'); btn.innerText = "Generando..."; btn.disabled = true;

    const { error } = await clientForAccess().from('usuarios_canva').insert([{
        telefono: userPhone, whatsapp_usuario: userUsername, nombre_cliente: userName, correo: datoCliente,
        servicio: productoSeleccionado.nombre, meses: productoSeleccionado.cantidad, unidad: productoSeleccionado.unidad,
        metodo_pago: 'WhatsApp', token: token, consulta_hash
    }]);

    if (error) {
        alert("Error al conectar con la base de datos: " + error.message);
        btn.innerText = `Generar Pedido y Pagar (S/ ${productoSeleccionado.precio.toFixed(2)})`; btn.disabled = false;
        return;
    }

    let txtTiempo = formatTiempo(productoSeleccionado.cantidad, productoSeleccionado.unidad);
    let tipoDatoMsg = (productoSeleccionado.tipo_ingreso === 'correo') ? `\n📧 *Correo a activar:* ${datoCliente}` : ``;

    const mensaje = `Hola, quiero adquirir *${productoSeleccionado.nombre} (${txtTiempo})* por S/${productoSeleccionado.precio.toFixed(2)}.${tipoDatoMsg}\n*Mi token es:* ${token}`;

    const privateUrl = VegaSecurity.privateLink(accessCode);
    const whatsappUrl = `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensaje + '\nMi enlace privado de consulta: ' + privateUrl)}`;
    const payLink = document.getElementById('pagar-pedido-link');
    payLink.href = whatsappUrl; payLink.hidden = false;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    abrirMiCuenta();
    document.getElementById('modal-compra').classList.add('oculto'); btn.disabled = false;
});

// =====================================
// FILTROS Y BÚSQUEDA
// =====================================
window.filtrarCategoria = function(cat) {
    document.querySelectorAll('.category-filters .pill').forEach(btn => { if(btn.innerText.trim() === cat) btn.classList.add('active'); else btn.classList.remove('active'); });
    if (cat === 'Todos') renderizarCatalogo(catalogoGlobal); else renderizarCatalogo(catalogoGlobal.filter(s => s.categoria && s.categoria.toLowerCase() === cat.toLowerCase()));
};

document.addEventListener('DOMContentLoaded', () => {
    const b = document.querySelector('input[placeholder="Buscar servicios..."]');
    if(b) b.addEventListener('input', (e) => { renderizarCatalogo(catalogoGlobal.filter(s => s.nombre.toLowerCase().includes(e.target.value.toLowerCase()))); document.querySelectorAll('.category-filters .pill').forEach(btn => btn.classList.remove('active')); });
});

document.getElementById('cerrar-compra').addEventListener('click', () => document.getElementById('modal-compra').classList.add('oculto'));
