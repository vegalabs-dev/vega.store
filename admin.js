const supabaseClient = window.supabase.createClient('https://rhuhuvevynovfekwhlhb.supabase.co', 'sb_publishable_-8XCScnvNf6QXMsnbyJK9Q_XhrOr9j5');
const URL_TIENDA = "https://vegalabs-dev.github.io/vega.store/";

const h = VegaSecurity.escapeHtml;
let adminAuthorized = false;
let serviciosAdminGlobal = [];
let clientesGlobal = [];
let solicitudesGlobal = [];
let catalogoOpciones = [];

supabaseClient.auth.getSession().then(({ data: { session } }) => {
    if (session) mostrarPanel().catch(mostrarErrorAdmin);
});
supabaseClient.auth.onAuthStateChange((event, session) => {
    if (!session) {
        adminAuthorized = false;
        document.getElementById('admin-section').style.display = 'none';
        document.getElementById('login-section').style.display = 'block';
    }
});
function mostrarErrorAdmin(error) {
    const message = error?.message || 'No se pudo completar la operación.';
    if (!adminAuthorized) {
        const box = document.getElementById('login-error');
        box.textContent = message; box.style.display = 'block';
    } else alert(message);
}
window.addEventListener('unhandledrejection', event => {
    event.preventDefault(); mostrarErrorAdmin(event.reason);
});
async function verificarOperacion(request) {
    const result = await request;
    if (result.error) throw new Error('No se guardó la operación: ' + result.error.message);
    return result;
}

// Función para abrir modales con animación
function abrirModal(id) {
    const modal = document.getElementById(id);
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
}

// Función para cerrar modales con animación
function cerrarModal(id) {
    const modal = document.getElementById(id);
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 300);
}

function obtenerInfoDispositivo() {
    const ua = navigator.userAgent;
    let dispositivo = /Mobile|Android|iP(hone|od|ad)/.test(ua) ? "📱 Celular" : "💻 Computadora";
    return { dispositivo, navegador: "Navegador Web" };
}

async function iniciarSesion() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = document.querySelector('#login-section .btn-primary');
    btn.innerText = 'Verificando...'; btn.disabled = true;
    document.getElementById('login-error').style.display = 'none';
    try {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw new Error('Correo o contraseña incorrectos.');
        await mostrarPanel();
        document.getElementById('login-password').value = '';
        await verificarOperacion(supabaseClient.from('admin_accesos').insert([obtenerInfoDispositivo()]));
    } catch (error) { mostrarErrorAdmin(error); }
    finally { btn.innerText = 'Ingresar al Panel'; btn.disabled = false; }
}
async function cerrarSesion() {
    await supabaseClient.auth.signOut(); window.location.reload();
}
async function mostrarPanel() {
    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    const { data: allowed, error: roleError } = userData?.user && !userError
        ? await supabaseClient.rpc('is_vega_admin') : { data: false, error: userError };
    if (!allowed || roleError) {
        await supabaseClient.auth.signOut();
        throw new Error('Esta cuenta no tiene permiso para administrar VegaStore.');
    }
    adminAuthorized = true;
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('admin-section').style.display = 'block';
    await cargarDatosPrincipales();
}

function switchTab(t) {
    document.querySelectorAll('.tab-content, .tab-btn').forEach(e => e.classList.remove('active'));
    document.getElementById('tab-' + t).classList.add('active'); document.getElementById('btn-tab-' + t).classList.add('active');
    if(t === 'ventas') cargarDatosPrincipales();
    else if(t === 'solicitudes') cargarDatosPrincipales();
    else if(t === 'catalogo') cargarServicios();
    else if(t === 'papelera') cargarPapelera();
}

window.copiarTexto = function(texto) {
    navigator.clipboard.writeText(texto).then(() => alert("Copiado: " + texto)).catch(() => alert("Error al copiar"));
}

// ===== CARGAR DATOS PRINCIPALES =====
async function cargarDatosPrincipales() {
    const { data: todos } = await verificarOperacion(supabaseClient.from('usuarios_canva').select('*').neq('estado', 'Cancelado').order('creado_en', { ascending: false }));
    let todosLosRegistros = todos || [];

    clientesGlobal = todosLosRegistros.filter(u => u.estado === 'Activo');
    solicitudesGlobal = todosLosRegistros.filter(u => u.estado === 'Pendiente');

    document.getElementById('stat-activos').innerText = clientesGlobal.length;
    document.getElementById('stat-pendientes').innerText = solicitudesGlobal.length;

    const { data: catalogo } = await verificarOperacion(supabaseClient.from('servicios').select('nombre').order('nombre', { ascending: true }));
    catalogoOpciones = catalogo || [];

    const selectServicios = document.getElementById('filtro-servicio');
    selectServicios.innerHTML = '<option value="ALL">Todos los Servicios</option>';
    if (catalogo) { catalogo.forEach(s => selectServicios.innerHTML += `<option value="${h(s.nombre)}">${h(s.nombre)}</option>`); }

    filtrarClientes();
    renderizarSolicitudes();
}

function filtrarClientes() {
    let txt = document.getElementById('buscador-clientes').value.toLowerCase();
    let servFiltro = document.getElementById('filtro-servicio').value;
    let orden = document.getElementById('filtro-orden').value;

    let filtrados = clientesGlobal.filter(u => {
        let coincideTxt = (u.correo && u.correo.toLowerCase().includes(txt)) || (u.telefono && u.telefono.toLowerCase().includes(txt));
        return coincideTxt && (servFiltro === "ALL" || u.servicio === servFiltro);
    });

    if (orden === 'VENCIMIENTO') {
        filtrados.sort((a, b) => (a.fecha_fin ? new Date(a.fecha_fin).getTime() : 9999999999999) - (b.fecha_fin ? new Date(b.fecha_fin).getTime() : 9999999999999));
    }
    renderizarTablaClientes(filtrados);
}

function renderizarTablaClientes(clientes) {
    const tabla = document.getElementById('tabla-clientes'); tabla.innerHTML = '';
    if(clientes.length === 0) return tabla.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 40px; color: var(--text-muted);">No hay clientes activos.</td></tr>';

    clientes.forEach(user => {
        let diasRestantes = 0; let estadoReal = 'Activo';
        if (user.fecha_fin) {
            let hoy = new Date(); let fin = new Date(user.fecha_fin);
            diasRestantes = Math.ceil((fin.getTime() - hoy.getTime()) / (1000 * 3600 * 24));
            if (diasRestantes <= 0) estadoReal = 'Vencido';
        }

        let badge = estadoReal === 'Vencido' ? 'badge-vencido' : 'badge-activo';
        let tiempoTxt = user.meses == 0 ? "Pago Único" : `${user.meses || 1} ${user.unidad || 'Meses'}`;
        let fechaFinShow = user.fecha_fin ? user.fecha_fin : (user.meses == 0 ? '<strong style="color:var(--primary)">Permanente</strong>' : '---');

        let numWhatsApp = user.telefono ? user.telefono.replace(/[^+0-9]/g, '') : null;
        let emailCliente = user.correo;
        if (!numWhatsApp && emailCliente && !emailCliente.includes('@') && emailCliente.replace(/\D/g,'').length >= 9) {
            numWhatsApp = emailCliente.replace(/\D/g,''); emailCliente = null;
        }

        let msjContacto = ""; let nombreServicio = user.servicio || 'Servicio';
        if (estadoReal === 'Vencido') msjContacto = `Hola! Tu servicio de *${nombreServicio}* ha vencido. 😔\n\nSi deseas renovar o cambiar de plan, escríbeme por aquí o hazlo directo desde tu panel en la web:\n${URL_TIENDA}`;
        else if (user.meses == 0) msjContacto = `Hola! Te escribo de VegaStore. Tu servicio de *${nombreServicio}* está Activo y es Permanente. Gracias por la confianza! ✨\n\nPuedes ver tu cuenta aquí:\n${URL_TIENDA}`;
        else {
            if (diasRestantes > 1) msjContacto = `Hola! Te escribo de VegaStore. Tu servicio de *${nombreServicio}* está Activo. Te quedan *${diasRestantes} días* de suscripción. \n\nRecuerda que puedes ver tu cuenta y renovar desde tu panel en la web:\n${URL_TIENDA}`;
            else msjContacto = `Hola! Te escribo de VegaStore. Tu servicio de *${nombreServicio}* vence HOY. Disfruta tu último día, muchas gracias por la confianza. 😁\n\nSi deseas renovar escríbenos por este medio o hazlo desde tu panel:\n${URL_TIENDA}`;
        }

        let msjCodificado = encodeURIComponent(msjContacto);
        let telRow = numWhatsApp ? `<div style="font-size: 13px; margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">📱 <strong style="color:var(--text-main);">${h(numWhatsApp)}</strong> <a href="https://wa.me/${h(numWhatsApp)}?text=${msjCodificado}" class="btn-copiar" target="_blank" rel="noopener noreferrer" title="Enviar WhatsApp" style="background:#D1FAE5; color:#059669; border-color:#A7F3D0;">💬</a></div>` : '';
        let corRow = emailCliente ? `<div style="font-size: 12px; margin-top: 4px; display: flex; align-items: center; gap: 8px;">✉️ <span style="color: var(--text-muted);">${h(emailCliente)}</span> <button data-email="${h(emailCliente)}" onclick="copiarTexto(this.dataset.email)" class="btn-copiar" style="padding: 2px 8px; font-size: 11px;">📋 Copiar</button></div>` : '';

        tabla.innerHTML += `<tr>
            <td>${telRow} ${corRow}</td>
            <td><strong style="color:var(--text-main); font-size:15px;">${h(user.servicio)}</strong><br><span style="font-size:12px; color:var(--text-muted); font-weight:600;">${h(tiempoTxt)}</span></td>
            <td><span class="${badge}">${estadoReal}</span></td>
            <td><span style="color:var(--text-main); font-weight:500;">${fechaFinShow}</span></td>
            <td><button class="btn-gestionar" onclick="abrirGestionCliente(${user.id})">⚙️ Gestionar</button></td>
        </tr>`;
    });
}

// ===== TABLA DE SOLICITUDES =====
function renderizarSolicitudes() {
    const tabla = document.getElementById('tabla-solicitudes'); tabla.innerHTML = '';
    if(solicitudesGlobal.length === 0) return tabla.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 40px; color: var(--text-muted);">No hay solicitudes nuevas.</td></tr>';

    solicitudesGlobal.forEach(user => {
        let numWhatsApp = user.telefono ? user.telefono.replace(/[^+0-9]/g, '') : null;
        let emailCliente = user.correo;
        if (!numWhatsApp && emailCliente && !emailCliente.includes('@') && emailCliente.replace(/\D/g,'').length >= 9) { numWhatsApp = emailCliente.replace(/\D/g,''); emailCliente = null; }

        let telRow = numWhatsApp ? `<div style="font-size: 13px; margin-bottom: 4px; color:var(--text-main);">📱 <strong>${h(numWhatsApp)}</strong></div>` : '';
        let corRow = emailCliente ? `<div style="font-size: 12px; margin-top: 4px; display: flex; align-items: center; gap: 8px;">✉️ <span style="color: var(--text-muted);">${h(emailCliente)}</span> <button data-email="${h(emailCliente)}" onclick="copiarTexto(this.dataset.email)" class="btn-copiar" style="padding: 2px 8px; font-size: 11px;">📋 Copiar</button></div>` : '';
        let tiempoTxt = user.meses == 0 ? "Pago Único" : `${user.meses || 1} ${user.unidad || 'Meses'}`;

        tabla.innerHTML += `<tr>
            <td>${telRow} ${corRow}</td>
            <td><strong style="color:var(--text-main); font-size:15px;">${h(user.servicio)}</strong><br><span style="font-size:12px; color:var(--text-muted); font-weight:600;">${h(tiempoTxt)}</span></td>
            <td><strong style="color: var(--primary); background:#F5F3FF; padding:4px 8px; border-radius:6px;">${h(user.token || user.num_operacion || '---')}</strong></td>
            <td><span style="color:var(--text-muted); font-size:13px;">${new Date(user.creado_en).toLocaleString('es-PE')}</span></td>
            <td style="display:flex; gap:8px;">
                <button class="btn-aprobar" onclick="aprobarPago(${user.id})">✅ Aprobar</button>
                <button class="btn-borrar" onclick="rechazarSolicitud(${user.id})">❌ Rechazar</button>
            </td>
        </tr>`;
    });
}

async function aprobarPago(id) {
    let user = solicitudesGlobal.find(u => u.id === id);
    let cantidad = parseInt(user.meses) || 0; let unidad = user.unidad || 'meses';
    let inicioStr = new Date().toISOString().split('T')[0]; let finStr = null;
    if (cantidad > 0) {
        let fin = new Date(); if(unidad === 'dias') fin.setDate(fin.getDate() + cantidad); else if(unidad === 'años') fin.setFullYear(fin.getFullYear() + cantidad); else fin.setMonth(fin.getMonth() + cantidad);
        finStr = fin.toISOString().split('T')[0];
    }
    await verificarOperacion(supabaseClient.from('usuarios_canva').update({ estado: 'Activo', fecha_inicio: inicioStr, fecha_fin: finStr }).eq('id', id));
    cargarDatosPrincipales();
}

async function rechazarSolicitud(id) {
    if(confirm("¿Rechazar y eliminar esta solicitud?")) {
        await verificarOperacion(supabaseClient.from('usuarios_canva').delete().eq('id', id)); cargarDatosPrincipales();
    }
}

// ===== SÚPER MODAL DE GESTIÓN =====
function abrirGestionCliente(id) {
    let user = clientesGlobal.find(u => u.id === id);
    if (!user) return;
    document.getElementById('gestion-id').value = user.id;
    document.getElementById('gestion-servicio-titulo').innerText = `${user.servicio} (${user.meses == 0 ? 'Permanente' : user.meses + ' ' + (user.unidad || 'meses')})`;

    let numEdit = user.telefono ? user.telefono.replace(/[^+0-9]/g, '') : '';
    let corEdit = user.correo || '';
    if (!numEdit && corEdit && !corEdit.includes('@')) { numEdit = corEdit.replace(/\D/g,''); corEdit = ''; }

    document.getElementById('gestion-telefono').value = numEdit;
    document.getElementById('gestion-correo').value = corEdit;
    document.getElementById('enlace-cliente-box').style.display = 'none';
    abrirModal('modal-gestionar-cliente');
}

async function guardarDatosContacto() {
    let id = document.getElementById('gestion-id').value;
    let tel = document.getElementById('gestion-telefono').value.replace(/\s+/g, '');
    let cor = document.getElementById('gestion-correo').value.trim();
    await verificarOperacion(supabaseClient.from('usuarios_canva').update({ telefono: tel || null, correo: cor || null }).eq('id', id));
    alert("Contacto guardado."); cargarDatosPrincipales();
}

async function darDiasExtra() {
    let id = document.getElementById('gestion-id').value;
    let user = clientesGlobal.find(u => u.id == id);
    if (!user.fecha_fin) return alert("Es permanente.");
    let dias = prompt("¿Cuántos días extra sumar?");
    if (dias && !isNaN(dias)) {
        let nuevaFecha = new Date(user.fecha_fin); nuevaFecha.setDate(nuevaFecha.getDate() + parseInt(dias));
        await verificarOperacion(supabaseClient.from('usuarios_canva').update({ fecha_fin: nuevaFecha.toISOString().split('T')[0] }).eq('id', id));
        alert("Días sumados."); cerrarModal('modal-gestionar-cliente'); cargarDatosPrincipales();
    }
}

async function renovarServicio() {
    let id = document.getElementById('gestion-id').value;
    let user = clientesGlobal.find(u => u.id == id);
    if (user.meses == 0) return alert("Es Permanente.");
    if (confirm(`¿Renovar ${user.servicio} por ${user.meses} ${user.unidad || 'meses'} más?`)) {
        let nuevaFecha = new Date(user.fecha_fin || new Date());
        let c = parseInt(user.meses); let u = user.unidad || 'meses';
        if(u === 'dias') nuevaFecha.setDate(nuevaFecha.getDate() + c); else if(u === 'años') nuevaFecha.setFullYear(nuevaFecha.getFullYear() + c); else nuevaFecha.setMonth(nuevaFecha.getMonth() + c);
        await verificarOperacion(supabaseClient.from('usuarios_canva').update({ estado: 'Activo', fecha_fin: nuevaFecha.toISOString().split('T')[0] }).eq('id', id));
        alert("Renovado."); cerrarModal('modal-gestionar-cliente'); cargarDatosPrincipales();
    }
}

async function cambiarServicio() {
    let id = document.getElementById('gestion-id').value;
    let opcionesStr = catalogoOpciones.map((s, i) => `${i+1}. ${s.nombre}`).join('\n');
    let eleccion = prompt(`NÚMERO del nuevo servicio:\n\n${opcionesStr}`);
    if (eleccion && !isNaN(eleccion) && catalogoOpciones[parseInt(eleccion) - 1]) {
        await verificarOperacion(supabaseClient.from('usuarios_canva').update({ servicio: catalogoOpciones[parseInt(eleccion) - 1].nombre }).eq('id', id));
        alert("Cambiado."); cerrarModal('modal-gestionar-cliente'); cargarDatosPrincipales();
    }
}

async function cancelarServicio() {
    let id = document.getElementById('gestion-id').value;
    if (confirm("¿Mover a Papelera?")) {
        await verificarOperacion(supabaseClient.from('usuarios_canva').update({ estado: 'Cancelado', fecha_cancelacion: new Date().toISOString() }).eq('id', id));
        cerrarModal('modal-gestionar-cliente'); cargarDatosPrincipales();
    }
}

// ===== PAPELERA =====
async function cargarPapelera() {
    const tabla = document.getElementById('tabla-papelera'); tabla.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 40px; color: var(--text-muted);">Cargando...</td></tr>';
    const { data } = await verificarOperacion(supabaseClient.from('usuarios_canva').select('*').eq('estado', 'Cancelado').order('fecha_cancelacion', { ascending: false }));
    if(!data || data.length === 0) return tabla.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 40px; color: var(--text-muted);">Papelera vacía.</td></tr>';
    tabla.innerHTML = '';
    data.forEach(user => {
        let fechaCancel = user.fecha_cancelacion ? new Date(user.fecha_cancelacion).toLocaleString('es-PE') : '---';
        tabla.innerHTML += `<tr>
            <td><div style="font-size:13px; color:var(--text-main); font-weight:600;">${h(user.telefono || '')}</div><div style="font-size:12px; color:var(--text-muted);">${h(user.correo || '')}</div></td>
            <td><strong style="color:var(--text-main);">${h(user.servicio)}</strong></td>
            <td><span class="badge-cancelado">Cancelado</span></td>
            <td><span style="font-size:13px; color:var(--text-muted);">${fechaCancel}</span></td>
            <td><button class="btn-aprobar" onclick="restaurarDePapelera(${user.id})">♻️ Restaurar</button></td>
        </tr>`;
    });
}
async function restaurarDePapelera(id) {
    if(confirm("¿Restaurar a Activos?")) { await verificarOperacion(supabaseClient.from('usuarios_canva').update({ estado: 'Activo', fecha_cancelacion: null }).eq('id', id)); cargarPapelera(); }
}

// ===== CATÁLOGO Y GEO =====
function toggleGeoInput() {
    let tipo = document.getElementById('serv-geo-tipo').value;
    document.getElementById('serv-geo-paises').style.display = tipo === 'todos' ? 'none' : 'block';
}

async function cargarServicios() {
    const { data } = await verificarOperacion(supabaseClient.from('servicios').select('*').order('id', { ascending: true }));
    serviciosAdminGlobal = data || [];
    const tabla = document.getElementById('tabla-servicios'); tabla.innerHTML = '';
    if(!data || data.length===0) return tabla.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 40px; color: var(--text-muted);">No hay servicios.</td></tr>';

    const datalist = document.getElementById('opciones-categoria'); datalist.innerHTML = '';
    const categoriasUnicas = [...new Set(data.map(s => s.categoria).filter(Boolean))];
    categoriasUnicas.forEach(cat => { datalist.innerHTML += `<option value="${h(cat)}"></option>`; });

    data.forEach(serv => {
        let geoText = '<span style="color:#059669; font-weight:600;">🌍 Todos</span>';
        if(serv.geo_tipo === 'solo') geoText = `<span style="color:#2563EB; font-weight:600;">✅ Solo:</span> ${h(serv.geo_paises)}`;
        if(serv.geo_tipo === 'excepto') geoText = `<span style="color:#DC2626; font-weight:600;">❌ Excepto:</span> ${h(serv.geo_paises)}`;

        let planes = serv.planes && serv.planes.length > 0 ? serv.planes : [{ cantidad: serv.meses || 1, unidad: 'meses', precio: serv.precio, promo: serv.precio_promocional }];
        let txtPlanes = planes.map(p => {
            let cant = p.cantidad !== undefined ? p.cantidad : (p.meses || 1); let uni = p.unidad || 'meses';
            let t = cant == 0 ? 'Único' : `${cant} ${uni.charAt(0).toUpperCase()}`;
            return `<span style="background:#F3F4F6; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:700; color:var(--text-main); display:inline-block; margin-bottom:5px; margin-right:5px; border: 1px solid var(--border);">${h(t)} (S/ ${h(p.promo || p.precio)})</span>`;
        }).join('');

        tabla.innerHTML += `<tr>
            <td><div style="display:flex; align-items:center; gap:10px;">${serv.imagen_url ? `<img src="${h(VegaSecurity.imageUrl(serv.imagen_url))}" style="width:40px; height:40px; border-radius:8px; object-fit:cover;">` : '📦'} <strong style="color:var(--text-main); font-size:15px;">${h(serv.nombre)}</strong></div></td>
            <td><span style="background:#EFF6FF; color:#1E3A8A; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:700;">${h(serv.categoria || '---')}</span></td>
            <td style="font-size: 12px; color: var(--text-muted);">${geoText}</td>
            <td>${txtPlanes}</td>
            <td style="display:flex; gap:8px;"><button class="btn-gestionar" onclick="editarServicioPorId(${Number(serv.id)})">✏️ Editar</button><button class="btn-borrar" onclick="borrarServicio(${serv.id})">🗑️</button></td>
        </tr>`;
    });
}

function agregarFilaPlan(c = 1, u = 'meses', p = '', pr = '') {
    const idFila = 'plan-' + Math.random().toString(36).substr(2, 5);
    document.getElementById('contenedor-planes').insertAdjacentHTML('beforeend', `
        <div class="plan-row" id="${idFila}" style="display:flex; gap:10px; margin-bottom:15px; background:#FFFFFF; padding:15px; border-radius:12px; border:1px solid var(--border); flex-wrap: wrap; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
            <div style="flex:1; min-width: 80px;"><label style="font-size:12px; color:var(--text-muted);">Tiempo (0=Único)</label><input type="number" class="plan-cantidad" value="${h(c)}" min="0" style="padding:10px; width:100%; border:2px solid var(--border); border-radius:8px; outline:none; transition:0.3s;" onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='var(--border)'"></div>
            <div style="flex:1; min-width: 100px;"><label style="font-size:12px; color:var(--text-muted);">Unidad</label>
                <select class="plan-unidad" style="padding:10px; width:100%; border:2px solid var(--border); border-radius:8px; font-size:14px; background:white; outline:none; transition:0.3s;" onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='var(--border)'">
                    <option value="dias" ${u==='dias'?'selected':''}>Días</option><option value="meses" ${u==='meses'?'selected':''}>Meses</option><option value="años" ${u==='años'?'selected':''}>Años</option>
                </select>
            </div>
            <div style="flex:1; min-width: 90px;"><label style="font-size:12px; color:var(--text-muted);">Precio Normal</label><input type="number" class="plan-precio" value="${h(p)}" step="0.10" style="padding:10px; width:100%; border:2px solid var(--border); border-radius:8px; outline:none; transition:0.3s;" onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='var(--border)'"></div>
            <div style="flex:1; min-width: 90px;"><label style="font-size:12px; color:var(--text-muted);">Precio Oferta</label><input type="number" class="plan-promo" value="${h(pr)}" step="0.10" style="padding:10px; width:100%; border:2px solid var(--border); border-radius:8px; outline:none; transition:0.3s;" onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='var(--border)'"></div>
            <button style="background:#FEE2E2; color:#DC2626; border:none; border-radius:8px; cursor:pointer; padding:0 15px; font-weight:bold; margin-top:22px; transition:0.2s;" onclick="document.getElementById('${idFila}').remove()" onmouseover="this.style.background='#FECACA'" onmouseout="this.style.background='#FEE2E2'">X</button>
        </div>
    `);
}

// ====== SOLUCIÓN AL PROBLEMA DE LA IMAGEN ======
async function subirImagen(input) {
    const file = input.files[0];
    if (!file) return;
    if (!['image/png','image/jpeg','image/webp','image/gif','image/avif'].includes(file.type) || file.size > 5 * 1024 * 1024) {
        alert('Elige una imagen PNG, JPG, WebP, GIF o AVIF de hasta 5 MB.'); return;
    }

    const statusText = document.getElementById('upload-status');
    const btnGuardar = document.getElementById('btn-guardar-servicio');
    const preview = document.getElementById('serv-imagen-preview');

    statusText.style.display = 'block';
    statusText.innerText = "Subiendo imagen a la nube...";
    statusText.style.color = "#F59E0B";
    btnGuardar.disabled = true;

    const fileExt = file.name.split('.').pop().toLowerCase();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { data: uploadData, error } = await supabaseClient.storage
        .from('imagenes_servicios')
        .upload(fileName, file, { cacheControl: '3600', upsert: false });

    if (error) {
        statusText.innerText = "Error al subir: " + error.message;
        statusText.style.color = "#DC2626"; btnGuardar.disabled = false; return;
    }

    const { data } = supabaseClient.storage.from('imagenes_servicios').getPublicUrl(fileName);

    if (data && data.publicUrl) {
        document.getElementById('serv-imagen-url').value = data.publicUrl;
        preview.src = VegaSecurity.imageUrl(data.publicUrl); preview.style.display = 'inline-block';
        statusText.innerText = "¡Imagen lista!"; statusText.style.color = "#10B981";
    } else {
        statusText.innerText = "Error al generar enlace."; statusText.style.color = "#DC2626";
    }
    btnGuardar.disabled = false;
}

function abrirModalServicio() {
    document.getElementById('serv-id').value = ''; document.getElementById('serv-nombre').value = ''; document.getElementById('serv-categoria').value = '';
    document.getElementById('serv-tipo-ingreso').value = 'numero'; document.getElementById('serv-geo-tipo').value = 'todos'; document.getElementById('serv-geo-paises').value = ''; toggleGeoInput();
    document.getElementById('serv-etiqueta').value = ''; document.getElementById('serv-caracteristicas').value = '';
    document.getElementById('serv-imagen-url').value = ''; document.getElementById('serv-imagen-file').value = ''; document.getElementById('serv-imagen-preview').style.display = 'none'; document.getElementById('upload-status').style.display = 'none';
    document.getElementById('contenedor-planes').innerHTML = ''; agregarFilaPlan(1, 'meses'); abrirModal('modal-servicio');
}

function editarServicioPorId(id) {
    const service = serviciosAdminGlobal.find(item => Number(item.id) === Number(id));
    if (service) editarServicio(service);
}
function editarServicio(serv) {
    document.getElementById('serv-id').value = serv.id; document.getElementById('serv-nombre').value = serv.nombre || ''; document.getElementById('serv-categoria').value = serv.categoria || '';
    document.getElementById('serv-tipo-ingreso').value = serv.tipo_ingreso || 'numero'; document.getElementById('serv-geo-tipo').value = serv.geo_tipo || 'todos'; document.getElementById('serv-geo-paises').value = serv.geo_paises || ''; toggleGeoInput();
    document.getElementById('serv-etiqueta').value = serv.etiqueta || ''; document.getElementById('serv-caracteristicas').value = serv.caracteristicas || '';

    if (serv.imagen_url) { document.getElementById('serv-imagen-url').value = serv.imagen_url; document.getElementById('serv-imagen-preview').src = VegaSecurity.imageUrl(serv.imagen_url); document.getElementById('serv-imagen-preview').style.display = 'inline-block'; }
    else { document.getElementById('serv-imagen-url').value = ''; document.getElementById('serv-imagen-preview').style.display = 'none'; }

    document.getElementById('contenedor-planes').innerHTML = '';
    let planes = serv.planes && serv.planes.length > 0 ? serv.planes : [{ cantidad: serv.meses || 1, unidad: 'meses', precio: serv.precio, promo: serv.precio_promocional }];
    planes.forEach(p => agregarFilaPlan(p.cantidad !== undefined ? p.cantidad : p.meses, p.unidad || 'meses', p.precio, p.promo || ''));
    abrirModal('modal-servicio');
}

async function guardarServicio() {
    let id = document.getElementById('serv-id').value;
    let nombre = document.getElementById('serv-nombre').value.trim();
    let catInput = document.getElementById('serv-categoria').value.trim();

    let planesGuardar = [];
    document.querySelectorAll('.plan-row').forEach(row => {
        let c = parseInt(row.querySelector('.plan-cantidad').value); let p = parseFloat(row.querySelector('.plan-precio').value); let pr = parseFloat(row.querySelector('.plan-promo').value);
        if(c >= 0 && !isNaN(p)) planesGuardar.push({ cantidad: c, unidad: row.querySelector('.plan-unidad').value, precio: p, promo: isNaN(pr) ? null : pr });
    });

    if(!nombre || planesGuardar.length === 0) return alert("Faltan datos. El servicio necesita nombre y al menos 1 precio.");

    const datos = {
        nombre: nombre, categoria: catInput ? catInput.charAt(0).toUpperCase() + catInput.slice(1).toLowerCase() : null, tipo_ingreso: document.getElementById('serv-tipo-ingreso').value,
        geo_tipo: document.getElementById('serv-geo-tipo').value, geo_paises: document.getElementById('serv-geo-paises').value.trim().toUpperCase(),
        etiqueta: document.getElementById('serv-etiqueta').value.trim(), caracteristicas: document.getElementById('serv-caracteristicas').value.trim(),
        imagen_url: VegaSecurity.imageUrl(document.getElementById('serv-imagen-url').value) || null,
        planes: planesGuardar, activo: true, precio: planesGuardar[0].precio, precio_promocional: planesGuardar[0].promo
    };

    if(id) await verificarOperacion(supabaseClient.from('servicios').update(datos).eq('id', id)); else await verificarOperacion(supabaseClient.from('servicios').insert([datos]));
    cerrarModal('modal-servicio'); cargarServicios();
}

async function borrarServicio(id) { if (confirm("¿Borrar servicio?")) { await verificarOperacion(supabaseClient.from('servicios').delete().eq('id', id)); cargarServicios(); } }

async function registroManual() {
    const tel = prompt("Ingresa el Número de WhatsApp del cliente:");
    if (tel) {
        let cor = prompt("Ingresa el Correo (Opcional):");
        let serv = prompt("¿Qué servicio adquirió?") || "Canva Pro Edu";
        let msInput = prompt("¿Cuántos meses? (Escribe 0 para Pago Único)", "1");
        if (msInput !== null) {
            let ms = parseInt(msInput) || 0;
            let finStr = null; let inicioStr = new Date().toISOString().split('T')[0];
            if (ms > 0) { let fin = new Date(); fin.setMonth(fin.getMonth() + ms); finStr = fin.toISOString().split('T')[0]; }
            await verificarOperacion(supabaseClient.from('usuarios_canva').insert([{ telefono: tel.replace(/\s+/g, ''), correo: cor || null, servicio: serv, meses: ms, unidad: 'meses', metodo_pago: 'Manual', estado: 'Activo', fecha_inicio: inicioStr, fecha_fin: finStr }]));
            cargarDatosPrincipales();
        }
    }
}

async function abrirSeguridad() {
    abrirModal('modal-seguridad');
    const cont = document.getElementById('lista-dispositivos'); cont.innerHTML = '<p style="text-align:center; color:var(--text-muted);">Cargando accesos...</p>';
    const { data, error } = await verificarOperacion(supabaseClient.from('admin_accesos').select('*').order('fecha', { ascending: false }).limit(10));
    if (error || !data) { cont.innerHTML = '<p style="color:red; text-align:center;">Error al cargar el historial.</p>'; return; }
    cont.innerHTML = '';
    data.forEach((acc, index) => {
        let f = new Date(acc.fecha).toLocaleString('es-PE', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
        let etiqueta = index === 0 ? '<span style="background:#D1FAE5; color:#059669; padding:2px 8px; border-radius:12px; font-size:11px; margin-left:8px; font-weight:bold;">Actual</span>' : '';
        cont.innerHTML += `<div style="padding:15px; border-bottom:1px solid var(--border);"><h4 style="margin:0 0 5px 0; color:var(--text-main); font-size:14px;">${h(acc.dispositivo)} ${etiqueta}</h4><p style="margin:0;font-size:12px;color:var(--text-muted);">${h(acc.navegador)} • ${f}</p></div>`;
    });
}

async function generarEnlaceCliente() {
    if (!adminAuthorized) throw new Error('Inicia sesión como administrador.');
    const id = Number(document.getElementById('gestion-id').value);
    const cliente = clientesGlobal.find(item => Number(item.id) === id);
    if (!cliente) return;
    if (!confirm('Se creará un enlace privado nuevo para este cliente. Los enlaces anteriores de sus servicios dejarán de funcionar.')) return;
    const code = VegaSecurity.newCode();
    const consulta_hash = await VegaSecurity.hashCode(code);
    let request = supabaseClient.from('usuarios_canva').update({ consulta_hash });
    request = cliente.telefono ? request.eq('telefono', cliente.telefono) : request.eq('id', id);
    await verificarOperacion(request);
    const link = VegaSecurity.privateLink(code);
    document.getElementById('enlace-cliente').value = link;
    document.getElementById('enlace-cliente-box').style.display = 'block';
    const whatsapp = document.getElementById('enviar-enlace-cliente');
    const phone = (cliente.telefono || '').replace(/[^0-9]/g, '');
    whatsapp.hidden = !phone;
    whatsapp.href = 'https://wa.me/' + phone + '?text=' + encodeURIComponent('Hola, este es tu enlace privado para consultar tus servicios en VegaStore. Guárdalo y no lo compartas: ' + link);
}
