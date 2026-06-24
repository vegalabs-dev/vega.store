// 1. INICIALIZAR SUPABASE
const supabaseUrl = 'https://rhuhuvevynovfekwhlhb.supabase.co';
const supabaseKey = 'sb_publishable_-8XCScnvNf6QXMsnbyJK9Q_XhrOr9j5';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

let serviciosData = []; 
let productoSeleccionado = { nombre: '', precio: 0, meses: 1 };
const numeroWhatsApp = "51928293163"; 

const modalCompra = document.getElementById('modal-compra');
const modalTiempo = document.getElementById('modal-tiempo');
const correoCompraInput = document.getElementById('correo-compra');
const alertaCorreo = document.getElementById('alerta-correo');
const otpBoxes = document.querySelectorAll('.otp-box');

// =====================================
// CARGAR CATÁLOGO (Soporta Pago Único)
// =====================================
async function cargarCatalogo() {
    const contenedor = document.getElementById('contenedor-servicios');
    const { data, error } = await supabaseClient.from('servicios').select('*').eq('activo', true).order('id', { ascending: true });
    
    if(error || !data || data.length === 0) return contenedor.innerHTML = '<p style="color:var(--text-light); width:100%; text-align:center;">No hay servicios disponibles.</p>';

    serviciosData = data; contenedor.innerHTML = ''; 
    
    serviciosData.forEach((serv, index) => {
        let planes = serv.planes && serv.planes.length > 0 ? serv.planes : [{ meses: 1, precio: serv.precio, promo: serv.precio_promocional }];
        serv.planes_procesados = planes;

        let etiquetaHTML = serv.etiqueta ? `<div class="card-badge">${serv.etiqueta}</div>` : '';
        let listaCaract = serv.caracteristicas ? serv.caracteristicas.split(',').map(c => `<li>✔️ ${c.trim()}</li>`).join('') : '';

        // Generar Pills (0 = Pago Único)
        let pillsHTML = `<div class="plan-pills" id="pills-container-${index}">`;
        planes.forEach((p, pIdx) => {
            let activeClass = pIdx === 0 ? 'active' : '';
            let textoMes = p.meses == 0 ? 'Pago Único' : (p.meses == 1 ? '1 Mes' : `${p.meses} Meses`);
            pillsHTML += `<button class="pill ${activeClass}" onclick="seleccionarPlan(${index}, ${pIdx}, this)">${textoMes}</button>`;
        });
        pillsHTML += `</div>`;

        contenedor.innerHTML += `
            <div class="card">
                ${etiquetaHTML}
                <h2>${serv.nombre}</h2>
                ${pillsHTML}
                <p class="price" id="precio-display-${index}">Cargando...</p>
                <ul class="features">${listaCaract}</ul>
                <div class="buttons">
                    <button class="btn-primary" onclick="abrirCompra(${index})">Obtenerlo ahora</button>
                    <button class="btn-secondary" onclick="abrirVerTiempo()">Consultar mi servicio</button>
                </div>
            </div>
        `;
        setTimeout(() => seleccionarPlan(index, 0, document.querySelector(`#pills-container-${index} .pill`)), 50);
    });
}

window.seleccionarPlan = function(servIndex, planIndex, btnElement) {
    let container = document.getElementById(`pills-container-${servIndex}`);
    container.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
    btnElement.classList.add('active');

    let serv = serviciosData[servIndex];
    let plan = serv.planes_procesados[planIndex];
    
    let precioFinal = plan.promo ? parseFloat(plan.promo) : parseFloat(plan.precio);
    let sufijo = plan.meses == 0 ? '' : '<span>/ mes</span>';
    
    let precioHTML = plan.promo 
        ? `<span style="text-decoration:line-through; color:#9CA3AF; font-size:16px;">S/ ${parseFloat(plan.precio).toFixed(2)}</span> S/ ${precioFinal.toFixed(2)} ${sufijo}`
        : `S/ ${precioFinal.toFixed(2)} ${sufijo}`;
    
    document.getElementById(`precio-display-${servIndex}`).innerHTML = precioHTML;
    serv.seleccion_actual = { nombre: serv.nombre, precio: precioFinal, meses: plan.meses };
}

// =====================================
// FUNCIONES UX Y MODALES
// =====================================
function mostrarNotificacion(mensaje, tipo = 'error') {
    const contenedor = document.getElementById('toast-container');
    const toast = document.createElement('div'); toast.className = `toast toast-${tipo}`; toast.innerHTML = tipo === 'error' ? `⚠️ ${mensaje}` : `✅ ${mensaje}`;
    contenedor.appendChild(toast); setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3500);
}

document.getElementById('btn-descargar-qr').addEventListener('click', () => mostrarNotificacion('Descargando QR...', 'success'));

window.abrirCompra = function(servIndex) {
    productoSeleccionado = serviciosData[servIndex].seleccion_actual;
    let txtMeses = productoSeleccionado.meses == 0 ? "Pago Único" : (productoSeleccionado.meses == 1 ? "1 Mes" : `${productoSeleccionado.meses} Meses`);
    
    document.getElementById('titulo-producto-modal').innerText = `Comprando: ${productoSeleccionado.nombre} (${txtMeses})`;
    document.getElementById('texto-precio-yape').innerText = `S/ ${productoSeleccionado.precio.toFixed(2)}`;
    document.getElementById('btn-confirmar-yape').innerText = `Confirmar Pago de S/ ${productoSeleccionado.precio.toFixed(2)}`;

    modalCompra.classList.remove('oculto');
    correoCompraInput.value = ""; correoCompraInput.style.borderColor = "#E5E7EB"; alertaCorreo.style.display = "none";
    otpBoxes.forEach(box => box.value = ''); 
}

window.abrirVerTiempo = function() {
    modalTiempo.classList.remove('oculto');
    document.getElementById('correo-tiempo').value = ""; document.getElementById('mensaje-tiempo').innerHTML = "";
}

document.getElementById('cerrar-compra').addEventListener('click', () => modalCompra.classList.add('oculto'));
document.getElementById('cerrar-tiempo').addEventListener('click', () => modalTiempo.classList.add('oculto'));

otpBoxes.forEach((box, index) => {
    box.addEventListener('input', (e) => { e.target.value = e.target.value.replace(/[^0-9]/g, ''); if(e.target.value && index < otpBoxes.length - 1) otpBoxes[index + 1].focus(); });
    box.addEventListener('keydown', (e) => { if(e.key === 'Backspace' && !e.target.value && index > 0) otpBoxes[index - 1].focus(); });
});

function validarCorreoCompra() {
    const correo = correoCompraInput.value.trim();
    if(correo === "" || !correo.includes("@")) { correoCompraInput.style.borderColor = "#DC2626"; alertaCorreo.style.display = "block"; return false; }
    correoCompraInput.style.borderColor = "#E5E7EB"; alertaCorreo.style.display = "none"; return correo;
}

// =====================================
// PROCESAR PAGOS Y CONSULTAS
// =====================================
document.getElementById('btn-confirmar-yape').addEventListener('click', async () => {
    const correo = validarCorreoCompra(); if(!correo) return mostrarNotificacion('Ingresa un correo válido.');
    const operacion = Array.from(otpBoxes).map(box => box.value).join('');
    if(operacion.length < 7) return mostrarNotificacion("Ingresa los 7 números de operación.");

    const btn = document.getElementById('btn-confirmar-yape'); btn.innerText = "Procesando..."; btn.disabled = true;

    await supabaseClient.from('usuarios_canva').insert([{ 
        correo: correo, servicio: productoSeleccionado.nombre, meses: productoSeleccionado.meses, metodo_pago: 'Yape', num_operacion: operacion, estado: 'Pendiente' 
    }]);

    let txtMesesMsg = productoSeleccionado.meses == 0 ? "Pago Único" : `${productoSeleccionado.meses} Meses`;
    const mensaje = `Hola, acabo de pagar *S/ ${productoSeleccionado.precio.toFixed(2)}* por *${productoSeleccionado.nombre} (${txtMesesMsg})* vía Yape.\n\n📧 *Mi correo:* ${correo}\n🧾 *N° de Operación:* ${operacion}`;
    window.open(`https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensaje)}`, '_blank');
    
    modalCompra.classList.add('oculto'); btn.innerText = `Confirmar Pago`; btn.disabled = false;
});

document.getElementById('btn-otro-medio').addEventListener('click', async () => {
    const correo = validarCorreoCompra(); if(!correo) return mostrarNotificacion('Ingresa un correo válido.');
    const token = "TK-" + Math.random().toString(36).substr(2, 4).toUpperCase();
    const btn = document.getElementById('btn-otro-medio'); btn.innerText = "Generando..."; btn.disabled = true;

    await supabaseClient.from('usuarios_canva').insert([{ 
        correo: correo, servicio: productoSeleccionado.nombre, meses: productoSeleccionado.meses, metodo_pago: 'Otro (Plin/BCP)', token: token, estado: 'Pendiente' 
    }]);

    let txtMesesMsg = productoSeleccionado.meses == 0 ? "Pago Único" : `${productoSeleccionado.meses} Meses`;
    const mensaje = `Hola, quiero adquirir *${productoSeleccionado.nombre} (${txtMesesMsg})* por S/${productoSeleccionado.precio.toFixed(2)}. Mi correo es: *${correo}*. Mi token es: *${token}*`;
    window.open(`https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensaje)}`, '_blank');
    
    modalCompra.classList.add('oculto'); btn.innerText = "Pagar con Plin / BCP / BBVA"; btn.disabled = false;
});

// CONSULTA DE TIEMPO (Soporta Permanente)
document.getElementById('btn-buscar-tiempo').addEventListener('click', async () => {
    const correo = document.getElementById('correo-tiempo').value.trim();
    const msj = document.getElementById('mensaje-tiempo');
    if(correo === "" || !correo.includes("@")) return mostrarNotificacion("Ingresa un correo válido.");
    
    const btn = document.getElementById('btn-buscar-tiempo'); btn.innerText = "Buscando..."; btn.disabled = true;
    const { data } = await supabaseClient.from('usuarios_canva').select('*').eq('correo', correo).order('creado_en', { ascending: false });
    btn.innerText = "Buscar mi tiempo"; btn.disabled = false;

    if (data && data.length > 0) {
        let usuario = data[0]; 
        if (usuario.estado === 'Activo') {
            if (usuario.meses == 0 || !usuario.fecha_fin) {
                // Es de pago único
                msj.innerHTML = `✅ Tu cuenta de <b>${usuario.servicio || 'Servicio'}</b> está activa.<br><br><strong style="color:var(--primary); font-size:22px;">Acceso Permanente (Pago Único)</strong>`;
            } else {
                let hoy = new Date(); let fin = new Date(usuario.fecha_fin);
                let dias = Math.ceil((fin.getTime() - hoy.getTime()) / (1000 * 3600 * 24));
                if (dias > 0) msj.innerHTML = `✅ Tu <b>${usuario.servicio || 'Servicio'}</b> está activo.<br><br>Te quedan <strong style="color:var(--primary); font-size:26px;">${dias} días</strong>.`;
                else msj.innerHTML = `⚠️ Tu suscripción de <b>${usuario.servicio || 'Servicio'}</b> ha vencido.<br>Renuévala desde el catálogo.`;
            }
        } else {
            msj.innerHTML = `⏳ Tu pago por <b>${usuario.servicio || 'Servicio'}</b> está <strong>Pendiente</strong>.`;
        }
    } else {
        msj.innerHTML = `❌ No encontramos compras con este correo.`;
    }
});

cargarCatalogo();
