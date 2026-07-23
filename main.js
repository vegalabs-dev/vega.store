// 1. INICIALIZAR SUPABASE
// Variable para guardar los productos y no saturar la base de datos
let catalogoGlobal = [];
const supabaseUrl = 'https://rhuhuvevynovfekwhlhb.supabase.co';
const supabaseKey = 'sb_publishable_-8XCScnvNf6QXMsnbyJK9Q_XhrOr9j5';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

let serviciosData = []; 
let productoSeleccionado = { nombre: '', precio: 0, meses: 1, tipo_ingreso: 'correo' };
const numeroWhatsApp = "51928293163"; 

const modalCompra = document.getElementById('modal-compra');
const modalTiempo = document.getElementById('modal-tiempo');
const inputDatoCompra = document.getElementById('correo-compra');
const alertaDato = document.getElementById('alerta-correo');
const otpBoxes = document.querySelectorAll('.otp-box');

// =====================================
// CARGAR CATÁLOGO
// =====================================
// 1. Función para descargar los datos de Supabase
async function cargarCatalogo() {
    try {
        // Seleccionamos todo, incluyendo las nuevas columnas 'categoria' e 'imagen_url'
        const { data: servicios, error } = await supabaseClient
            .from('servicios')
            .select('*')
            .order('id', { ascending: true });

        if (error) throw error;

        // Guardamos los datos en nuestra variable global
        catalogoGlobal = servicios;
        
        // Renderizamos todos los productos por defecto
        renderizarCatalogo(catalogoGlobal);

    } catch (error) {
        console.error("Error al cargar catálogo:", error);
        document.getElementById('contenedor-servicios').innerHTML = 
            '<p style="color: red; text-align: center; grid-column: 1/-1;">Error al cargar los servicios.</p>';
    }
}

// 2. Función para dibujar las tarjetas en el HTML
function renderizarCatalogo(serviciosParaMostrar) {
    const contenedor = document.getElementById('contenedor-servicios');
    contenedor.innerHTML = ''; // Limpiamos el contenedor

    if (serviciosParaMostrar.length === 0) {
        contenedor.innerHTML = '<p style="text-align: center; grid-column: 1/-1; color: var(--text-light);">No se encontraron servicios en esta categoría.</p>';
        return;
    }

    serviciosParaMostrar.forEach(servicio => {
        // Si no hay imagen en la BD, ponemos un fondo gris o una imagen por defecto
        const imagenHtml = servicio.imagen_url 
            ? `<img src="${servicio.imagen_url}" class="card-img-top" alt="${servicio.nombre}">`
            : `<div class="card-img-top" style="display:flex; align-items:center; justify-content:center; background:#e2e8f0; color:#64748b;">Sin imagen</div>`;

        // Construimos la tarjeta (respetando tus botones y modales originales)
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            ${imagenHtml}
            <div class="badge">${servicio.etiqueta || 'Estándar'}</div>
            <h2>${servicio.nombre}</h2>
            <div class="price">S/ ${servicio.precio} <span>/ ${servicio.duracion || 'Mes'}</span></div>
            <ul class="features">
                ${servicio.caracteristicas ? servicio.caracteristicas.split('\n').map(c => `<li>✔️ ${c}</li>`).join('') : '<li>✔️ Acceso garantizado</li>'}
            </ul>
            <div class="buttons">
                <!-- Mantengo tu lógica exacta para abrir el modal de compra -->
                <button class="btn-primary" onclick="abrirModalCompra('${servicio.nombre}', ${servicio.precio})">Comprar ahora</button>
            </div>
        `;
        contenedor.appendChild(card);
    });
}

// 3. Función que se activa al hacer clic en las píldoras (Filtros)
window.filtrarCategoria = function(categoriaSeleccionada) {
    // Actualizar el estilo visual de los botones (píldoras)
    const botones = document.querySelectorAll('.category-filters .pill');
    botones.forEach(btn => {
        if(btn.innerText.trim() === categoriaSeleccionada) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Filtrar el catálogo global
    if (categoriaSeleccionada === 'Todos') {
        renderizarCatalogo(catalogoGlobal);
    } else {
        const filtrados = catalogoGlobal.filter(servicio => 
            servicio.categoria && servicio.categoria.toLowerCase() === categoriaSeleccionada.toLowerCase()
        );
        renderizarCatalogo(filtrados);
    }
};

// 4. Lógica para la barra de búsqueda superior (Opcional, pero muy recomendado)
document.addEventListener('DOMContentLoaded', () => {
    const buscador = document.querySelector('input[placeholder="Buscar servicios..."]');
    if(buscador) {
        buscador.addEventListener('input', (e) => {
            const texto = e.target.value.toLowerCase();
            const filtrados = catalogoGlobal.filter(servicio => 
                servicio.nombre.toLowerCase().includes(texto)
            );
            renderizarCatalogo(filtrados);
            
            // Quitar la clase active de todas las píldoras al buscar por texto
            document.querySelectorAll('.category-filters .pill').forEach(btn => btn.classList.remove('active'));
        });
    }
});

// =====================================
// DELEGACIÓN DE EVENTOS (CLICS INFALIBLES)
// =====================================
document.addEventListener('click', function(e) {
    
    // CLIC EN "OBTENERLO AHORA"
    if (e.target && e.target.classList.contains('btn-obtener-dinamico')) {
        const servIndex = e.target.getAttribute('data-index');
        productoSeleccionado = serviciosData[servIndex].seleccion_actual;
        
        let txtMeses = productoSeleccionado.meses == 0 ? "Pago Único" : (productoSeleccionado.meses == 1 ? "1 Mes" : `${productoSeleccionado.meses} Meses`);
        
        document.getElementById('titulo-producto-modal').innerText = `Comprando: ${productoSeleccionado.nombre} (${txtMeses})`;
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
        inputDatoCompra.value = ""; 
        inputDatoCompra.style.borderColor = "#E5E7EB"; 
        alertaDato.style.display = "none";
        otpBoxes.forEach(box => box.value = ''); 
    }

    // CLIC EN "CONSULTAR MI SERVICIO"
    if (e.target && e.target.classList.contains('btn-consultar-dinamico')) {
        modalTiempo.classList.remove('oculto');
        document.getElementById('correo-tiempo').value = ""; 
        document.getElementById('mensaje-tiempo').innerHTML = "";
    }
});

// =====================================
// CERRAR MODALES Y LÓGICA DE CUADRITOS
// =====================================
document.getElementById('cerrar-compra').addEventListener('click', () => modalCompra.classList.add('oculto'));
document.getElementById('cerrar-tiempo').addEventListener('click', () => modalTiempo.classList.add('oculto'));

otpBoxes.forEach((box, index) => {
    box.addEventListener('input', (e) => { 
        e.target.value = e.target.value.replace(/[^0-9]/g, ''); 
        if(e.target.value && index < otpBoxes.length - 1) otpBoxes[index + 1].focus(); 
    });
    box.addEventListener('keydown', (e) => { 
        if(e.key === 'Backspace' && !e.target.value && index > 0) otpBoxes[index - 1].focus(); 
    });
});

function validarDatoCompra() {
    const dato = inputDatoCompra.value.trim();
    let esValido = false;

    if (productoSeleccionado.tipo_ingreso === 'numero') {
        const numLimpio = dato.replace(/\D/g,'');
        esValido = numLimpio.length >= 9;
    } else {
        esValido = dato !== "" && dato.includes("@");
    }

    if(!esValido) { 
        inputDatoCompra.style.borderColor = "#DC2626"; 
        alertaDato.style.display = "block"; 
        return false; 
    }
    
    inputDatoCompra.style.borderColor = "#E5E7EB"; 
    alertaDato.style.display = "none"; 
    return dato;
}

// =====================================
// PROCESAR PAGOS
// =====================================
document.getElementById('btn-confirmar-yape').addEventListener('click', async () => {
    const datoCliente = validarDatoCompra(); 
    if(!datoCliente) return mostrarNotificacion('Ingresa el dato solicitado correctamente.');
    
    const operacion = Array.from(otpBoxes).map(box => box.value).join('');
    if(operacion.length < 7) return mostrarNotificacion("Ingresa los 7 números de operación.");

    const btn = document.getElementById('btn-confirmar-yape'); 
    btn.innerText = "Procesando..."; 
    btn.disabled = true;

    await supabaseClient.from('usuarios_canva').insert([{ 
        correo: datoCliente, 
        servicio: productoSeleccionado.nombre, 
        meses: productoSeleccionado.meses, 
        metodo_pago: 'Yape', 
        num_operacion: operacion, 
        estado: 'Pendiente' 
    }]);

    let txtMesesMsg = productoSeleccionado.meses == 0 ? "Pago Único" : `${productoSeleccionado.meses} Meses`;
    let tipoDatoMsg = productoSeleccionado.tipo_ingreso === 'numero' ? '📱 *Mi número:*' : '📧 *Mi correo:*';

    const mensaje = `Hola, acabo de pagar *S/ ${productoSeleccionado.precio.toFixed(2)}* por *${productoSeleccionado.nombre} (${txtMesesMsg})* vía Yape.\n\n${tipoDatoMsg} ${datoCliente}\n🧾 *N° de Operación:* ${operacion}`;
    window.open(`https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensaje)}`, '_blank');
    
    modalCompra.classList.add('oculto'); 
    btn.innerText = `Confirmar Pago de S/ ${productoSeleccionado.precio.toFixed(2)}`; 
    btn.disabled = false;
});

document.getElementById('btn-otro-medio').addEventListener('click', async () => {
    const datoCliente = validarDatoCompra(); 
    if(!datoCliente) return mostrarNotificacion('Ingresa el dato solicitado antes de continuar.');
    
    const token = "TK-" + Math.random().toString(36).substr(2, 4).toUpperCase();
    const btn = document.getElementById('btn-otro-medio'); 
    btn.innerText = "Generando..."; 
    btn.disabled = true;

    await supabaseClient.from('usuarios_canva').insert([{ 
        correo: datoCliente, 
        servicio: productoSeleccionado.nombre, 
        meses: productoSeleccionado.meses, 
        metodo_pago: 'Otro (Plin/BCP)', 
        token: token, 
        estado: 'Pendiente' 
    }]);

    let txtMesesMsg = productoSeleccionado.meses == 0 ? "Pago Único" : `${productoSeleccionado.meses} Meses`;
    let tipoDatoMsg = productoSeleccionado.tipo_ingreso === 'numero' ? 'Mi número es:' : 'Mi correo es:';

    const mensaje = `Hola, quiero adquirir *${productoSeleccionado.nombre} (${txtMesesMsg})* por S/${productoSeleccionado.precio.toFixed(2)}. ${tipoDatoMsg} *${datoCliente}*. Mi token es: *${token}*`;
    window.open(`https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensaje)}`, '_blank');
    
    modalCompra.classList.add('oculto'); 
    btn.innerText = "Pagar con Plin / BCP / BBVA"; 
    btn.disabled = false;
});

// =====================================
// CONSULTA DE TIEMPO
// =====================================
document.getElementById('btn-buscar-tiempo').addEventListener('click', async () => {
    const datoBuscado = document.getElementById('correo-tiempo').value.trim();
    const msj = document.getElementById('mensaje-tiempo');
    if(datoBuscado === "") return mostrarNotificacion("Ingresa tu correo o número.");
    
    const btn = document.getElementById('btn-buscar-tiempo'); 
    btn.innerText = "Buscando..."; 
    btn.disabled = true;
    
    const { data } = await supabaseClient.from('usuarios_canva').select('*').eq('correo', datoBuscado).order('creado_en', { ascending: false });
    
    btn.innerText = "Buscar mi tiempo"; 
    btn.disabled = false;

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
        } else {
            msj.innerHTML = `⏳ Tu pago por <b>${usuario.servicio || 'Servicio'}</b> está <strong>Pendiente</strong>.`;
        }
    } else {
        msj.innerHTML = `❌ No encontramos compras registradas con este dato.`;
    }
});

// INICIAR: Cargar catálogo
cargarCatalogo();
