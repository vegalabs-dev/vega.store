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
    event.preventDefault(); VegaUI.toast(event.reason?.message || 'No se pudo completar la operación. Inténtalo nuevamente.');
});

let productoSeleccionado = { nombre: '', precio: 0, cantidad: 1, unidad: 'meses', tipo_ingreso: 'numero' };
const numeroWhatsApp = "51928293163";

// SISTEMA DE SESIÓN Y GEO
let userPhone = localStorage.getItem('vega_user_phone') || null;
let userUsername = localStorage.getItem('vega_user_username') || null;
let userName = localStorage.getItem('vega_user_name') || null;
let paisCliente = null;
let catalogoRaw=[];
let cargandoCatalogo=null;

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
document.addEventListener('DOMContentLoaded', () => {
    actualizarBotonHeader();
    VegaUI.loading(document.getElementById('contenedor-servicios'),6);
    cargarCatalogo();
    if(accessCode)abrirMiCuenta();
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),2500);
    fetch('https://ipapi.co/json/',{signal:controller.signal}).then(r=>r.json()).then(data=>{
        if(data.country_code && !paisCliente){paisCliente=data.country_code;iti.setCountry(paisCliente.toLowerCase());}
    }).catch(()=>{}).finally(()=>{clearTimeout(timeout);const field=document.getElementById('pais-catalogo');
        if(paisCliente){if(![...field.options].some(o=>o.value===paisCliente))field.add(new Option(paisCliente,paisCliente));field.value=paisCliente;}
        else field.options[0].textContent='Selecciona tu país';
        aplicarPaisCatalogo();
    });
    document.getElementById('pais-catalogo').onchange=e=>{paisCliente=e.target.value||null;aplicarPaisCatalogo();};
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
        if (!iti.isValidNumber()) return VegaUI.toast('Ingresa un número de WhatsApp válido para este país.');
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
    if (!VegaSecurity.validCode(code)) return VegaUI.toast('Pega el enlace privado completo que recibiste de VegaStore.');
    accessCode = VegaSecurity.saveCode(code);
    document.getElementById('modal-acceso-privado').classList.add('oculto');
    document.getElementById('enlace-privado-input').value = '';
    abrirMiCuenta();
}
async function copiarMiEnlace() {
    await navigator.clipboard.writeText(VegaSecurity.privateLink(accessCode));
    document.getElementById('estado-copia-enlace').textContent = 'Enlace copiado. Guárdalo en un lugar privado.';
}
async function cerrarSesionCliente() {
    if (!await VegaUI.confirm('Guarda tu enlace privado para volver a consultar tus servicios desde este dispositivo.',{title:'Cerrar sesión',accept:'Cerrar sesión'})) return;
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
    const contenedor=document.getElementById('lista-mis-servicios'),code=accessCode;
    VegaUI.loading(contenedor,2);
    try{
        const {data,error}=await VegaUI.read(clientForAccess().from('usuarios_canva').select('id,servicio,estado,fecha_inicio,fecha_fin,vigencia_inicio,ultima_ampliacion,creado_en,meses,unidad').order('creado_en',{ascending:false}));
        if(code!==accessCode)return;
        if(error)throw error;
        contenedor.replaceChildren();contenedor.removeAttribute('aria-busy');
        if(!data?.length){contenedor.innerHTML='<p class="empty-state">Este enlace no tiene servicios disponibles. Si ya compraste, pide tu enlace privado por WhatsApp.</p>';return;}
        for(const item of data){
            const state=VegaDates.status(item),card=document.createElement('article');card.className='customer-service';
            card.innerHTML=`<div class="customer-service-top"><h3>${h(item.servicio)}</h3><span class="status-chip ${state==='Activo'?'active':'attention'}">${h(state)}</span></div><p class="current-duration">${h(VegaDates.label(item))}</p><p class="current-expiry">${item.fecha_fin?'Vigente hasta el <strong>'+h(VegaDates.format(item.fecha_fin))+'</strong>':h(VegaDates.permanent(item)?'Acceso permanente':'Vigencia pendiente de confirmar')}</p>${item.ultima_ampliacion?'<p class="last-extension">Última actualización: '+h(item.ultima_ampliacion)+'</p>':''}`;
            const details=document.createElement('details');details.className='service-history';const summary=document.createElement('summary');summary.textContent='Ver historial';const list=document.createElement('div');details.append(summary,list);
            let loaded=false;details.ontoggle=()=>{if(details.open&&!loaded){loaded=true;cargarHistorialPedido(item.id,list,clientForAccess());}};
            card.append(details);contenedor.append(card);
        }
    }catch(e){if(code===accessCode)VegaUI.error(contenedor,'No pudimos consultar tus servicios. Reintenta o contacta a soporte.',cargarMisServicios);}
}

async function cargarPromociones() {
    const contenedor = document.getElementById('lista-promociones'),code=accessCode;
    contenedor.innerHTML = '<p style="text-align: center; color: #6b7280;">Buscando promociones...</p>';
    const { data: compras } = await clientForAccess().from('usuarios_canva').select('id').eq('estado', 'Activo');
    if(code!==accessCode)return;
    let tieneCompras = compras && compras.length > 0;
    const { data, error } = await supabaseClient.from('promociones').select('*').eq('activo', true);
    if(code!==accessCode)return;
    if(error){VegaUI.error(contenedor,'No pudimos cargar las promociones.',cargarPromociones);return;}
    if (!data || data.length === 0) { contenedor.innerHTML = '<p style="text-align: center; color: #6b7280;">No hay promociones disponibles.</p>'; return; }

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
    if(cargandoCatalogo)return cargandoCatalogo;
    cargandoCatalogo=(async()=>{
        const {data,error}=await VegaUI.read(supabaseClient.from('servicios').select('*').order('id',{ascending:true}));
        if(error)throw error;
        catalogoRaw=data||[];aplicarPaisCatalogo();
    })();
    try{await cargandoCatalogo;}catch(e){
        document.getElementById('catalogo-resumen').textContent='No pudimos actualizar la disponibilidad.';
        if(!catalogoRaw.length)VegaUI.error(document.getElementById('contenedor-servicios'),'No pudimos cargar el catálogo.',cargarCatalogo);
    }finally{cargandoCatalogo=null;document.getElementById('contenedor-servicios').removeAttribute('aria-busy');}
}
function aplicarPaisCatalogo(){
    catalogoGlobal=catalogoRaw.filter(s=>{
        if(!s.geo_tipo||s.geo_tipo==='todos')return true;
        if(!paisCliente)return false;
        const countries=(s.geo_paises||'').split(',').map(p=>p.trim().toUpperCase());
        return s.geo_tipo==='solo'?countries.includes(paisCliente):s.geo_tipo==='excepto'?!countries.includes(paisCliente):true;
    });
    generarBotonesCategorias(catalogoGlobal);actualizarVistaCatalogo();
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

const planesElegidos = new Map();
function renderizarCatalogo(serviciosParaMostrar) {
    const contenedor = document.getElementById('contenedor-servicios');
    contenedor.replaceChildren();
    if (!serviciosParaMostrar.length) { contenedor.innerHTML = '<p class="catalog-empty">No hay productos que coincidan con estos filtros.</p>'; return; }
    serviciosParaMostrar.forEach(servicio => {
        const plans = VegaCatalog.planes(servicio);
        const key = `contenedor-servicios:${servicio.id}`, choice = planesElegidos.get(key);
        let selected = plans.find(p => p.cantidad === choice?.cantidad && p.unidad === choice?.unidad) || plans[0];
        const available = VegaCatalog.disponible(servicio);
        const card = document.createElement('article'); card.className = 'card product-card' + (available ? '' : ' is-sold-out');
        card.innerHTML = `<div class="product-header"><button class="product-media" aria-label="Ver detalles de ${h(servicio.nombre)}">${servicio.imagen_url ? `<img class="card-img-top" src="${h(VegaSecurity.imageUrl(servicio.imagen_url))}" alt="" loading="lazy">` : '<span aria-hidden="true">◇</span>'}</button><div class="product-info"><span class="product-category">${h(servicio.categoria || 'Servicio')}</span><h2>${h(servicio.nombre)}</h2>${servicio.etiqueta ? `<p class="product-tag" title="${h(servicio.etiqueta)}">${h(servicio.etiqueta)}</p>` : ''}</div></div>
            <span class="stock-badge ${available ? '' : 'sold-out'}">${h(VegaCatalog.stockTexto(servicio))}</span>
            <div class="product-plans" role="group" aria-label="Duración de ${h(servicio.nombre)}"></div>
            <div class="product-bottom"><div class="price"></div><div class="product-actions"><button class="btn-detalles">Detalles</button><button class="btn-primary">${available ? 'Comprar' : 'Agotado'}</button></div></div>`;
        card.querySelector('.product-media').onclick = card.querySelector('.btn-detalles').onclick = () => abrirModalDetalles(servicio, selected);
        const buy = card.querySelector('.btn-primary'); buy.disabled = !available;
        buy.onclick = () => prepararCompra({...servicio,...selected});
        const refresh = () => {
            card.querySelector('.price').innerHTML = `<strong>S/ ${selected.total.toFixed(2)}</strong>${selected.promo !== null ? `<del>S/ ${selected.precio.toFixed(2)}</del>` : ''}`;
            card.querySelectorAll('.btn-plan-tarjeta').forEach((btn,i) => btn.setAttribute('aria-pressed',String(plans[i] === selected)));
        };
        plans.forEach(plan => {
            const btn = document.createElement('button'); btn.className = 'btn-plan-tarjeta'; btn.textContent = formatTiempo(plan.cantidad,plan.unidad);
            btn.onclick = () => { selected = plan; planesElegidos.set(key,{cantidad:plan.cantidad,unidad:plan.unidad}); refresh(); };
            card.querySelector('.product-plans').append(btn);
        });
        refresh(); contenedor.append(card);
    });
}

window.abrirDetallesPorId = function(id) {
    const service = catalogoGlobal.find(item => Number(item.id) === Number(id));
    if (service) abrirModalDetalles(service);
};
window.abrirModalDetalles = function(servicio, preferido = null) {
    const modal = document.getElementById('modal-detalles');
    let planes = VegaCatalog.planes(servicio);
    if (preferido) planes.sort((a,b) => Number(b.cantidad === preferido.cantidad && b.unidad === preferido.unidad) - Number(a.cantidad === preferido.cantidad && a.unidad === preferido.unidad));
    document.getElementById('detalles-disponibilidad').innerHTML = htmlDisponibilidad(servicio);

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
        let pBuy = {...servicio, ...plan};
        const button = document.createElement('button');
        button.className = 'btn-primary'; button.style.cssText = 'width:100%;padding:15px;font-size:16px;margin-top:10px;';
        button.disabled = !VegaCatalog.disponible(servicio);
        button.textContent = button.disabled ? 'Agotado' : 'Comprar ahora';
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
    const current = await consultarPlan(plan);
    if (!current) return;
    plan = current;
    if (!userPhone && !userUsername) {
        pendingPurchase = plan;
        document.getElementById('modal-login').classList.remove('oculto');
        return;
    }

    ensureAccessCode();
    const { data: pendientes } = await clientForAccess().from('usuarios_canva').select('id').eq('estado', 'Pendiente');
    if (pendientes && pendientes.length >= 3) {
        return VegaUI.toast("🛑 Tienes demasiadas solicitudes pendientes. Espera a que validemos tus pagos o contáctanos.");
    }

    const precioFinal = plan.total;

    productoSeleccionado = {
        id: plan.id,
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
    const button = document.getElementById('btn-otro-medio');
    if (button.disabled || !productoSeleccionado.id) return;
    let datoCliente = null; // Texto por defecto para evitar errores en BD
    if (productoSeleccionado.tipo_ingreso === 'correo') {
        datoCliente = inputDatoCompra.value.trim();
        if(datoCliente === "" || !datoCliente.includes("@")) {
            inputDatoCompra.style.borderColor = "#DC2626"; alertaDato.style.display = "block"; return;
        }
    }

    button.disabled = true;
    try {
    const fresh = await consultarPlan(productoSeleccionado);
    if (!fresh) return;
    if (fresh.total !== productoSeleccionado.precio) {
        VegaUI.toast('El precio cambió. Revisa el importe actualizado antes de generar el pedido.');
        await prepararCompra(fresh); return;
    }
    const token = "TK-" + VegaSecurity.newCode().slice(0, 12).toUpperCase();
    const consulta_hash = await VegaSecurity.hashCode(ensureAccessCode());
    const btn = document.getElementById('btn-otro-medio'); btn.innerText = "Generando..."; btn.disabled = true;

    const { error } = await clientForAccess().from('usuarios_canva').insert([{
        telefono: userPhone, whatsapp_usuario: userUsername, nombre_cliente: userName, correo: datoCliente,
        servicio_id: productoSeleccionado.id, precio_acordado: productoSeleccionado.precio, servicio: productoSeleccionado.nombre, meses: productoSeleccionado.cantidad, unidad: productoSeleccionado.unidad,
        metodo_pago: 'WhatsApp', token: token, consulta_hash
    }]);

    if (error) {
        VegaUI.toast("No se generó el pedido: " + error.message);
        await cargarCatalogo();
        btn.innerText = `Generar Pedido y Pagar (S/ ${productoSeleccionado.precio.toFixed(2)})`; btn.disabled = false;
        return;
    }

    let txtTiempo = formatTiempo(productoSeleccionado.cantidad, productoSeleccionado.unidad);
    let tipoDatoMsg = (productoSeleccionado.tipo_ingreso === 'correo') ? `\n📧 *Correo a activar:* ${datoCliente}` : ``;

    const mensaje = `Hola, quiero adquirir *${productoSeleccionado.nombre} (${txtTiempo})* por S/${productoSeleccionado.precio.toFixed(2)} (sujeto a disponibilidad al confirmar el pago).${tipoDatoMsg}\n*Mi token es:* ${token}`;

    const privateUrl = VegaSecurity.privateLink(accessCode);
    const whatsappUrl = `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensaje + '\nMi enlace privado de consulta: ' + privateUrl)}`;
    const payLink = document.getElementById('pagar-pedido-link');
    payLink.href = whatsappUrl; payLink.hidden = false;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    abrirMiCuenta();
    document.getElementById('modal-compra').classList.add('oculto');
    } catch (error) {
        VegaUI.toast('No pudimos confirmar el pedido. Revisa Mis servicios antes de intentarlo otra vez.');
    } finally {
        button.disabled = false;
        button.innerText = `Generar Pedido y Pagar (S/ ${productoSeleccionado.precio.toFixed(2)})`;
    }
});

// =====================================
// FILTROS Y BÚSQUEDA
// =====================================
let categoriaElegida = 'Todos';
let firmaPromociones = '';
window.filtrarCategoria = function(cat) {
    categoriaElegida = cat;
    actualizarVistaCatalogo();
};
function htmlDisponibilidad(s) {
    const stock = `<span class="stock-badge ${VegaCatalog.disponible(s) ? '' : 'sold-out'}">${h(VegaCatalog.stockTexto(s))}</span>`;
    return stock + (VegaCatalog.limitada(s) ? `<span class="offer-clock" data-offer-end="${h(s.promocion_fin)}"><span>${h(VegaCatalog.tiempoRestante(s.promocion_fin))}</span><small>Hasta ${h(VegaCatalog.fechaPeru(s.promocion_fin))} · Perú</small></span>` : '');
}
function actualizarVistaCatalogo() {
    const text = document.querySelector('input[placeholder="Buscar servicios..."]').value.trim().toLowerCase();
    const availableOnly = document.getElementById('solo-disponibles').checked;
    const filtered = catalogoGlobal.filter(s => (!text || s.nombre.toLowerCase().includes(text)) &&
        (categoriaElegida === 'Todos' || s.categoria?.toLowerCase() === categoriaElegida.toLowerCase()) &&
        (!availableOnly || VegaCatalog.disponible(s)));
    renderizarCatalogo(filtered);
    document.getElementById('catalogo-resumen').textContent = `${filtered.length} ${filtered.length === 1 ? 'producto' : 'productos'} · Elige la duración que prefieras`;
    document.querySelectorAll('.category-filters .pill').forEach(btn => btn.classList.toggle('active',btn.textContent.trim() === categoriaElegida));
    const offers = filtered.filter(s => VegaCatalog.limitada(s)).sort((a,b) => Date.parse(a.promocion_fin)-Date.parse(b.promocion_fin));
    renderizarOfertas(offers);
    firmaPromociones = catalogoGlobal.map(s => VegaCatalog.vigente(s)).join(',');
}
async function consultarPlan(plan) {
    if (!plan.id) { VegaUI.toast('Vuelve a seleccionar el producto desde el catálogo.'); return null; }
    const {data,error} = await supabaseClient.from('servicios').select('*').eq('id',Number(plan.id));
    if (error) { VegaUI.toast('No pudimos consultar la disponibilidad. Inténtalo de nuevo.'); return null; }
    const product = data?.[0];
    if (!product || !VegaCatalog.disponible(product)) {
        VegaUI.toast('Este producto está agotado o ya no está disponible.'); await cargarCatalogo(); return null;
    }
    const choice = VegaCatalog.planes(product).find(p => p.cantidad === Number(plan.cantidad) && p.unidad === (plan.unidad || 'meses'));
    if (!choice) { VegaUI.toast('Este plan cambió. Vuelve a elegirlo en el catálogo.'); await cargarCatalogo(); return null; }
    return {...product,...choice};
}
document.addEventListener('DOMContentLoaded', () => {
    const b = document.querySelector('input[placeholder="Buscar servicios..."]');
    b.addEventListener('input', actualizarVistaCatalogo);
    document.getElementById('solo-disponibles').addEventListener('change', actualizarVistaCatalogo);
    setInterval(() => {
        if (document.hidden) return;
        const signature = catalogoGlobal.map(s => VegaCatalog.vigente(s)).join(',');
        if (signature !== firmaPromociones) actualizarVistaCatalogo();
        document.querySelectorAll('[data-offer-end]').forEach(el => el.firstElementChild.textContent = VegaCatalog.tiempoRestante(el.dataset.offerEnd));
    }, 1000);
    setInterval(() => { if (!document.hidden) cargarCatalogo().catch(() => {}); }, 60000);
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) cargarCatalogo().catch(() => {}); });

let ofertasActuales = [], ofertaActual = 0, ofertasPausadas = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
let ofertaHover = false, ofertaFocus = false;
function renderizarOfertas(offers) {
    const currentId = ofertasActuales[ofertaActual]?.id;
    ofertasActuales = offers;
    ofertaActual = Math.max(0, offers.findIndex(s => s.id === currentId));
    const section = document.getElementById('ofertas-limitadas'), track = document.getElementById('contenedor-ofertas');
    section.hidden = !offers.length; track.replaceChildren();
    document.getElementById('ofertas-controles').hidden = offers.length < 2;
    offers.forEach(s => {
        const p = VegaCatalog.planes(s).find(p => p.promo !== null);
        const slide = document.createElement('article'); slide.className = 'offer-slide';
        slide.innerHTML = `${s.imagen_url ? `<img src="${h(VegaSecurity.imageUrl(s.imagen_url))}" alt="" class="offer-image" loading="lazy">` : '<span class="offer-image offer-placeholder" aria-hidden="true">✦</span>'}
            <div class="offer-copy"><span class="offer-kicker">Precio especial · ${h(formatTiempo(p.cantidad,p.unidad))}</span><h3>${h(s.nombre)}</h3><p class="offer-stock">${h(VegaCatalog.stockTexto(s))}</p><span class="offer-clock" data-offer-end="${h(s.promocion_fin)}"><span>${h(VegaCatalog.tiempoRestante(s.promocion_fin))}</span></span></div>
            <div class="offer-price"><strong>S/ ${p.total.toFixed(2)}</strong><del>S/ ${p.precio.toFixed(2)}</del></div><button class="offer-open">Ver oferta <span aria-hidden="true">↗</span></button>`;
        slide.querySelector('.offer-open').onclick = () => abrirModalDetalles(s,p);
        track.append(slide);
    });
    mostrarOferta();
}
function mostrarOferta() {
    const track = document.getElementById('contenedor-ofertas');
    track.style.transform = `translateX(-${ofertaActual*100}%)`;
    [...track.children].forEach((slide,i) => { slide.inert = i !== ofertaActual; slide.setAttribute('aria-hidden',String(i !== ofertaActual)); });
    document.getElementById('oferta-posicion').textContent = `${ofertaActual+1} / ${ofertasActuales.length}`;
    const pause = document.getElementById('oferta-pausa');
    pause.textContent = ofertasPausadas ? '▶' : 'Ⅱ';
    pause.setAttribute('aria-label',ofertasPausadas ? 'Reanudar ofertas' : 'Pausar ofertas');
}
function avanzarOferta(delta) {
    if (ofertasActuales.length < 2) return;
    ofertaActual = (ofertaActual+delta+ofertasActuales.length)%ofertasActuales.length; mostrarOferta();
}
document.addEventListener('DOMContentLoaded', () => {
    const section = document.getElementById('ofertas-limitadas');
    document.getElementById('oferta-anterior').onclick = () => avanzarOferta(-1);
    document.getElementById('oferta-siguiente').onclick = () => avanzarOferta(1);
    document.getElementById('oferta-pausa').onclick = () => { ofertasPausadas = !ofertasPausadas; mostrarOferta(); };
    section.addEventListener('mouseenter', () => { ofertaHover = true; });
    section.addEventListener('mouseleave', () => { ofertaHover = false; });
    section.addEventListener('focusin', () => { ofertaFocus = true; });
    section.addEventListener('focusout', e => { ofertaFocus = section.contains(e.relatedTarget); });
    let start = null, lastSwipe = 0;
    const viewport = document.getElementById('ofertas-ventana');
    viewport.addEventListener('pointerdown', e => { start = {x:e.clientX,y:e.clientY}; });
    viewport.addEventListener('click', e => { if (Date.now()-lastSwipe < 400) { e.preventDefault(); e.stopPropagation(); } },true);
    viewport.addEventListener('pointercancel', () => { start = null; });
    viewport.addEventListener('pointerup', e => {
        if (start && Math.abs(e.clientX-start.x)>45 && Math.abs(e.clientX-start.x)>Math.abs(e.clientY-start.y)) { lastSwipe = Date.now(); avanzarOferta(e.clientX<start.x?1:-1); }
        start = null;
    });
    setInterval(() => {
        if (!document.hidden && !section.hidden && !ofertasPausadas && !ofertaHover && !ofertaFocus && !document.querySelector('.modal:not(.oculto)')) avanzarOferta(1);
    }, 6000);
});
