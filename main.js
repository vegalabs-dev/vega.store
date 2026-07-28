// 1. INICIALIZAR SUPABASE
let catalogoGlobal = [];
const supabaseUrl = 'https://rhuhuvevynovfekwhlhb.supabase.co';
const supabaseKey = 'sb_publishable_-8XCScnvNf6QXMsnbyJK9Q_XhrOr9j5';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

let productoSeleccionado = { nombre: '', precio: 0, cantidad: 1, unidad: 'meses', tipo_ingreso: 'numero' };
const numeroWhatsApp = "51928293163"; 

// SISTEMA DE SESIÓN Y GEO
let userPhone = localStorage.getItem('vega_user_phone') || null;
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
});

function actualizarBotonHeader() {
    const btn = document.getElementById('btn-header-cuenta');
    if (userPhone) {
        btn.innerText = "👤 Mi Panel"; btn.style.background = "var(--primary-gradient)"; btn.style.color = "white"; btn.style.border = "none";
    } else {
        btn.innerText = "Ingresar"; btn.style.background = "#F3F4F6"; btn.style.color = "#1F2937";
    }
}

function abrirMiCuenta() {
    if (userPhone) {
        document.getElementById('panel-telefono-txt').innerText = userPhone;
        document.getElementById('modal-panel-cliente').classList.remove('oculto');
        cargarMisServicios();
    } else {
        document.getElementById('modal-login').classList.remove('oculto');
    }
}

function procesarLogin() {
    if (!iti.isValidNumber()) return alert("⚠️ Por favor, ingresa un número de WhatsApp válido para este país.");
    userPhone = iti.getNumber();
    localStorage.setItem('vega_user_phone', userPhone);
    document.getElementById('modal-login').classList.add('oculto');
    actualizarBotonHeader();
    alert("✅ Sesión iniciada correctamente.");
    abrirMiCuenta();
}

function cerrarSesionCliente() {
    localStorage.removeItem('vega_user_phone'); userPhone = null;
    document.getElementById('modal-panel-cliente').classList.add('oculto');
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
    const { data, error } = await supabaseClient.from('usuarios_canva').select('*').eq('telefono', userPhone).order('creado_en', { ascending: false });
    
    if (error || !data || data.length === 0) { contenedor.innerHTML = '<p style="text-align: center; color: #6b7280;">No tienes servicios registrados aún.</p>'; return; }

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
        contenedor.innerHTML += `<div class="item-servicio-cliente"><div><h4 style="margin: 0 0 5px 0; font-size: 15px;">${item.servicio}</h4><p style="margin: 0; font-size: 12px; color: #6B7280;">Contratado: ${new Date(item.creado_en).toLocaleDateString()}</p></div><div style="text-align: right;">${estadoBadge}<br><div style="margin-top: 5px;">${infoTiempo}</div></div></div>`;
    });
}

async function cargarPromociones() {
    const contenedor = document.getElementById('lista-promociones');
    contenedor.innerHTML = '<p style="text-align: center; color: #6b7280;">Buscando promociones...</p>';
    const { data: compras } = await supabaseClient.from('usuarios_canva').select('id').eq('telefono', userPhone).eq('estado', 'Activo');
    let tieneCompras = compras && compras.length > 0;
    const { data, error } = await supabaseClient.from('promociones').select('*').eq('activo', true);
    if (error || !data || data.length === 0) { contenedor.innerHTML = '<p style="text-align: center; color: #6b7280;">No hay promociones disponibles.</p>'; return; }

    contenedor.innerHTML = '';
    data.forEach(promo => {
        let bloqueado = promo.requisito_compra && !tieneCompras;
        let btnHtml = bloqueado ? `<button style="background:#D1D5DB; color:white; border:none; padding:8px 12px; border-radius:8px; font-size:12px; font-weight:bold; cursor:not-allowed;">Requiere compra previa</button>` : `<a href="https://wa.me/${numeroWhatsApp}?text=Hola, quiero reclamar la promo: *${promo.titulo}* por S/${promo.precio_promo}" target="_blank" style="background:var(--primary); color:white; text-decoration:none; padding:8px 12px; border-radius:8px; font-size:12px; font-weight:bold; display:inline-block;">Reclamar Promo</a>`;
        contenedor.innerHTML += `<div class="item-promo"><h4 style="margin: 0 0 5px 0; font-size: 16px; color:#92400E;">🎁 ${promo.titulo}</h4><p style="margin: 0 0 10px 0; font-size: 13px; color: #B45309;">${promo.descripcion}</p><div style="display: flex; justify-content: space-between; align-items: center;"><span style="font-size: 18px; font-weight: 900; color: #B45309;">S/ ${promo.precio_promo}</span>${btnHtml}</div></div>`;
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
    categoriasUnicas.forEach(cat => { html += `<button class="pill" onclick="filtrarCategoria('${cat}')">${cat}</button>`; });
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
            return `<button class="btn-plan-tarjeta" data-servicio="${indexServicio}" data-plan="${i}" style="padding:4px 10px; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer; transition:0.2s; ${activeStyle}">${t}</button>`;
        }).join('');
        let htmlPlanesInteractivos = `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:15px;" id="contenedor-planes-${indexServicio}">${pills}</div>`;

        const sJSON = JSON.stringify(servicio).replace(/'/g, "&apos;");
        const imgHtml = servicio.imagen_url ? `<img src="${servicio.imagen_url}" class="card-img-top" onclick='abrirModalDetalles(${sJSON})'>` : `<div class="card-img-top" style="display:flex; align-items:center; justify-content:center; color:#64748b; font-size:12px;" onclick='abrirModalDetalles(${sJSON})'>Sin imagen</div>`;

        const card = document.createElement('div'); card.className = 'card';
        card.innerHTML = `
            ${imgHtml}
            ${servicio.etiqueta ? `<div class="badge" style="position:absolute; top:-15px; right:20px; background:var(--primary-gradient); color:white; padding:6px 16px; border-radius:20px; font-size:13px; font-weight:700;">${servicio.etiqueta}</div>` : ''}
            <div style="font-size:12px; color:#6B7280; margin-bottom:5px; font-weight:bold; text-transform:uppercase;">${servicio.categoria || 'Servicio'}</div>
            <h2 style="font-size:18px; margin-bottom:12px; line-height:1.2;">${servicio.nombre}</h2>
            ${htmlPlanesInteractivos}
            <div class="price" id="precio-tarjeta-${indexServicio}" style="margin-bottom:15px;">${generarHtmlPrecioLimpio(planesOrdenados[0])}</div>
            <div class="card-botones-mini" style="display:flex; gap:8px; margin-top:auto;">
                <button class="btn-detalles" style="flex:1; background:#F3F4F6; color:#4B5563; border:none; padding:10px 5px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:13px;" onclick='abrirModalDetalles(${sJSON})'>Detalles</button>
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

window.abrirModalDetalles = function(servicio) {
    const modal = document.getElementById('modal-detalles');
    let planes = servicio.planes || [{ cantidad: 1, unidad: 'meses', precio: servicio.precio, promo: servicio.precio_promocional }];
    planes = planes.map(p => ({ cantidad: p.cantidad !== undefined ? p.cantidad : (p.meses || 1), unidad: p.unidad || 'meses', precio: p.precio, promo: p.promo })).sort((a, b) => (a.promo ? parseFloat(a.promo) : parseFloat(a.precio)) - (b.promo ? parseFloat(b.promo) : parseFloat(b.precio)));

    const img = document.getElementById('detalles-imagen');
    if(servicio.imagen_url) { img.src = servicio.imagen_url; img.style.display = 'block'; } else { img.style.display = 'none'; }
    
    const badge = document.getElementById('detalles-badge');
    if(servicio.etiqueta) { badge.innerText = servicio.etiqueta; badge.style.display = 'inline-block'; badge.style.background = 'var(--primary-gradient)'; badge.style.color = 'white'; badge.style.padding = '6px 16px'; badge.style.borderRadius = '20px'; badge.style.fontSize = '13px'; badge.style.fontWeight = '700'; } else { badge.style.display = 'none'; }
    
    document.getElementById('detalles-titulo').innerText = servicio.nombre;
    
    const renderPrecioModal = (plan) => {
        let pNorm = parseFloat(plan.precio); let pOfe = plan.promo ? parseFloat(plan.promo) : null;
        let txtTiempo = plan.cantidad == 0 ? "Permanente" : formatTiempo(plan.cantidad, plan.unidad);
        if (pOfe && pOfe < pNorm) return `<div style="display:flex; align-items:center; justify-content:center; gap:10px; flex-wrap:wrap;"><span class="precio-tachado" style="text-decoration:line-through; color:#9CA3AF; font-size:16px;">S/ ${pNorm.toFixed(2)}</span> <span class="precio-oferta" style="color:#10B981; font-size:32px; font-weight:800;">S/ ${pOfe.toFixed(2)}</span></div><div style="font-size:14px; color:#6B7280; margin-top:5px;">por ${txtTiempo}</div>`;
        return `<div style="display:flex; align-items:center; justify-content:center; gap:10px; flex-wrap:wrap;"><span style="font-size:32px; font-weight:800; color:var(--text-dark);">S/ ${pNorm.toFixed(2)}</span></div><div style="font-size:14px; color:#6B7280; margin-top:5px;">por ${txtTiempo}</div>`;
    };

    const box = document.getElementById('detalles-precio-box');
    let htmlPlanes = `<div style="font-size:13px; color:var(--text-light); margin-bottom:10px; font-weight:bold;">Elige tu plan:</div><div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-bottom:20px;">`;
    planes.forEach((p, i) => {
        let active = i === 0 ? 'background:#111827; color:white;' : 'background:#F9FAFB; color:#6B7280; border:1px solid #E5E7EB;';
        htmlPlanes += `<button class="btn-plan-selector" data-index="${i}" style="padding:8px 16px; border-radius:20px; font-size:13px; font-weight:bold; cursor:pointer; transition:0.2s; ${active}">${formatTiempo(p.cantidad, p.unidad)}</button>`;
    });
    htmlPlanes += `</div>`;
    box.innerHTML = htmlPlanes + `<div id="precio-dinamico-modal">${renderPrecioModal(planes[0])}</div>`;

    const listaCaract = document.getElementById('detalles-caracteristicas');
    if(servicio.caracteristicas) listaCaract.innerHTML = servicio.caracteristicas.split('\n').map(c => `<li style="margin-bottom:10px; display:flex; gap:8px; color:var(--text-light);"><span style="color:#10B981;">✔️</span> <span style="text-align:left;">${c}</span></li>`).join('');
    else listaCaract.innerHTML = '<li style="margin-bottom:10px; display:flex; gap:8px; color:var(--text-light);"><span style="color:#10B981;">✔️</span> Acceso garantizado y soporte.</li>';
    
    const updateComprarBtn = (plan) => {
        let pBuy = { nombre: servicio.nombre, precio: plan.promo ? parseFloat(plan.promo) : parseFloat(plan.precio), cantidad: plan.cantidad, unidad: plan.unidad, tipo_ingreso: servicio.tipo_ingreso || 'numero' };
        document.getElementById('detalles-btn-comprar').innerHTML = `<button class="btn-primary" style="width:100%; padding:15px; font-size:16px; margin-top:10px;" onclick='document.getElementById("modal-detalles").classList.add("oculto"); prepararCompra(${JSON.stringify(pBuy).replace(/'/g, "&apos;")});'>Comprar ahora</button>`;
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
// COMPRA DIRECTA Y ANTI-SPAM
// =====================================
window.prepararCompra = async function(plan) {
    if (!userPhone) {
        alert("⚠️ Por favor, inicia sesión con tu número de WhatsApp antes de comprar.");
        document.getElementById('modal-login').classList.remove('oculto');
        return;
    }

    const { data: pendientes } = await supabaseClient.from('usuarios_canva').select('id').eq('telefono', userPhone).eq('estado', 'Pendiente');
    if (pendientes && pendientes.length >= 3) {
        return alert("🛑 Tienes demasiadas solicitudes pendientes. Espera a que validemos tus pagos o contáctanos.");
    }

    productoSeleccionado = { nombre: plan.nombre, precio: parseFloat(plan.precio), cantidad: plan.cantidad, unidad: plan.unidad, tipo_ingreso: plan.tipo_ingreso || 'numero' };
    
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
    btnFinal.innerText = `Generar Pedido y Pagar (S/ ${productoSeleccionado.precio.toFixed(2)})`;
    btnFinal.style.background = "var(--primary-gradient)";
    btnFinal.style.color = "white";
};

document.getElementById('btn-otro-medio').addEventListener('click', async () => {
    let datoCliente = null;
    if (productoSeleccionado.tipo_ingreso === 'correo') {
        datoCliente = inputDatoCompra.value.trim();
        if(datoCliente === "" || !datoCliente.includes("@")) { 
            inputDatoCompra.style.borderColor = "#DC2626"; alertaDato.style.display = "block"; return; 
        }
    }

    const token = "TK-" + Math.random().toString(36).substr(2, 4).toUpperCase();
    const btn = document.getElementById('btn-otro-medio'); btn.innerText = "Generando..."; btn.disabled = true;

    const { error } = await supabaseClient.from('usuarios_canva').insert([{ 
        telefono: userPhone, correo: datoCliente,
        servicio: productoSeleccionado.nombre, meses: productoSeleccionado.cantidad, unidad: productoSeleccionado.unidad, 
        metodo_pago: 'WhatsApp', token: token, estado: 'Pendiente' 
    }]);

    if (error) {
        alert("Error al conectar con la base de datos: " + error.message);
        btn.innerText = `Generar Pedido y Pagar (S/ ${productoSeleccionado.precio.toFixed(2)})`; btn.disabled = false;
        return;
    }

    let txtTiempo = formatTiempo(productoSeleccionado.cantidad, productoSeleccionado.unidad);
    let tipoDatoMsg = datoCliente ? `\n📧 *Correo a activar:* ${datoCliente}` : ``;
    
    // MENSAJE LIMPIO (SIN EMOJIS RAROS)
    const mensaje = `Hola, quiero adquirir *${productoSeleccionado.nombre} (${txtTiempo})* por S/${productoSeleccionado.precio.toFixed(2)}.${tipoDatoMsg}\n*Mi token es:* ${token}`;
    
    window.open(`https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensaje)}`, '_blank');
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
