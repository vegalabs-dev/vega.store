// 1. INICIALIZAR SUPABASE
const supabaseUrl = 'https://rhuhuvevynovfekwhlhb.supabase.co';
const supabaseKey = 'sb_publishable_-8XCScnvNf6QXMsnbyJK9Q_XhrOr9j5';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// VARIABLES GLOBALES
let productoSeleccionado = { nombre: '', precio: 0 };
const numeroWhatsApp = "51928293163"; 

// ELEMENTOS DEL MODAL
const modalCompra = document.getElementById('modal-compra');
const modalTiempo = document.getElementById('modal-tiempo');
const correoCompraInput = document.getElementById('correo-compra');
const alertaCorreo = document.getElementById('alerta-correo');
const otpBoxes = document.querySelectorAll('.otp-box');

// =====================================
// CARGAR CATÁLOGO DINÁMICO
// =====================================
async function cargarCatalogo() {
    const contenedor = document.getElementById('contenedor-servicios');
    const { data, error } = await supabaseClient.from('servicios').select('*').eq('activo', true).order('id', { ascending: true });
    
    if(error || !data || data.length === 0) {
        return contenedor.innerHTML = '<p style="color:var(--text-light); text-align:center; width:100%;">No hay servicios disponibles en este momento. Añádelos desde tu panel de administrador.</p>';
    }

    contenedor.innerHTML = ''; // Limpiar el "Cargando..."
    
    data.forEach(serv => {
        let precioFinal = serv.precio_promocional ? parseFloat(serv.precio_promocional) : parseFloat(serv.precio);
        let precioHTML = serv.precio_promocional 
            ? `<span style="text-decoration:line-through; color:#9CA3AF; font-size:16px;">S/ ${parseFloat(serv.precio).toFixed(2)}</span> S/ ${precioFinal.toFixed(2)}`
            : `S/ ${precioFinal.toFixed(2)}`;
        
        let etiquetaHTML = serv.etiqueta ? `<div class="card-badge">${serv.etiqueta}</div>` : '';
        let listaCaract = serv.caracteristicas ? serv.caracteristicas.split(',').map(c => `<li>✔️ ${c.trim()}</li>`).join('') : '';

        contenedor.innerHTML += `
            <div class="card">
                ${etiquetaHTML}
                <h2>${serv.nombre}</h2>
                <p class="price">${precioHTML} <span>/ mes</span></p>
                <ul class="features">${listaCaract}</ul>
                <div class="buttons">
                    <button class="btn-primary" onclick="abrirCompra('${serv.nombre}', ${precioFinal})">Obtenerlo ahora</button>
                    <button class="btn-secondary" onclick="abrirVerTiempo()">Consultar mi suscripción</button>
                </div>
            </div>
        `;
    });
}

// =====================================
// FUNCIONES DE INTERFAZ (UX)
// =====================================
function mostrarNotificacion(mensaje, tipo = 'error') {
    const contenedor = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.innerHTML = tipo === 'error' ? `⚠️ ${mensaje}` : `✅ ${mensaje}`;
    contenedor.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3500);
}

document.getElementById('btn-descargar-qr').addEventListener('click', () => mostrarNotificacion('Descargando código QR...', 'success'));

// Funciones llamadas desde el HTML (Los botones de las tarjetas dinámicas)
window.abrirCompra = function(nombre, precio) {
    productoSeleccionado = { nombre: nombre, precio: precio };
    
    document.getElementById('titulo-producto-modal').innerText = `Comprando: ${nombre}`;
    document.getElementById('texto-precio-yape').innerText = `S/ ${precio.toFixed(2)}`;
    document.getElementById('btn-confirmar-yape').innerText = `Confirmar Pago de S/ ${precio.toFixed(2)}`;

    modalCompra.classList.remove('oculto');
    correoCompraInput.value = ""; 
    correoCompraInput.style.borderColor = "#E5E7EB";
    alertaCorreo.style.display = "none";
    otpBoxes.forEach(box => box.value = ''); 
}

window.abrirVerTiempo = function() {
    modalTiempo.classList.remove('oculto');
    document.getElementById('correo-tiempo').value = ""; 
    document.getElementById('mensaje-tiempo').innerHTML = "";
}

document.getElementById('cerrar-compra').addEventListener('click', () => modalCompra.classList.add('oculto'));
document.getElementById('cerrar-tiempo').addEventListener('click', () => modalTiempo.classList.add('oculto'));

// LOGICA DE CUADRITOS YAPE
otpBoxes.forEach((box, index) => {
    box.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
        if(e.target.value && index < otpBoxes.length - 1) otpBoxes[index + 1].focus();
    });
    box.addEventListener('keydown', (e) => {
        if(e.key === 'Backspace' && !e.target.value && index > 0) otpBoxes[index - 1].focus();
    });
});

function validarCorreoCompra() {
    const correo = correoCompraInput.value.trim();
    if(correo === "" || !correo.includes("@")) {
        correoCompraInput.style.borderColor = "#DC2626"; alertaCorreo.style.display = "block"; return false;
    }
    correoCompraInput.style.borderColor = "#E5E7EB"; alertaCorreo.style.display = "none"; return correo;
}

// =====================================
// PROCESAR PAGOS
// =====================================
document.getElementById('btn-confirmar-yape').addEventListener('click', async () => {
    const correo = validarCorreoCompra();
    if(!correo) return mostrarNotificacion('Por favor, ingresa un correo válido.');
    
    const operacion = Array.from(otpBoxes).map(box => box.value).join('');
    if(operacion.length < 7) return mostrarNotificacion("Ingresa los 7 números de operación completos.");

    const btn = document.getElementById('btn-confirmar-yape');
    btn.innerText = "Procesando..."; btn.disabled = true;

    await supabaseClient.from('usuarios_canva').insert([{ 
        correo: correo, servicio: productoSeleccionado.nombre, metodo_pago: 'Yape', num_operacion: operacion, estado: 'Pendiente' 
    }]);

    const mensaje = `Hola, acabo de pagar *S/ ${productoSeleccionado.precio.toFixed(2)}* por *${productoSeleccionado.nombre}* vía Yape.\n\n📧 *Mi correo:* ${correo}\n🧾 *N° de Operación:* ${operacion}\n\nPor favor, actívame el servicio.`;
    window.open(`https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensaje)}`, '_blank');
    
    modalCompra.classList.add('oculto');
    btn.innerText = `Confirmar Pago de S/ ${productoSeleccionado.precio.toFixed(2)}`; btn.disabled = false;
});

document.getElementById('btn-otro-medio').addEventListener('click', async () => {
    const correo = validarCorreoCompra();
    if(!correo) return mostrarNotificacion('Ingresa un correo válido antes de continuar.');
    
    const token = "TK-" + Math.random().toString(36).substr(2, 4).toUpperCase();
    const btn = document.getElementById('btn-otro-medio');
    btn.innerText = "Generando Token..."; btn.disabled = true;

    await supabaseClient.from('usuarios_canva').insert([{ 
        correo: correo, servicio: productoSeleccionado.nombre, metodo_pago: 'Otro (Plin/BCP)', token: token, estado: 'Pendiente' 
    }]);

    const mensaje = `Hola, quiero adquirir *${productoSeleccionado.nombre}* por S/${productoSeleccionado.precio.toFixed(2)}. Mi correo es: *${correo}*.\n\nNo tengo Yape, quiero pagar por otro medio. Mi token es: *${token}*`;
    window.open(`https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensaje)}`, '_blank');
    
    modalCompra.classList.add('oculto');
    btn.innerText = "Pagar con Plin / BCP / BBVA"; btn.disabled = false;
});

// =====================================
// BUSCAR TIEMPO RESTANTE
// =====================================
document.getElementById('btn-buscar-tiempo').addEventListener('click', async () => {
    const correo = document.getElementById('correo-tiempo').value.trim();
    const msj = document.getElementById('mensaje-tiempo');
    if(correo === "" || !correo.includes("@")) return mostrarNotificacion("Ingresa un correo válido.");
    
    const btn = document.getElementById('btn-buscar-tiempo');
    btn.innerText = "Buscando..."; btn.disabled = true;
    
    const { data } = await supabaseClient.from('usuarios_canva').select('*').eq('correo', correo).order('creado_en', { ascending: false });
    btn.innerText = "Buscar mi tiempo"; btn.disabled = false;

    if (data && data.length > 0) {
        let usuario = data[0]; 
        if (usuario.estado === 'Activo') {
            let hoy = new Date(); let fin = new Date(usuario.fecha_fin);
            let dias = Math.ceil((fin.getTime() - hoy.getTime()) / (1000 * 3600 * 24));
            
            if (dias > 0) {
                msj.innerHTML = `✅ Tu <b>${usuario.servicio || 'Servicio'}</b> está activo.<br><br>Te quedan <strong style="color:var(--primary); font-size:26px;">${dias} días</strong>.`;
            } else {
                msj.innerHTML = `⚠️ Tu suscripción de <b>${usuario.servicio || 'Servicio'}</b> ha vencido.<br>Renuévala desde el catálogo.`;
            }
        } else {
            msj.innerHTML = `⏳ Tu pago por <b>${usuario.servicio || 'Servicio'}</b> está <strong>Pendiente de revisión</strong>.<br>En breve te activaremos.`;
        }
    } else {
        msj.innerHTML = `❌ No encontramos ninguna compra registrada con:<br><b>${correo}</b>`;
    }
});

// INICIAR: Cargar servicios al abrir la página
cargarCatalogo();
