// 1. INICIALIZAR SUPABASE
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
async function cargarCatalogo() {
    try {
        const { data: servicios, error } = await supabaseClient
            .from('servicios')
            .select('*')
            .order('id', { ascending: true });

        if (error) throw error;

        catalogoGlobal = servicios;
        generarBotonesCategorias(catalogoGlobal);
        renderizarCatalogo(catalogoGlobal);

    } catch (error) {
        console.error("Error al cargar catálogo:", error);
        document.getElementById('contenedor-servicios').innerHTML = 
            '<p style="color: red; text-align: center; grid-column: 1/-1;">Error al cargar los servicios.</p>';
    }
}

function generarBotonesCategorias(servicios) {
    const contenedorFiltros = document.getElementById('filtros-categorias');
    if (!contenedorFiltros) return;

    const categoriasUnicas = [...new Set(servicios.map(s => s.categoria).filter(Boolean))];
    let html = `<button class="pill active" onclick="filtrarCategoria('Todos')">Todos</button>`;
    
    categoriasUnicas.forEach(cat => {
        html += `<button class="pill" onclick="filtrarCategoria('${cat}')">${cat}</button>`;
    });

    contenedorFiltros.innerHTML = html;
}

// 2. FUNCIÓN DE TARJETAS MINIMALISTAS (Oculta la lista y muestra ofertas)
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

        const servicioJSON = JSON.stringify(servicio).replace(/'/g, "&apos;");
        const imagenHtml = servicio.imagen_url 
            ? `<img src="${servicio.imagen_url}" class="card-img-top" alt="${servicio.nombre}" onclick='abrirModalDetalles(${servicioJSON})'>`
            : `<div class="card-img-top" style="display:flex; align-items:center; justify-content:center; color:#64748b; font-size:12px;" onclick='abrirModalDetalles(${servicioJSON})'>Sin imagen</div>`;

        // Tarjeta sin la lista de características y con dos botones
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
                <button class="btn-primary" style="flex: 1; padding: 10px; font-size: 14px;" onclick='prepararCompra(${servicioJSON})'>Comprar</button>
            </div>
        `;
        contenedor.appendChild(card);
    });
}

// 3. NUEVA FUNCIÓN: Abrir el modal de Detalles
window.abrirModalDetalles = function(servicio) {
    const modal = document.getElementById('modal-detalles');
    
    const img = document.getElementById('detalles-imagen');
    if(servicio.imagen_url) { img.src = servicio.imagen_url; img.style.display = 'block'; } 
    else { img.style.display = 'none'; }
    
    const badge = document.getElementById('detalles-badge');
    if(servicio.etiqueta) { 
        badge.innerText = servicio.etiqueta; 
        badge.style.display = 'inline-block'; 
        badge.style.background = 'var(--primary-gradient)';
        badge.style.color = 'white';
        badge.style.padding = '6px 16px';
        badge.style.borderRadius = '20px';
        badge.style.fontSize = '13px';
        badge.style.fontWeight = '700';
    } else { badge.style.display = 'none'; }
    
    document.getElementById('detalles-titulo').innerText = servicio.nombre;
    
    let precioNormal = parseFloat(servicio.precio);
    let precioOferta = servicio.precio_promocional ? parseFloat(servicio.precio_promocional) : null;
    let htmlPrecio = '';
    
    if (precioOferta && precioOferta < precioNormal) {
        htmlPrecio = `<span class="precio-tachado" style="text-decoration: line-through; color: #9CA3AF; margin-right: 10px;">S/ ${precioNormal.toFixed(2)}</span> <span class="precio-oferta" style="color: #10B981; font-size: 28px; font-weight: bold;">S/ ${precioOferta.toFixed(2)}</span> <span style="font-size:14px; color:#6B7280;">/ ${servicio.duracion || 'Mes'}</span>`;
    } else {
        htmlPrecio = `<span style="font-size: 28px; font-weight: bold; color: var(--text-dark);">S/ ${precioNormal.toFixed(2)}</span> <span style="font-size:14px; color:#6B7280;">/ ${servicio.duracion || 'Mes'}</span>`;
    }
    document.getElementById('detalles-precio-box').innerHTML = htmlPrecio;
    
    const listaCaract = document.getElementById('detalles-caracteristicas');
    if(servicio.caracteristicas) {
        listaCaract.innerHTML = servicio.caracteristicas.split('\n').map(c => `<li style="margin-bottom: 10px; display: flex; gap: 8px; color: var(--text-light);"><span style="color: #10B981;">✔️</span> ${c}</li>`).join('');
    } else {
        listaCaract.innerHTML = '<li style="margin-bottom: 10px; display: flex; gap: 8px; color: var(--text-light);"><span style="color: #10B981;">✔️</span> Acceso garantizado y soporte.</li>';
    }
    
    const servicioJSON = JSON.stringify(servicio).replace(/'/g, "&apos;");
    document.getElementById('detalles-btn-comprar').innerHTML = `<button class="btn-primary" style="width: 100%; padding: 15px; font-size: 16px; margin-top: 10px;" onclick='document.getElementById("modal-detalles").classList.add("oculto"); prepararCompra(${servicioJSON});'>Comprar ahora</button>`;
    
    modal.classList.remove('oculto');
};

document.getElementById('cerrar-detalles').addEventListener('click', () => {
    document.getElementById('modal-detalles').classList.add('oculto');
});

// =====================================
// RESTO DEL CÓDIGO (No modificado)
// =====================================
window.prepararCompra = function(servicio) {
    productoSeleccionado = {
        nombre: servicio.nombre,
        precio: servicio.precio_promocional ? parseFloat(servicio.precio_promocional) : parseFloat(servicio.precio),
        meses: servicio.duracion === 'Pago Único' ? 0 : (parseInt(servicio.duracion) || 1),
        tipo_ingreso: servicio.tipo_ingreso || 'correo' 
    };
    
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
};

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

document.addEventListener('click', function(e) {
    if (e.target && e.target.classList.contains('btn-consultar-dinamico')) {
        modalTiempo.classList.remove('oculto');
        document.getElementById('correo-tiempo').value = ""; 
        document.getElementById('mensaje-tiempo').innerHTML = "";
    }
});

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

function mostrarNotificacion(mensaje) {
    alert(mensaje); 
}

cargarCatalogo();
