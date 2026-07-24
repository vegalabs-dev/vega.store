// 1. INICIALIZAR SUPABASE
// Variable para guardar los productos y no saturar la base de datos
let catalogoGlobal = [];
const supabaseUrl = 'https://rhuhuvevynovfekwhlhb.supabase.co';
const supabaseKey = 'sb_publishable_-8XCScnvNf6QXMsnbyJK9Q_XhrOr9j5';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

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
        const { data: servicios, error } = await supabaseClient
            .from('servicios')
            .select('*')
            .order('id', { ascending: true });

        if (error) throw error;

        catalogoGlobal = servicios;
        
        // Generar los botones de categorías dinámicamente
        generarBotonesCategorias(catalogoGlobal);
        
        renderizarCatalogo(catalogoGlobal);

    } catch (error) {
        console.error("Error al cargar catálogo:", error);
        document.getElementById('contenedor-servicios').innerHTML = 
            '<p style="color: red; text-align: center; grid-column: 1/-1;">Error al cargar los servicios.</p>';
    }
}

// NUEVA FUNCIÓN: Crea los botones de filtro automáticamente
function generarBotonesCategorias(servicios) {
    const contenedorFiltros = document.getElementById('filtros-categorias');
    if (!contenedorFiltros) return;

    // Extraer las categorías de la BD sin repetirlas y quitar las que estén vacías
    const categoriasUnicas = [...new Set(servicios.map(s => s.categoria).filter(Boolean))];

    // Crear el botón de "Todos" por defecto
    let html = `<button class="pill active" onclick="filtrarCategoria('Todos')">Todos</button>`;
    
    // Crear un botón por cada categoría que exista
    categoriasUnicas.forEach(cat => {
        html += `<button class="pill" onclick="filtrarCategoria('${cat}')">${cat}</button>`;
    });

    contenedorFiltros.innerHTML = html;
}

// 2. Función para dibujar las tarjetas en el HTML (VERSIÓN MINIMALISTA)
function renderizarCatalogo(serviciosParaMostrar) {
    const contenedor = document.getElementById('contenedor-servicios');
    contenedor.innerHTML = ''; 

    if (serviciosParaMostrar.length === 0) {
        contenedor.innerHTML = '<p style="text-align: center; grid-column: 1/-1; color: var(--text-light);">No se encontraron servicios en esta categoría.</p>';
        return;
    }

    serviciosParaMostrar.forEach(servicio => {
        // Lógica de Precios (Normal vs Oferta)
        let precioNormal = parseFloat(servicio.precio);
        let precioOferta = servicio.precio_promocional ? parseFloat(servicio.precio_promocional) : null;
        
        let htmlPrecio = '';
        if (precioOferta && precioOferta < precioNormal) {
            htmlPrecio = `<span class="precio-tachado">S/ ${precioNormal.toFixed(2)}</span><br><span class="precio-oferta">S/ ${precioOferta.toFixed(2)}</span> <span style="font-size:12px; color:#6B7280;">/ ${servicio.duracion || 'Mes'}</span>`;
        } else {
            htmlPrecio = `S/ ${precioNormal.toFixed(2)} <span style="font-size:12px; color:#6B7280;">/ ${servicio.duracion || 'Mes'}</span>`;
        }

        // Lógica de Imagen (Clickeable)
        const servicioJSON = JSON.stringify(servicio).replace(/'/g, "&apos;");
        const imagenHtml = servicio.imagen_url 
            ? `<img src="${servicio.imagen_url}" class="card-img-top" alt="${servicio.nombre}" onclick='abrirModalDetalles(${servicioJSON})'>`
            : `<div class="card-img-top" style="display:flex; align-items:center; justify-content:center; color:#64748b; font-size:12px;" onclick='abrirModalDetalles(${servicioJSON})'>Sin imagen</div>`;

        // Construimos la tarjeta minimalista
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            ${imagenHtml}
            ${servicio.etiqueta ? `<div class="badge">${servicio.etiqueta}</div>` : ''}
            <h2 style="font-size: 18px; margin-bottom: 5px;">${servicio.nombre}</h2>
            <div class="price" style="margin-bottom: 0;">${htmlPrecio}</div>
            
            <div class="card-botones-mini">
                <button class="btn-detalles" onclick='abrirModalDetalles(${servicioJSON})'>Detalles</button>
                <button class="btn-primary" onclick='prepararCompra(${servicioJSON})'>Comprar</button>
            </div>
        `;
        contenedor.appendChild(card);
    });
}

// NUEVA FUNCIÓN: Abrir el modal de Detalles
window.abrirModalDetalles = function(servicio) {
    const modal = document.getElementById('modal-detalles');
    
    // Llenar datos
    const img = document.getElementById('detalles-imagen');
    if(servicio.imagen_url) { img.src = servicio.imagen_url; img.style.display = 'block'; } 
    else { img.style.display = 'none'; }
    
    const badge = document.getElementById('detalles-badge');
    if(servicio.etiqueta) { badge.innerText = servicio.etiqueta; badge.style.display = 'inline-block'; } 
    else { badge.style.display = 'none'; }
    
    document.getElementById('detalles-titulo').innerText = servicio.nombre;
    
    // Calcular precios para el modal
    let precioNormal = parseFloat(servicio.precio);
    let precioOferta = servicio.precio_promocional ? parseFloat(servicio.precio_promocional) : null;
    let htmlPrecio = '';
    
    if (precioOferta && precioOferta < precioNormal) {
        htmlPrecio = `<span class="precio-tachado">S/ ${precioNormal.toFixed(2)}</span> <span class="precio-oferta">S/ ${precioOferta.toFixed(2)}</span> <span style="font-size:14px; color:#6B7280;">/ ${servicio.duracion || 'Mes'}</span>`;
    } else {
        htmlPrecio = `<span style="font-size: 24px; font-weight: bold; color: var(--primary);">S/ ${precioNormal.toFixed(2)}</span> <span style="font-size:14px; color:#6B7280;">/ ${servicio.duracion || 'Mes'}</span>`;
    }
    document.getElementById('detalles-precio-box').innerHTML = htmlPrecio;
    
    // Llenar características
    const listaCaract = document.getElementById('detalles-caracteristicas');
    if(servicio.caracteristicas) {
        listaCaract.innerHTML = servicio.caracteristicas.split('\n').map(c => `<li style="margin-bottom: 8px;">✔️ ${c}</li>`).join('');
    } else {
        listaCaract.innerHTML = '<li>✔️ Acceso garantizado y soporte.</li>';
    }
    
    // Botón comprar
    const servicioJSON = JSON.stringify(servicio).replace(/'/g, "&apos;");
    document.getElementById('detalles-btn-comprar').innerHTML = `<button class="btn-primary" style="width: 100%; padding: 15px; font-size: 16px;" onclick='document.getElementById("modal-detalles").classList.add("oculto"); prepararCompra(${servicioJSON});'>Comprar ahora</button>`;
    
    // Mostrar modal
    modal.classList.remove('oculto');
};

// Cerrar el modal de detalles
document.getElementById('cerrar-detalles').addEventListener('click', () => {
    document.getElementById('modal-detalles').classList.add('oculto');
});
// 3. Función que se activa al hacer clic en las píldoras (Filtros)
window.filtrarCategoria = function(categoriaSeleccionada) {
    const botones = document.querySelectorAll('.category-filters .pill');
    botones.forEach(btn => {
        if(btn.innerText.trim() === categoriaSeleccionada) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    if (categoriaSeleccionada === 'Todos') {
        renderizarCatalogo(catalogoGlobal);
    } else {
        const filtrados = catalogoGlobal.filter(servicio => 
            servicio.categoria && servicio.categoria.toLowerCase() === categoriaSeleccionada.toLowerCase()
        );
        renderizarCatalogo(filtrados);
    }
};

// 4. Lógica para la barra de búsqueda superior
document.addEventListener('DOMContentLoaded', () => {
    const buscador = document.querySelector('input[placeholder="Buscar servicios..."]');
    if(buscador) {
        buscador.addEventListener('input', (e) => {
            const texto = e.target.value.toLowerCase();
            const filtrados = catalogoGlobal.filter(servicio => 
                servicio.nombre.toLowerCase().includes(texto)
            );
            renderizarCatalogo(filtrados);
            
            document.querySelectorAll('.category-filters .pill').forEach(btn => btn.classList.remove('active'));
        });
    }
});

// =====================================
// DELEGACIÓN DE EVENTOS (CLICS INFALIBLES)
// =====================================
document.addEventListener('click', function(e) {
    // CLIC EN "CONSULTAR MI SERVICIO"
    if (e.target && e.target.classList.contains('btn-consultar-dinamico')) {
        modalTiempo.classList.remove('oculto');
        document.getElementById('correo-tiempo').value = ""; 
        document.getElementById('mensaje-tiempo').innerHTML = "";
    }
});

// =====================================
// CERRAR MODALES Y LÓGICA DE CUADRITOS YAPE
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

// FUNCIÓN MOSTRAR NOTIFICACIÓN
function mostrarNotificacion(mensaje) {
    alert(mensaje); 
}

// INICIAR: Cargar catálogo
cargarCatalogo();
