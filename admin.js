const supabaseClient = window.supabase.createClient('https://rhuhuvevynovfekwhlhb.supabase.co', 'sb_publishable_-8XCScnvNf6QXMsnbyJK9Q_XhrOr9j5');
const URL_TIENDA = "https://vegalabs-dev.github.io/vega.store/";

const h = VegaSecurity.escapeHtml;
let adminAuthorized = false;
let serviciosAdminGlobal = [];
let clientesGlobal = [];
let pedidosGlobal = [];
let fichasGlobal = [];
let solicitudesGlobal = [];
let catalogoOpciones = [];

supabaseClient.auth.getSession().then(({ data: { session } }) => {
    if (session) mostrarPanel().catch(mostrarErrorAdmin);
});
supabaseClient.auth.onAuthStateChange((event, session) => {
    if (!session) {
        adminAuthorized = false;
        clientesGlobal = []; solicitudesGlobal = []; pedidosGlobal = []; fichasGlobal = []; mensajeActual = null;
        document.querySelectorAll('.modal').forEach(modal => { modal.style.display='none'; modal.classList.remove('show'); });
        for (const id of ['ficha-enlace','mensaje-texto']) document.getElementById(id).value='';
        for (const id of ['mensaje-whatsapp','mensaje-elegir-chat']) document.getElementById(id).removeAttribute('href');
        for (const id of ['lista-fichas','ficha-servicios','tabla-clientes','tabla-solicitudes']) document.getElementById(id).replaceChildren();
        document.getElementById('admin-section').style.display = 'none';
        document.getElementById('login-section').style.display = 'block';
    }
});
function mostrarErrorAdmin(error) {
    const message = error?.message || 'No se pudo completar la operación.';
    if (!adminAuthorized) {
        const box = document.getElementById('login-error');
        box.textContent = message; box.style.display = 'block';
    } else VegaUI.toast(message,'error');
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
    if (!await VegaUI.confirm('Podrás volver a entrar con tu cuenta de administrador.',{title:'Cerrar sesión',accept:'Cerrar sesión'})) return;
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
    if(['fichas','ventas','solicitudes','seguimiento'].includes(t)) cargarDatosPrincipales();
    else if(t === 'catalogo') cargarServicios();
    else if(t === 'papelera') cargarPapelera();
}

window.copiarTexto = function(texto) {
    navigator.clipboard.writeText(texto).then(() => VegaUI.toast("Copiado: " + texto)).catch(() => VegaUI.toast("Error al copiar"));
}

// ===== CARGAR DATOS PRINCIPALES =====
let cargaAdmin=null;
async function cargarDatosPrincipales() {
    if(cargaAdmin)return cargaAdmin;
    cargaAdmin=(async()=>{
        document.getElementById('admin-carga').hidden=false;
        try {
            const [orders,profiles,catalog,notices]=await Promise.all([
                verificarOperacion(supabaseClient.from('usuarios_canva').select('id,cliente_id,servicio_id,servicio,estado,meses,unidad,fecha_inicio,fecha_fin,vigencia_inicio,ultima_ampliacion,version,fecha_cancelacion,estado_previo,creado_en,telefono,correo,nombre_cliente,whatsapp_usuario,precio_acordado,token,num_operacion').order('creado_en',{ascending:false})),
                verificarOperacion(supabaseClient.from('vega_clientes').select('*').order('creado_en',{ascending:false})),
                verificarOperacion(supabaseClient.from('servicios').select('id,nombre,stock,agotado,activo').order('nombre',{ascending:true})),
                verificarOperacion(supabaseClient.from('vega_avisos_manuales').select('pedido_id,fecha_fin,tipo'))
            ]);
            if(!adminAuthorized)return;
            pedidosGlobal=orders.data||[];fichasGlobal=profiles.data||[];catalogoOpciones=catalog.data||[];avisosGlobal=notices.data||[];
            clientesGlobal=pedidosGlobal.filter(p=>p.estado==='Activo');solicitudesGlobal=pedidosGlobal.filter(p=>p.estado==='Pendiente');
            document.getElementById('stat-activos').textContent=clientesGlobal.filter(p=>VegaDates.status(p)==='Activo').length;
            document.getElementById('stat-pendientes').textContent=solicitudesGlobal.length;
            const select=document.getElementById('filtro-servicio'),value=select.value;
            select.replaceChildren(new Option('Todos los servicios','ALL'));for(const item of catalogoOpciones)select.add(new Option(item.nombre,item.nombre));
            if([...select.options].some(o=>o.value===value))select.value=value;
            filtrarClientes();renderizarSolicitudes();renderizarFichas();renderizarSeguimiento();
            document.getElementById('admin-error').hidden=true;
        }catch(error){document.getElementById('admin-error').hidden=false;throw error;}
        finally{document.getElementById('admin-carga').hidden=true;}
    })();
    try{return await cargaAdmin;}finally{cargaAdmin=null;}
}

function filtrarClientes() {
    let txt = document.getElementById('buscador-clientes').value.toLowerCase();
    let servFiltro = document.getElementById('filtro-servicio').value;
    let orden = document.getElementById('filtro-orden').value;

    let filtrados = clientesGlobal.filter(u => {
        let coincideTxt = textoBusquedaPedido(u).includes(txt);
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
        const estadoReal=VegaDates.status(user);
        const badge=estadoReal==='Activo'?'badge-activo':'badge-vencido';
        const tiempoTxt=VegaDates.label(user);
        const fechaFinShow=VegaDates.permanent(user)?'Permanente':h(VegaDates.format(user.fecha_fin));

        let numWhatsApp = user.telefono ? user.telefono.replace(/[^+0-9]/g, '') : null;
        let emailCliente = user.correo;
        if (!numWhatsApp && emailCliente && !emailCliente.includes('@') && emailCliente.replace(/\D/g,'').length >= 9) {
            numWhatsApp = emailCliente.replace(/\D/g,''); emailCliente = null;
        }

        const ficha = fichasGlobal.find(f => f.id === user.cliente_id);
        let telRow = `<div style="font-size:13px;margin-bottom:6px;"><strong>${h(ficha?.nombre || user.nombre_cliente || numWhatsApp || 'Cliente')}</strong> <button class="btn-copiar" onclick="abrirMensajesCliente(${Number(user.id)})" title="Mensaje y enlace privado">💬</button></div><div style="font-size:12px;color:var(--text-muted);">${h(numWhatsApp || '')} ${h((ficha?.whatsapp_usuario || user.whatsapp_usuario) ? '@' + (ficha?.whatsapp_usuario || user.whatsapp_usuario) : '')}</div>`;
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

        let telRow = `<div style="font-size:13px;margin-bottom:4px;"><strong>${h(user.nombre_cliente || numWhatsApp || 'Cliente')}</strong> ${h(user.whatsapp_usuario ? '@' + user.whatsapp_usuario : '')}</div>`;
        let corRow = emailCliente ? `<div style="font-size: 12px; margin-top: 4px; display: flex; align-items: center; gap: 8px;">✉️ <span style="color: var(--text-muted);">${h(emailCliente)}</span> <button data-email="${h(emailCliente)}" onclick="copiarTexto(this.dataset.email)" class="btn-copiar" style="padding: 2px 8px; font-size: 11px;">📋 Copiar</button></div>` : '';
        let tiempoTxt = user.meses == 0 ? "Pago Único" : `${user.meses || 1} ${user.unidad || 'Meses'}`;

        tabla.innerHTML += `<tr>
            <td>${telRow} ${corRow}</td>
            <td><strong style="color:var(--text-main); font-size:15px;">${h(user.servicio)}</strong><br><span style="font-size:12px; color:var(--text-muted); font-weight:600;">${h(tiempoTxt)}</span></td>
            <td>${user.precio_acordado != null ? `<div style="font-size:13px;margin-bottom:8px;">Importe del pedido: <strong>S/ ${Number(user.precio_acordado).toFixed(2)}</strong></div>` : ''}<strong style="color: var(--primary); background:#F5F3FF; padding:4px 8px; border-radius:6px;">${h(user.token || user.num_operacion || '---')}</strong></td>
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
    if (!user) return;
    let servicioId = user.servicio_id;
    if (!servicioId) {
        pendienteAprobar=id;
        const select=document.getElementById('aprobacion-producto');select.replaceChildren(new Option('Selecciona el producto',''));
        for(const s of catalogoOpciones.filter(s=>s.activo!==false)){const opt=new Option(s.nombre+' · '+VegaCatalog.stockTexto(s),s.id);opt.disabled=!VegaCatalog.disponible(s);select.append(opt);}
        abrirModal('modal-aprobacion');return;
    }
    const cantidad=Number(user.meses)||0,unidad=user.unidad||'meses';
    const inicioStr=VegaDates.today(),finStr=cantidad>0?VegaDates.add(inicioStr,cantidad,unidad):null;
    if(!await VegaUI.confirm(`Activar ${user.servicio}. ${finStr?'Vigente hasta '+VegaDates.format(finStr):'Permanente'}.`,{title:'Confirmar activación',accept:'Activar servicio'}))return;
    await verificarOperacion(supabaseClient.rpc('vega_activar_pedido',{p_id:Number(id),p_servicio_id:Number(servicioId),p_version:user.version}));
    await cargarDatosPrincipales();VegaUI.toast('Servicio activado.');
}

async function rechazarSolicitud(id) { await archivarPedido(id); }

// ===== SÚPER MODAL DE GESTIÓN =====
function abrirGestionCliente(id) {
    let user = pedidosGlobal.find(u => u.id === id);
    if (!user) return;
    document.getElementById('gestion-id').value = user.id;
    document.getElementById('gestion-servicio-titulo').innerText = `${user.servicio} · ${VegaDates.label(user)}`;

    document.getElementById('gestion-correo').value = user.correo || '';
    opcionesFichas('gestion-ficha-destino', false);
    document.getElementById('gestion-ficha-destino').value = user.cliente_id || '';
    cargarHistorialPedido(id,document.getElementById('gestion-historial'));
    abrirModal('modal-gestionar-cliente');
}

async function guardarDatosContacto() {
    let id = document.getElementById('gestion-id').value;
    let cor = document.getElementById('gestion-correo').value.trim();
    if (cor && !document.getElementById('gestion-correo').checkValidity()) throw new Error('Revisa el correo.');
    await verificarOperacion(supabaseClient.from('usuarios_canva').update({ correo: cor || null }).eq('id', id));
    VegaUI.toast('Correo guardado para este servicio.'); await cargarDatosPrincipales();
}

function darDiasExtra(){abrirAmpliacion('regalo');}
function renovarServicio(){abrirAmpliacion('renovacion');}
function cambiarServicio(){abrirCambioServicio();}
async function cancelarServicio(){await archivarPedido(document.getElementById('gestion-id').value);}

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
async function restaurarDePapelera(id) {await archivarPedido(id,true);}

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

        let planes = VegaCatalog.planes(serv);
        let txtPlanes = planes.map(p => {
            let cant = p.cantidad !== undefined ? p.cantidad : (p.meses || 1); let uni = p.unidad || 'meses';
            let t = cant == 0 ? 'Único' : `${cant} ${uni.charAt(0).toUpperCase()}`;
            return `<span style="background:#F3F4F6; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:700; color:var(--text-main); display:inline-block; margin-bottom:5px; margin-right:5px; border: 1px solid var(--border);">${h(t)} (S/ ${h(p.promo || p.precio)})</span>`;
        }).join('');

        tabla.innerHTML += `<tr>
            <td><div style="display:flex; align-items:center; gap:10px;">${serv.imagen_url ? `<img src="${h(VegaSecurity.imageUrl(serv.imagen_url))}" style="width:40px; height:40px; border-radius:8px; object-fit:cover;">` : '📦'} <strong style="color:var(--text-main); font-size:15px;">${h(serv.nombre)}</strong></div><span class="stock-badge ${VegaCatalog.disponible(serv) ? '' : 'sold-out'}">${h(VegaCatalog.stockTexto(serv))}</span><span class="stock-admin-summary">${h(resumenPromocion(serv))}</span></td>
            <td><span style="background:#EFF6FF; color:#1E3A8A; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:700;">${h(serv.categoria || '---')}</span></td>
            <td style="font-size: 12px; color: var(--text-muted);">${geoText}</td>
            <td>${txtPlanes}</td>
            <td style="display:flex; gap:8px;"><button class="btn-gestionar" onclick="editarServicioPorId(${Number(serv.id)})">✏️ Editar</button><button class="btn-borrar" onclick="borrarServicio(${serv.id})" title="Ocultar de la tienda">Ocultar</button></td>
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
        VegaUI.toast('Elige una imagen PNG, JPG, WebP, GIF o AVIF de hasta 5 MB.'); return;
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
    cargarOpcionesStock({});
    document.getElementById('contenedor-planes').innerHTML = ''; agregarFilaPlan(1, 'meses'); abrirModal('modal-servicio');
}

function editarServicioPorId(id) {
    const service = serviciosAdminGlobal.find(item => Number(item.id) === Number(id));
    if (service) editarServicio(service);
}
function editarServicio(serv) {
    cargarOpcionesStock(serv);
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
    const saveButton=document.getElementById('btn-guardar-servicio');if(saveButton.disabled)return;
    let id = document.getElementById('serv-id').value;
    let nombre = document.getElementById('serv-nombre').value.trim();
    let catInput = document.getElementById('serv-categoria').value.trim();

    let planesGuardar = [];
    document.querySelectorAll('.plan-row').forEach(row => {
        let c = Number(row.querySelector('.plan-cantidad').value); if (!row.querySelector('.plan-cantidad').value.trim()) c = NaN; let p = parseFloat(row.querySelector('.plan-precio').value); let pr = parseFloat(row.querySelector('.plan-promo').value);
        if(c >= 0 && !isNaN(p)) planesGuardar.push({ cantidad: c, unidad: row.querySelector('.plan-unidad').value, precio: p, promo: isNaN(pr) ? null : pr });
    });

    const seen = new Set();
    for (const p of planesGuardar) {
        const key = `${p.cantidad}:${p.unidad}`;
        if (seen.has(key) || !Number.isInteger(p.cantidad) || p.precio < 0 || (p.promo !== null && (p.promo <= 0 || p.promo >= p.precio)))
            throw new Error('Cada duración debe ser única y el precio de oferta debe ser mayor que 0 y menor al normal.');
        seen.add(key);
    }
    if (planesGuardar.length !== document.querySelectorAll('.plan-row').length) throw new Error('Completa o elimina los planes vacíos.');
    const opciones = leerOpcionesStock(planesGuardar);
    if(!nombre || planesGuardar.length === 0) return VegaUI.toast("Faltan datos. El servicio necesita nombre y al menos 1 precio.");

    const datos = {
        nombre: nombre, categoria: catInput ? catInput.charAt(0).toUpperCase() + catInput.slice(1).toLowerCase() : null, tipo_ingreso: document.getElementById('serv-tipo-ingreso').value,
        geo_tipo: document.getElementById('serv-geo-tipo').value, geo_paises: document.getElementById('serv-geo-paises').value.trim().toUpperCase(),
        etiqueta: document.getElementById('serv-etiqueta').value.trim(), caracteristicas: document.getElementById('serv-caracteristicas').value.trim(),
        imagen_url: VegaSecurity.imageUrl(document.getElementById('serv-imagen-url').value) || null,
        ...opciones, planes: planesGuardar, precio: planesGuardar[0].precio, precio_promocional: planesGuardar[0].promo
    };

    saveButton.disabled=true;document.getElementById('modal-servicio').dataset.busy='true';
    try{
    if (id) {
        const previous = serviciosAdminGlobal.find(s => Number(s.id) === Number(id));
        if (!previous) throw new Error('Recarga el catálogo antes de guardar.');
        const changedStock = datos.stock !== (previous.stock ?? null) || datos.agotado !== !!previous.agotado;
        if (!changedStock) { delete datos.stock; delete datos.agotado; }
        let request = supabaseClient.from('servicios').update(datos).eq('id', Number(id));
        if (changedStock) request = request.eq('stock_version', previous.stock_version ?? 0);
        const {data:saved} = await verificarOperacion(request.select('id'));
        if (!saved?.length) throw new Error('El stock cambió mientras editabas. Cierra este formulario y vuelve a abrir el producto para revisar la cantidad actual.');
    } else await verificarOperacion(supabaseClient.from('servicios').insert([datos]));
    cerrarModal('modal-servicio'); await cargarServicios();
    }finally{saveButton.disabled=false;delete document.getElementById('modal-servicio').dataset.busy;}
}

async function borrarServicio(id) { if (await VegaUI.confirm("¿Ocultar este producto de la tienda? Sus ventas se conservarán. Puedes volver a mostrarlo desde Editar.")) { await verificarOperacion(supabaseClient.from('servicios').update({activo:false}).eq('id', id)); cargarServicios(); } }

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

function toggleStockInput() {
    document.getElementById('serv-stock-grupo').hidden = document.getElementById('serv-stock-modo').value !== 'limitado';
}
function togglePromoInput() {
    document.getElementById('serv-promo-fechas').hidden = !document.getElementById('serv-promo-programada').checked;
}
function cargarOpcionesStock(serv) {
    document.getElementById('serv-stock-modo').value = serv.stock == null ? 'ilimitado' : 'limitado';
    document.getElementById('serv-stock').value = serv.stock ?? '';
    document.getElementById('serv-agotado').checked = !!serv.agotado;
    document.getElementById('serv-activo').checked = serv.activo !== false;
    document.getElementById('serv-promo-programada').checked = !!serv.promocion_inicio;
    document.getElementById('serv-promo-inicio').value = VegaCatalog.inputPeru(serv.promocion_inicio);
    document.getElementById('serv-promo-fin').value = VegaCatalog.inputPeru(serv.promocion_fin);
    toggleStockInput(); togglePromoInput();
}
function leerOpcionesStock(planes) {
    const limited = document.getElementById('serv-stock-modo').value === 'limitado';
    const raw = document.getElementById('serv-stock').value;
    const stock = limited ? Number(raw) : null;
    if (limited && (!raw.trim() || !Number.isInteger(stock) || stock < 0 || stock > 2147483647)) throw new Error('Indica una cantidad de stock válida, incluyendo 0 para agotado.');
    const scheduled = document.getElementById('serv-promo-programada').checked;
    const inicio = scheduled ? VegaCatalog.desdePeru(document.getElementById('serv-promo-inicio').value) : null;
    const fin = scheduled ? VegaCatalog.desdePeru(document.getElementById('serv-promo-fin').value) : null;
    if (scheduled && (!inicio || !fin || fin <= inicio || !planes.some(p => p.promo !== null)))
        throw new Error('La promoción necesita inicio, un fin posterior y al menos un precio de oferta.');
    return {stock, agotado:document.getElementById('serv-agotado').checked, activo:document.getElementById('serv-activo').checked,
        promocion_inicio:inicio, promocion_fin:fin};
}
function resumenPromocion(s) {
    if (!s.promocion_inicio) return '';
    const estado = Date.now() < Date.parse(s.promocion_inicio) ? 'Programada' : Date.now() >= Date.parse(s.promocion_fin) ? 'Finalizada' : 'Oferta activa';
    return `${estado}: ${VegaCatalog.fechaPeru(s.promocion_inicio)} → ${VegaCatalog.fechaPeru(s.promocion_fin)} (Perú)`;
}

let pendienteAprobar=null;
async function confirmarProductoAprobacion(){
    const id=pendienteAprobar,servicioId=Number(document.getElementById('aprobacion-producto').value);
    if(!id||!servicioId)throw new Error('Selecciona el producto.');
    const p=solicitudesGlobal.find(x=>x.id===id);if(!p)return;
    p.servicio_id=servicioId;cerrarModal('modal-aprobacion');await aprobarPago(id);
}
