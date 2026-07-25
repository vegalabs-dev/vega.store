// 1. INICIALIZAR SUPABASE
let catalogoGlobal = [];
const supabaseUrl = 'https://rhuhuvevynovfekwhlhb.supabase.co';
const supabaseKey = 'sb_publishable_-8XCScnvNf6QXMsnbyJK9Q_XhrOr9j5';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

let productoSeleccionado = { nombre: '', precio: 0, cantidad: 1, unidad: 'meses', tipo_ingreso: 'correo' };
const numeroWhatsApp = "51928293163"; 

const modalCompra = document.getElementById('modal-compra');
const modalTiempo = document.getElementById('modal-tiempo');
const inputDatoCompra = document.getElementById('correo-compra');
const alertaDato = document.getElementById('alerta-correo');
const otpBoxes = document.querySelectorAll('.otp-box');

// =====================================
// CARGAR CATÁLOGO
// =====================================
async function cargarCatalogo() {
    try {
        const { data: servicios, error } = await supabaseClient.from('servicios').select('*').order('id', { ascending: true });
        if (error) throw error;
        catalogoGlobal = servicios;
        generarBotonesCategorias(catalogoGlobal);
        renderizarCatalogo(catalogoGlobal);
    } catch (error) {
        console.error("Error:", error);
        document.getElementById('contenedor-servicios').innerHTML = '<p style="color: red; text-align: center; grid-column: 1/-1;">Error al cargar los servicios.</p>';
    }
}

function generarBotonesCategorias(servicios) {
    const contenedorFiltros = document.getElementById('filtros-categorias');
    if (!contenedorFiltros) return;
    const categoriasUnicas = [...new Set(servicios.map(s => s.categoria).filter(Boolean))];
    let html = `<button class="pill active" onclick="filtrarCategoria('Todos')">Todos</button>`;
    categoriasUnicas.forEach(cat => { html += `<button class="pill" onclick="filtrarCategoria('${cat}')">${cat}</button>`; });
    contenedorFiltros.innerHTML = html;
}

// FUNCIÓN AUXILIAR: Formatear el texto del tiempo (Ej: "1 Mes", "15 Días")
function formatTiempo(cantidad, unidad) {
    if (cantidad == 0) return "Pago Único";
    let u = unidad || 'meses';
    if (cantidad == 1) {
        if(u==='meses') u='Mes'; if(u==='dias') u='Día'; if(u==='años') u='Año';
    } else {
        if(u==='meses') u='Meses'; if(u==='dias') u='Días'; if(u==='años') u='Años';
    }
    return `${cantidad} ${u}`;
}

// 2. RENDERIZAR TARJETAS EN EL HTML
function renderizarCatalogo(serviciosParaMostrar) {
    const contenedor = document.getElementById('contenedor-servicios');
    contenedor.innerHTML = ''; 
    if (serviciosParaMostrar.length === 0) { contenedor.innerHTML = '<p style="text-align: center; grid-column: 1/-1; color: var(--text-light);">No hay servicios aquí.</p>'; return; }

    serviciosParaMostrar.forEach(servicio => {
        // Obtenemos el plan base (el primero) para mostrar en la tarjeta
        let planes = servicio.planes || [];
        let planBase = planes.length > 0 ? planes[0] : { precio: servicio.precio, promo: servicio.precio_promocional, cantidad: 1, unidad: 'meses' };
        
        // Compatibilidad con datos viejos
        if(planBase.cantidad === undefined) planBase.cantidad = planBase.meses !== undefined ? planBase.meses : 1;
        if(!planBase.unidad) planBase.unidad = 'meses';

        let precioNormal = parseFloat(planBase.precio);
        let precioOferta = planBase.promo ? parseFloat(planBase.promo) : null;
        let txtTiempo = planBase.cantidad == 0 ? "Permanente" : formatTiempo(planBase.cantidad, planBase.unidad);
        
        // Si hay varios planes, ponemos "Desde"
        let prefix = planes.length > 1 ? '<span style="font-size: 12px; color: var(--text-light); margin-right: 5px;">Desde</span>' : '';

        let htmlPrecio = '';
        if (precioOferta && precioOferta < precioNormal) {
            htmlPrecio = `${prefix}<span class="precio-tachado">S/ ${precioNormal.toFixed(2)}</span> <span class="precio-oferta" style="font-size: 22px;">S/ ${precioOferta.toFixed(2)}</span> <span style="font-size:12px; color:#6B7280;">/ ${txtTiempo}</span>`;
        } else {
            htmlPrecio = `${prefix}<span style="font-size: 22px; font-weight: 800; color: var(--text-dark);">S/ ${precioNormal.toFixed(2)}</span> <span style="font-size:12px; color:#6B7280;">/ ${txtTiempo}</span>`;
        }

        const servicioJSON = JSON.stringify(servicio).replace(/'/g, "&apos;");
        const imagenHtml = servicio.imagen_url 
            ? `<img src="${servicio.imagen_url}" class="card-img-top" alt="${servicio.nombre}" onclick='abrirModalDetalles(${servicioJSON})'>`
            : `<div class="card-img-top" style="display:flex; align-items:center; justify-content:center; color:#64748b; font-size:12px;" onclick='abrirModalDetalles(${servicioJSON})'>Sin imagen</div>`;

        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            ${imagenHtml}
            ${servicio.etiqueta ? `<div class="badge" style="position: absolute; top: -15px; right: 20px; background: var(--primary-gradient); color: white; padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 700;">${servicio.etiqueta}</div>` : ''}
            <div style="font-size: 13px; color: #6B7280; margin-bottom: 5px;">${servicio.categoria || 'Servicio'}</div>
            <h2 style="font-size: 20px; margin-bottom: 15px;">${servicio.nombre}</h2>
            <div class="price" style="margin-bottom: 20px;">${htmlPrecio}</div>
            
            <div class="card-botones-mini" style="display: flex; gap: 10px; margin-top: auto;">
                <button class="btn-detalles" style="flex: 1; background: #F3F4F6; color: #4B5563; border: none; padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer;" onclick='abrirModalDetalles(${servicioJSON})'>Detalles</button>
                <button class="btn-primary" style="flex: 1; padding: 10px; font-size: 14px;" onclick='abrirModalDetalles(${servicioJSON})'>Comprar</button>
            </div>
        `;
        contenedor.appendChild(card);
    });
}

// 3. ABRIR MODAL DE DETALLES Y SELECCIÓN DE PLANES
window.abrirModalDetalles = function(servicio) {
    const modal = document.getElementById('modal-detalles');
    
    // Normalizar planes para el modal
    let planes = servicio.planes || [];
    if (planes.length === 0) planes = [{ cantidad: 1, unidad: 'meses', precio: servicio.precio, promo: servicio.precio_promocional }];
    planes = planes.map(p => ({
        cantidad: p.cantidad !== undefined ? p.cantidad : (p.meses !== undefined ? p.meses : 1),
        unidad: p.unidad || 'meses',
        precio: p.precio, promo: p.promo
    }));

    // Llenar datos visuales
    const img = document.getElementById('detalles-imagen');
    if(servicio.imagen_url) { img.src = servicio.imagen_url; img.style.display = 'block'; } else { img.style.display = 'none'; }
    
    const badge = document.getElementById('detalles-badge');
    if(servicio.etiqueta) { 
        badge.innerText = servicio.etiqueta; badge.style.display = 'inline-block'; badge.style.background = 'var(--primary-gradient)';
        badge.style.color = 'white'; badge.style.padding = '6px 16px'; badge.style.borderRadius = '20px'; badge.style.fontSize = '13px'; badge.style.fontWeight = '700';
    } else { badge.style.display = 'none'; }
    
    document.getElementById('detalles-titulo').innerText = servicio.nombre;
    
    // Función para renderizar el precio grande según el plan elegido
    const renderPrecioModal = (plan) => {
        let pNorm = parseFloat(plan.precio);
        let pOfe = plan.promo ? parseFloat(plan.promo) : null;
        let txtTiempo = plan.cantidad == 0 ? "Permanente" : formatTiempo(plan.cantidad, plan.unidad);
        
        if (pOfe && pOfe < pNorm) {
            return `<span class="precio-tachado" style="text-decoration: line-through; color: #9CA3AF; margin-right: 10px;">S/ ${pNorm.toFixed(2)}</span> <span class="precio-oferta" style="color: #10B981; font-size: 28px; font-weight: bold;">S/ ${pOfe.toFixed(2)}</span> <span style="font-size:14px; color:#6B7280;">/ ${txtTiempo}</span>`;
        } else {
            return `<span style="font-size: 28px; font-weight: bold; color: var(--text-dark);">S/ ${pNorm.toFixed(2)}</span> <span style="font-size:14px; color:#6B7280;">/ ${txtTiempo}</span>`;
        }
    };

    // Crear botones de planes si hay más de 1
    const box = document.getElementById('detalles-precio-box');
    let htmlPlanes = '';
    if (planes.length > 1) {
        htmlPlanes = `<div style="font-size: 13px; color: var(--text-light); margin-bottom: 10px; font-weight: bold;">Elige tu plan:</div>
                      <div id="lista-botones-planes" style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-bottom: 20px;">`;
        planes.forEach((p, i) => {
            let active = i === 0 ? 'background: #111827; color: white;' : 'background: #F9FAFB; color: #6B7280; border: 1px solid #E5E7EB;';
            htmlPlanes += `<button class="btn-plan-selector" data-index="${i}" style="padding: 8px 16px; border-radius: 20px; font-size: 13px; font-weight: bold; cursor: pointer; transition: 0.2s; ${active}">${formatTiempo(p.cantidad, p.unidad)}</button>`;
        });
        htmlPlanes += `</div>`;
    }
    
    box.innerHTML = htmlPlanes + `<div id="precio-dinamico-modal">${renderPrecioModal(planes[0])}</div>`;

    // Llenar características
    const listaCaract = document.getElementById('detalles-caracteristicas');
    if(servicio.caracteristicas) {
        listaCaract.innerHTML = servicio.caracteristicas.split('\n').map(c => `<li style="margin-bottom: 10px; display: flex; gap: 8px; color: var(--text-light);"><span style="color: #10B981;">✔️</span> ${c}</li>`).join('');
    } else {
        listaCaract.innerHTML = '<li style="margin-bottom: 10px; display: flex; gap: 8px; color: var(--text-light);"><span style="color: #10B981;">✔️</span> Acceso garantizado y soporte.</li>';
    }
    
    // Función para actualizar el botón de comprar
    const updateComprarBtn = (plan) => {
        let planParaComprar = {
            nombre: servicio.nombre,
            precio: plan.promo ? parseFloat(plan.promo) : parseFloat(plan.precio),
            cantidad: plan.cantidad,
            unidad: plan.unidad,
            tipo_ingreso: servicio.tipo_ingreso || 'correo'
        };
        const planJSON = JSON.stringify(planParaComprar).replace(/'/g, "&apos;");
        document.getElementById('detalles-btn-comprar').innerHTML = `<button class="btn-primary" style="width: 100%; padding: 15px; font-size: 16px; margin-top: 10px;" onclick='document.getElementById("modal-detalles").classList.add("oculto"); prepararCompra(${planJSON});'>Comprar ahora</button>`;
    };
    
    updateComprarBtn(planes[0]);

    // Lógica para cuando el usuario hace clic en los botones de planes
    if (planes.length > 1) {
        const botonesPlanes = box.querySelectorAll('.btn-plan-selector');
        botonesPlanes.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Resetear estilos
                botonesPlanes.forEach(b => { b.style.background = '#F9FAFB'; b.style.color = '#6B7280'; b.style.border = '1px solid #E5E7EB'; });
                // Estilo activo
                e.target.style.background = '#111827'; e.target.style.color = 'white'; e.target.style.border = 'none';
                
                let idx = e.target.getAttribute('data-index');
                document.getElementById('precio-dinamico-modal').innerHTML = renderPrecioModal(planes[idx]);
                updateComprarBtn(planes[idx]);
            });
        });
    }

    modal.classList.remove('oculto');
};

document.getElementById('cerrar-detalles').addEventListener('click', () => { document.getElementById('modal-detalles').classList.add('oculto'); });

// =====================================
// PREPARAR COMPRA (Lógica de Yape/WhatsApp)
// =====================================
window.prepararCompra = function(plan) {
    productoSeleccionado = {
        nombre: plan.nombre,
        precio: parseFloat(plan.precio),
        cantidad: plan.cantidad,
        unidad: plan.unidad,
        tipo_ingreso: plan.tipo_ingreso
    };
    
    let txtTiempo = formatTiempo(productoSeleccionado.cantidad, productoSeleccionado.unidad);
    
    document.getElementById('titulo-producto-modal').innerText = `Comprando: ${productoSeleccionado.nombre} (${txtTiempo})`;
    document.getElementById('texto-precio-yape').innerText = `S/ ${productoSeleccionado.precio.toFixed(2)}`;
    document.getElementById('btn-confirmar-yape').innerText = `Confirmar Pago de S/ ${productoSeleccionado.precio.toFixed(2)}`;

    if (productoSeleccionado.tipo_ingreso === 'numero') {
        inputDatoCompra.placeholder = "1. Escribe tu número de WhatsApp";
        inputDatoCompra.type = "tel";
        alertaDato.innerText = "⚠️ Ingresa tu número de WhatsApp primero.";
    } else {
        inputDatoCompra.placeholder = "1. Escribe el correo a vincular";
        inputDatoCompra.type = "email";
        alertaDato.innerText = "⚠️ Ingresa tu correo primero.";
    }

    modalCompra.classList.remove('oculto');
    inputDatoCompra.value = ""; inputDatoCompra.style.borderColor = "#E5E7EB"; alertaDato.style.display = "none";
    otpBoxes.forEach(box => box.value = ''); 
};

// =====================================
// FILTROS Y BÚSQUEDA
// =====================================
window.filtrarCategoria = function(categoriaSeleccionada) {
    const botones = document.querySelectorAll('.category-filters .pill');
    botones.forEach(btn => { if(btn.innerText.trim() === categoriaSeleccionada) btn.classList.add('active'); else btn.classList.remove('active'); });
    if (categoriaSeleccionada === 'Todos') renderizarCatalogo(catalogoGlobal);
    else renderizarCatalogo(catalogoGlobal.filter(servicio => servicio.categoria && servicio.categoria.toLowerCase() === categoriaSeleccionada.toLowerCase()));
};

document.addEventListener('DOMContentLoaded', () => {
    const buscador = document.querySelector('input[placeholder="Buscar servicios..."]');
    if(buscador) {
        buscador.addEventListener('input', (e) => {
            const texto = e.target.value.toLowerCase();
            renderizarCatalogo(catalogoGlobal.filter(servicio => servicio.nombre.toLowerCase().includes(texto)));
            document.querySelectorAll('.category-filters .pill').forEach(btn => btn.classList.remove('active'));
        });
    }
});

document.addEventListener('click', function(e) {
    if (e.target && e.target.classList.contains('btn-consultar-dinamico')) {
        modalTiempo.classList.remove('oculto'); document.getElementById('correo-tiempo').value = ""; document.getElementById('mensaje-tiempo').innerHTML = "";
    }
});

document.getElementById('cerrar-compra').addEventListener('click', () => modalCompra.classList.add('oculto'));
document.getElementById('cerrar-tiempo').addEventListener('click', () => modalTiempo.classList.add('oculto'));

otpBoxes.forEach((box, index) => {
    box.addEventListener('input', (e) => { e.target.value = e.target.value.replace(/[^0-9]/g, ''); if(e.target.value && index < otpBoxes.length - 1) otpBoxes[index + 1].focus(); });
    box.addEventListener('keydown', (e) => { if(e.key === 'Backspace' && !e.target.value && index > 0) otpBoxes[index - 1].focus(); });
});

function validarDatoCompra() {
    const dato = inputDatoCompra.value.trim();
    let esValido = false;
    if (productoSeleccionado.tipo_ingreso === 'numero') { esValido = dato.replace(/\D/g,'').length >= 9; } 
    else { esValido = dato !== "" && dato.includes("@"); }
    if(!esValido) { inputDatoCompra.style.borderColor = "#DC2626"; alertaDato.style.display = "block"; return false; }
    inputDatoCompra.style.borderColor = "#E5E7EB"; alertaDato.style.display = "none"; return dato;
}

// =====================================
// PROCESAR PAGOS (Yape y WhatsApp)
// =====================================
document.getElementById('btn-confirmar-yape').addEventListener('click', async () => {
    const datoCliente = validarDatoCompra(); if(!datoCliente) return mostrarNotificacion('Ingresa el dato solicitado correctamente.');
    const operacion = Array.from(otpBoxes).map(box => box.value).join('');
    if(operacion.length < 7) return mostrarNotificacion("Ingresa los 7 números de operación.");

    const btn = document.getElementById('btn-confirmar-yape'); btn.innerText = "Procesando..."; btn.disabled = true;

    // GUARDAR EN LA BD (Incluye la nueva cantidad y unidad)
    await supabaseClient.from('usuarios_canva').insert([{ 
        correo: datoCliente, servicio: productoSeleccionado.nombre, 
        meses: productoSeleccionado.cantidad, unidad: productoSeleccionado.unidad, // NUEVOS CAMPOS
        metodo_pago: 'Yape', num_operacion: operacion, estado: 'Pendiente' 
    }]);

    let txtTiempo = formatTiempo(productoSeleccionado.cantidad, productoSeleccionado.unidad);
    let tipoDatoMsg = productoSeleccionado.tipo_ingreso === 'numero' ? '📱 *Mi número:*' : '📧 *Mi correo:*';
    const mensaje = `Hola, acabo de pagar *S/ ${productoSeleccionado.precio.toFixed(2)}* por *${productoSeleccionado.nombre} (${txtTiempo})* vía Yape.\n\n${tipoDatoMsg} ${datoCliente}\n🧾 *N° de Operación:* ${operacion}`;
    
    window.open(`https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensaje)}`, '_blank');
    modalCompra.classList.add('oculto'); btn.innerText = `Confirmar Pago de S/ ${productoSeleccionado.precio.toFixed(2)}`; btn.disabled = false;
});

document.getElementById('btn-otro-medio').addEventListener('click', async () => {
    const datoCliente = validarDatoCompra(); if(!datoCliente) return mostrarNotificacion('Ingresa el dato solicitado antes de continuar.');
    const token = "TK-" + Math.random().toString(36).substr(2, 4).toUpperCase();
    const btn = document.getElementById('btn-otro-medio'); btn.innerText = "Generando..."; btn.disabled = true;

    await supabaseClient.from('usuarios_canva').insert([{ 
        correo: datoCliente, servicio: productoSeleccionado.nombre, 
        meses: productoSeleccionado.cantidad, unidad: productoSeleccionado.unidad, 
        metodo_pago: 'Otro (Plin/BCP)', token: token, estado: 'Pendiente' 
    }]);

    let txtTiempo = formatTiempo(productoSeleccionado.cantidad, productoSeleccionado.unidad);
    let tipoDatoMsg = productoSeleccionado.tipo_ingreso === 'numero' ? 'Mi número es:' : 'Mi correo es:';
    const mensaje = `Hola, quiero adquirir *${productoSeleccionado.nombre} (${txtTiempo})* por S/${productoSeleccionado.precio.toFixed(2)}. ${tipoDatoMsg} *${datoCliente}*. Mi token es: *${token}*`;
    
    window.open(`https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensaje)}`, '_blank');
    modalCompra.classList.add('oculto'); btn.innerText = "Pagar con Plin / BCP / BBVA"; btn.disabled = false;
});

// =====================================
// CONSULTA DE TIEMPO
// =====================================
document.getElementById('btn-buscar-tiempo').addEventListener('click', async () => {
    const datoBuscado = document.getElementById('correo-tiempo').value.trim();
    const msj = document.getElementById('mensaje-tiempo');
    if(datoBuscado === "") return mostrarNotificacion("Ingresa tu correo o número.");
    const btn = document.getElementById('btn-buscar-tiempo'); btn.innerText = "Buscando..."; btn.disabled = true;
    
    const { data } = await supabaseClient.from('usuarios_canva').select('*').eq('correo', datoBuscado).order('creado_en', { ascending: false });
    btn.innerText = "Buscar mi tiempo"; btn.disabled = false;

    if (data && data.length > 0) {
        let usuario = data[0]; 
        if (usuario.estado === 'Activo') {
            if (usuario.meses == 0 || !usuario.fecha_fin) {
                msj.innerHTML = `✅ Tu cuenta de <b>${usuario.servicio || 'Servicio'}</b> está activa.<br><br><strong style="color:var(--primary); font-size:22px;">Acceso Permanente (Pago Único)</strong>`;
            } else {
                let hoy = new Date(); let fin = new Date(usuario.fecha_fin);
                let dias = Math.ceil((fin.getTime() - hoy.getTime()) / (1000 * 3600 * 24));
                if (dias > 0) msj.innerHTML = `✅ Tu <b>${usuario.servicio || 'Servicio'}</b> está activo.<br><br>Te quedan <strong style="color:var(--primary); font-size:26px;">${dias} días</strong>.`;
                else msj.innerHTML = `⚠️ Tu suscripción de <b>${usuario.servicio || 'Servicio'}</b> ha vencido.<br>Renuévala desde el catálogo.`;
            }
        } else { msj.innerHTML = `⏳ Tu pago por <b>${usuario.servicio || 'Servicio'}</b> está <strong>Pendiente</strong>.`; }
    } else { msj.innerHTML = `❌ No encontramos compras registradas con este dato.`; }
});

function mostrarNotificacion(mensaje) { alert(mensaje); }

cargarCatalogo(); 
