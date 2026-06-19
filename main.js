// 1. INICIALIZAR SUPABASE
const supabaseUrl = 'https://rhuhuvevynovfekwhlhb.supabase.co';
const supabaseKey = 'sb_publishable_-8XCScnvNf6QXMsnbyJK9Q_XhrOr9j5';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// 2. CAPTURAR ELEMENTOS
const btnObtener = document.getElementById('btn-obtener');
const btnVerTiempo = document.getElementById('btn-ver-tiempo');
const modalCompra = document.getElementById('modal-compra');
const modalTiempo = document.getElementById('modal-tiempo');
const btnCerrarCompra = document.getElementById('cerrar-compra');
const btnCerrarTiempo = document.getElementById('cerrar-tiempo');

const correoCompraInput = document.getElementById('correo-compra');
const alertaCorreo = document.getElementById('alerta-correo');
const btnConfirmarYape = document.getElementById('btn-confirmar-yape');
const btnOtroMedio = document.getElementById('btn-otro-medio');
const otpBoxes = document.querySelectorAll('.otp-box');

const correoTiempoInput = document.getElementById('correo-tiempo');
const btnBuscarTiempo = document.getElementById('btn-buscar-tiempo');
const mensajeTiempo = document.getElementById('mensaje-tiempo');

const btnDescargarQR = document.getElementById('btn-descargar-qr');
const numeroWhatsApp = "51928293163"; 

// =====================================
// FUNCIONES DE MEJORA UX (TOAST Y DESCARGA)
// =====================================

// Sistema de notificaciones elegante
function mostrarNotificacion(mensaje, tipo = 'error') {
    const contenedor = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.innerHTML = tipo === 'error' ? `⚠️ ${mensaje}` : `✅ ${mensaje}`;
    
    contenedor.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// Mostrar notificación al descargar QR (Descarga manejada por HTML ahora)
btnDescargarQR.addEventListener('click', () => {
    mostrarNotificacion('Descargando código QR a tu dispositivo...', 'success');
});

// =====================================
// LÓGICA DE MODALES Y CUADRITOS
// =====================================

btnObtener.addEventListener('click', () => {
    modalCompra.classList.remove('oculto');
    correoCompraInput.value = ""; 
    correoCompraInput.style.borderColor = "#E5E7EB";
    alertaCorreo.style.display = "none";
    otpBoxes.forEach(box => box.value = ''); 
});

btnVerTiempo.addEventListener('click', () => {
    modalTiempo.classList.remove('oculto');
    correoTiempoInput.value = ""; 
    mensajeTiempo.innerHTML = "";
});

btnCerrarCompra.addEventListener('click', () => modalCompra.classList.add('oculto'));
btnCerrarTiempo.addEventListener('click', () => modalTiempo.classList.add('oculto'));

otpBoxes.forEach((box, index) => {
    box.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
        if(e.target.value && index < otpBoxes.length - 1) {
            otpBoxes[index + 1].focus();
        }
    });
    box.addEventListener('keydown', (e) => {
        if(e.key === 'Backspace' && !e.target.value && index > 0) {
            otpBoxes[index - 1].focus();
        }
    });
});

function validarCorreoCompra() {
    const correo = correoCompraInput.value.trim();
    if(correo === "" || !correo.includes("@")) {
        correoCompraInput.style.borderColor = "#DC2626";
        alertaCorreo.style.display = "block";
        return false;
    }
    correoCompraInput.style.borderColor = "#E5E7EB";
    alertaCorreo.style.display = "none";
    return correo;
}

// =====================================
// PROCESAR PAGOS Y BUSCAR TIEMPO
// =====================================

btnConfirmarYape.addEventListener('click', async () => {
    const correo = validarCorreoCompra();
    if(!correo) return mostrarNotificacion('Por favor, ingresa un correo válido.');

    const operacion = Array.from(otpBoxes).map(box => box.value).join('');
    
    if(operacion.length < 7) {
        return mostrarNotificacion("Ingresa los 7 números de operación completos.");
    }

    btnConfirmarYape.innerText = "Procesando...";
    btnConfirmarYape.disabled = true;

    await supabaseClient.from('usuarios_canva').insert([{ 
        correo: correo, metodo_pago: 'Yape', num_operacion: operacion, estado: 'Pendiente' 
    }]);

    const mensaje = `Hola, acabo de pagar *S/ 3.00* por Canva Edu vía Yape.\n\n📧 *Mi correo:* ${correo}\n🧾 *N° de Operación:* ${operacion}\n\nPor favor, actívame el servicio.`;
    window.open(`https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensaje)}`, '_blank');
    
    modalCompra.classList.add('oculto');
    btnConfirmarYape.innerText = "Confirmar Pago de S/ 3.00";
    btnConfirmarYape.disabled = false;
});

btnOtroMedio.addEventListener('click', async () => {
    const correo = validarCorreoCompra();
    if(!correo) return mostrarNotificacion('Ingresa un correo válido antes de continuar.');
    
    const token = "TK-" + Math.random().toString(36).substr(2, 4).toUpperCase();
    
    btnOtroMedio.innerText = "Generando Token...";
    btnOtroMedio.disabled = true;

    await supabaseClient.from('usuarios_canva').insert([{ 
        correo: correo, metodo_pago: 'Otro (Plin/BCP)', token: token, estado: 'Pendiente' 
    }]);

    const mensaje = `Hola, quiero adquirir Canva Edu por S/3.00. Mi correo es: *${correo}*.\n\nNo tengo Yape, quiero pagar por otro medio. Mi token es: *${token}*`;
    window.open(`https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensaje)}`, '_blank');
    
    modalCompra.classList.add('oculto');
    btnOtroMedio.innerText = "Pagar con Plin / BCP / BBVA";
    btnOtroMedio.disabled = false;
});

btnBuscarTiempo.addEventListener('click', async () => {
    const correo = correoTiempoInput.value.trim();
    if(correo === "" || !correo.includes("@")) return mostrarNotificacion("Ingresa un correo válido.");
    
    btnBuscarTiempo.innerText = "Buscando...";
    btnBuscarTiempo.disabled = true;
    
    const { data, error } = await supabaseClient
        .from('usuarios_canva').select('*').eq('correo', correo).order('creado_en', { ascending: false });

    btnBuscarTiempo.innerText = "Buscar mi tiempo";
    btnBuscarTiempo.disabled = false;

    if (data && data.length > 0) {
        let usuario = data[0]; 

        if (usuario.estado === 'Activo') {
            let hoy = new Date();
            let fin = new Date(usuario.fecha_fin);
            let diferencia = fin.getTime() - hoy.getTime();
            let dias = Math.ceil(diferencia / (1000 * 3600 * 24));
            
            if (dias > 0) {
                mensajeTiempo.innerHTML = `✅ Tu cuenta está activa.<br><br>Te quedan <strong style="color:var(--primary); font-size:26px;">${dias} días</strong> de servicio.`;
            } else {
                mensajeTiempo.innerHTML = `⚠️ Tu suscripción ha vencido.<br><br>Por favor, renuévala desde el catálogo.`;
            }
        } else {
            mensajeTiempo.innerHTML = `⏳ Tu pago está <strong>Pendiente de revisión</strong>.<br><br>En breve activaremos tu cuenta.`;
        }
    } else {
        mensajeTiempo.innerHTML = `❌ No encontramos ninguna suscripción con el correo:<br><b>${correo}</b>`;
    }
});