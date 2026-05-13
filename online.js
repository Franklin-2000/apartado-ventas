// ================================================================
// TIENDA ONLINE — online.js
// ================================================================
const SB_URL          = "https://mhnhfdtdpryrjaeaymsa.supabase.co";
const SB_KEY          = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1obmhmZHRkcHJ5cmphZWF5bXNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NDE3MjAsImV4cCI6MjA5MjExNzcyMH0.UINKafSUr0jI1_NGrh3Z-Uzhwi6Euqot3WQMsliteug";
const ANON_KEY        = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1obmhmZHRkcHJ5cmphZWF5bXNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NDE3MjAsImV4cCI6MjA5MjExNzcyMH0.UINKafSUr0jI1_NGrh3Z-Uzhwi6Euqot3WQMsliteug";
const WHATSAPP_ADMIN  = "573505969916";

// ================================================================
// *** EMAIL DEL ADMINISTRADOR (dueño de la tienda) ***
// Solo sus productos aparecen en la tienda.
// Solo él puede gestionar pedidos desde el panel admin.
// ================================================================
const ADMIN_EMAIL = "chindoyfranklin9@gmail.com";

const sb = supabase.createClient(SB_URL, SB_KEY);

// ================================================================
// ESTADO GLOBAL
// ================================================================
let currentUser  = null;
let esAdmin      = false;
let adminUserId  = null;   // user_id de la cuenta admin (se carga al iniciar)
let productos    = [];
let carrito      = [];     // [{ producto, qty }]

// ================================================================
// DOM
// ================================================================
const pantLogin           = document.getElementById('pantalla-login');
const pantTienda          = document.getElementById('pantalla-tienda');
const btnGoogle           = document.getElementById('btnGoogle');
const btnLogout           = document.getElementById('btnLogout');
const productosGrid       = document.getElementById('tiendaContenido');
const loadingMsg          = document.getElementById('loadingMsg');
const emptyMsg            = document.getElementById('emptyMsg');
const inputBuscar         = document.getElementById('inputBuscar');
const carritoCount        = document.getElementById('carritoCount');
const carritoTotal        = document.getElementById('carritoTotal');
const carritoItems        = document.getElementById('carritoItems');
const carritoPanel        = document.getElementById('carritoPanel');
const carritoOverlay      = document.getElementById('carritoOverlay');
const btnAbrirCarrito     = document.getElementById('btnAbrirCarrito');
const btnCerrarCarrito    = document.getElementById('btnCerrarCarrito');
const btnCheckout         = document.getElementById('btnCheckout');
const modalCheckout       = document.getElementById('modalCheckout');
const btnCerrarCheckout   = document.getElementById('btnCerrarCheckout');
const btnConfirmarPedido  = document.getElementById('btnConfirmarPedido');
const checkoutResumen     = document.getElementById('checkoutResumen');
const checkoutTotalFinal  = document.getElementById('checkoutTotalFinal');
const btnMisPedidos       = document.getElementById('btnMisPedidos');
const modalMisPedidos     = document.getElementById('modalMisPedidos');
const btnCerrarMisPedidos = document.getElementById('btnCerrarMisPedidos');
const listaMisPedidos     = document.getElementById('listaMisPedidos');

// ================================================================
// ALERTA PERSONALIZADA — Enter = Aceptar
// ================================================================
function mostrarAlerta(mensaje) {
    return new Promise(resolve => {
        // Crear overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position:fixed; inset:0; background:rgba(0,0,0,0.55);
            display:flex; align-items:center; justify-content:center;
            z-index:99999; animation:fadeIn .15s ease;
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            background:#fff; border-radius:18px; padding:32px 28px 24px;
            max-width:380px; width:90%; box-shadow:0 8px 40px rgba(0,0,0,0.22);
            text-align:center; font-family:'Nunito',sans-serif;
            animation:scaleIn .18s ease;
        `;

        const msg = document.createElement('p');
        msg.style.cssText = `
            margin:0 0 24px; font-size:1rem; color:#222;
            line-height:1.6; white-space:pre-line;
        `;
        msg.textContent = mensaje;

        const btn = document.createElement('button');
        btn.textContent = 'Aceptar';
        btn.style.cssText = `
            background:linear-gradient(135deg,#6c63ff,#a78bfa);
            color:#fff; border:none; border-radius:50px;
            padding:11px 40px; font-size:1rem; font-weight:700;
            cursor:pointer; font-family:'Nunito',sans-serif;
            transition:transform .1s, box-shadow .1s;
        `;
        btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.04)'; });
        btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });

        const cerrar = () => { document.body.removeChild(overlay); resolve(); };
        btn.addEventListener('click', cerrar);

        // Enter cierra la alerta
        const onKey = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); document.removeEventListener('keydown', onKey); cerrar(); }
        };
        document.addEventListener('keydown', onKey);

        box.appendChild(msg);
        box.appendChild(btn);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        // Enfocar el botón para que Enter funcione sin hacer nada extra
        setTimeout(() => btn.focus(), 50);
    });
}

// ================================================================
// AUTH — Login con Google
// ================================================================
async function checkAuth() {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        currentUser = session.user;
        await iniciarSesion();
    } else {
        mostrarLogin();
    }
}

async function iniciarSesion() {
    esAdmin = (currentUser.email === ADMIN_EMAIL);

    if (esAdmin) {
        adminUserId = currentUser.id;
    } else {
        adminUserId = await obtenerAdminUserId();
    }

    await mostrarTienda();
}

// Obtiene el user_id del admin a través de la función RPC
async function obtenerAdminUserId() {
    const { data, error } = await sb.rpc('get_admin_user_id');
    if (error || !data) {
        console.error('No se pudo obtener admin user_id:', error);
        return null;
    }
    return data;
}

function mostrarLogin() {
    pantLogin.style.display  = 'flex';
    pantTienda.style.display = 'none';
}

async function mostrarTienda() {
    pantLogin.style.display  = 'none';
    pantTienda.style.display = 'block';

    await cargarProductos();
}

btnGoogle.addEventListener('click', async () => {
    await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: 'https://franklin-2000.github.io/apartado-ventas/' }
    });
});

btnLogout.addEventListener('click', async () => {
    await sb.auth.signOut({ scope: 'local' });
    carrito     = [];
    currentUser = null;
    esAdmin     = false;
    adminUserId = null;
    // Recarga limpia para que Google OAuth no quede bloqueado
    window.location.href = window.location.pathname + window.location.search;
});

// ================================================================
// PRODUCTOS — carga SOLO los del admin (dueño de la tienda)
// ================================================================
async function cargarProductos() {
    loadingMsg.style.display = 'block';
    productosGrid.innerHTML  = '';
    emptyMsg.style.display   = 'none';

    if (!adminUserId) {
        loadingMsg.style.display = 'none';
        emptyMsg.style.display   = 'block';
        emptyMsg.textContent     = 'No se pudo cargar el catálogo. Intenta de nuevo.';
        return;
    }

    const { data, error } = await sb
        .from('productos')
        .select('*')
        .eq('user_id', adminUserId)
        .gt('cantidad', 0)
        .order('categoria', { ascending: true })
        .order('nombre',    { ascending: true });

    loadingMsg.style.display = 'none';

    if (error) {
        emptyMsg.style.display = 'block';
        emptyMsg.textContent   = 'Error al cargar productos. Intenta de nuevo.';
        console.error(error);
        return;
    }

    productos = data || [];
    if (productos.length === 0) { emptyMsg.style.display = 'block'; return; }
    renderProductos(productos, true);   // Vista "Todas": sin títulos de categoría
    iniciarFiltrosCategorias();
}

// Etiquetas y emojis por categoría
const CATEGORIA_LABELS = {
    'Perecederos': '🥦 Perecederos',
    'Abarrotes':   '🛒 Abarrotes',
    'Bebidas':     '🥤 Bebidas',
    'Congelados':  '🧊 Congelados',
    'Hogar':       '🧹 Hogar',
    'Higiene':     '🧴 Higiene',
    'Otras':       '📦 Otras',
};

const ORDEN_CATEGORIAS = ['Perecederos','Abarrotes','Bebidas','Congelados','Hogar','Higiene','Otras'];

function crearTarjetaProducto(p, idx) {
    const card = document.createElement('div');
    card.className = 'tarjeta-tienda';
    card.style.animationDelay = `${idx * 0.04}s`;
    card.dataset.id = p.id;

    const agotado  = p.cantidad === 0;
    const catLabel = CATEGORIA_LABELS[p.categoria] || (p.categoria || '');

    card.innerHTML = `
        <div class="tarjeta-img-wrapper">
            <img src="${p.imagen || 'https://via.placeholder.com/300x200?text=Sin+imagen'}"
                 alt="${p.nombre}"
                 onerror="this.src='https://via.placeholder.com/300x200?text=Sin+imagen'">
            ${p.categoria ? `<span class="badge-categoria">${catLabel}</span>` : ''}
        </div>
        <div class="tarjeta-info">
            <div class="tarjeta-nombre">${p.nombre}</div>
            <div class="tarjeta-precio">$${Number(p.precio).toLocaleString('es-CO')}</div>
            <div class="tarjeta-stock ${agotado ? 'agotado' : ''}">
                ${agotado ? 'Agotado' : `${p.cantidad} disponibles`}
            </div>
        </div>
        <div class="tarjeta-cantidad-controles" ${agotado ? 'style="opacity:0.4;pointer-events:none"' : ''}>
            <input class="input-qty-card" type="number" placeholder="Cantidad: 1" min="1" max="${p.cantidad}" inputmode="numeric" pattern="[0-9]*" ${agotado ? 'disabled' : ''}>
        </div>
        <button class="btn-agregar" ${agotado ? 'disabled' : ''}>
            ${agotado ? 'Agotado' : '🛒 Agregar al carrito'}
        </button>
    `;

    if (!agotado) {
        const inputQty   = card.querySelector('.input-qty-card');
        const btnAgregar = card.querySelector('.btn-agregar');

        // Al hacer foco/click seleccionar el contenido para reemplazar fácilmente
        inputQty.addEventListener('focus', () => { inputQty.select(); });
        inputQty.addEventListener('click', () => { setTimeout(() => inputQty.select(), 0); });

        // En movil: foco limpio al tocar
        inputQty.addEventListener('touchend', (e) => {
            e.preventDefault();
            inputQty.focus();
            setTimeout(() => inputQty.select(), 50);
        });

        // Validar mientras escribe: solo numeros, maximo stock disponible
        inputQty.addEventListener('input', () => {
            inputQty.value = inputQty.value.replace(/[^0-9]/g, '');
            const v = parseInt(inputQty.value);
            if (v > p.cantidad) inputQty.value = p.cantidad;
        });

        // Al salir del campo: si quedo vacio o 0, limpiar para mostrar placeholder
        inputQty.addEventListener('blur', () => {
            const v = parseInt(inputQty.value);
            if (inputQty.value !== '' && (isNaN(v) || v < 1)) inputQty.value = '';
        });

        // Enter agrega al carrito con cantidad ingresada (o 1 si esta vacio)
        inputQty.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const qty = parseInt(inputQty.value) || 1;
                agregarAlCarritoConQty(p, qty);
                inputQty.value = '';
                inputQty.blur();
            }
        });

        btnAgregar.addEventListener('click', () => {
            const qty = parseInt(inputQty.value) || 1;
            agregarAlCarritoConQty(p, qty);
            inputQty.value = '';
        });
    }

    return card;
}

function renderProductos(lista, ocultarTitulos = false) {
    productosGrid.innerHTML = '';
    emptyMsg.style.display  = lista.length === 0 ? 'block' : 'none';
    if (lista.length === 0) return;

    const grupos = {};
    lista.forEach(p => {
        const cat = p.categoria || 'Otras';
        if (!grupos[cat]) grupos[cat] = [];
        grupos[cat].push(p);
    });

    const catsEnUso  = Object.keys(grupos);
    const ordenFinal = [
        ...ORDEN_CATEGORIAS.filter(c => catsEnUso.includes(c)),
        ...catsEnUso.filter(c => !ORDEN_CATEGORIAS.includes(c))
    ];

    let idxGlobal = 0;
    ordenFinal.forEach(cat => {
        const prods   = grupos[cat];
        const seccion = document.createElement('div');
        seccion.className  = 'categoria-seccion';
        seccion.dataset.cat = cat;

        if (!ocultarTitulos) {
            const titulo = document.createElement('h2');
            titulo.className   = 'categoria-titulo';
            titulo.textContent = CATEGORIA_LABELS[cat] || cat;
            seccion.appendChild(titulo);
        }

        const grid = document.createElement('div');
        grid.className = 'categoria-grid';
        prods.forEach(p => grid.appendChild(crearTarjetaProducto(p, idxGlobal++)));

        seccion.appendChild(grid);
        productosGrid.appendChild(seccion);
    });
}

function iniciarFiltrosCategorias() {
    const btns = document.querySelectorAll('.btn-categoria');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('activa'));
            btn.classList.add('activa');
            filtrarPorCategoria(btn.dataset.cat);
        });
    });
}

function filtrarPorCategoria(cat) {
    if (cat === 'todas') { renderProductos(productos, true); return; }
    renderProductos(productos.filter(p => (p.categoria || 'Otras') === cat), false);
}

inputBuscar.addEventListener('input', () => {
    const term = inputBuscar.value.trim().toLowerCase();
    document.querySelectorAll('.btn-categoria').forEach(b => b.classList.remove('activa'));
    const btnTodas = document.querySelector('.btn-categoria[data-cat="todas"]');
    if (btnTodas) btnTodas.classList.add('activa');
    if (!term) { renderProductos(productos, true); return; }
    renderProductos(productos.filter(p =>
        p.nombre.toLowerCase().includes(term) ||
        (p['codigoBarras'] && p['codigoBarras'].includes(term))
    ), true);
});

// ================================================================
// CARRITO
// ================================================================
function agregarAlCarrito(producto) { agregarAlCarritoConQty(producto, 1); }

async function agregarAlCarritoConQty(producto, qty) {
    qty = parseInt(qty) || 1;
    if (qty < 1) qty = 1;

    const existente       = carrito.find(i => i.producto.id === producto.id);
    const enCarrito       = existente ? existente.qty : 0;
    const stockDisponible = producto.cantidad;

    if (enCarrito >= stockDisponible) {
        await mostrarAlerta(`Solo hay ${stockDisponible} unidades disponibles de "${producto.nombre}".`);
        return;
    }

    const qtyReal = Math.min(qty, stockDisponible - enCarrito);
    if (existente) existente.qty += qtyReal;
    else           carrito.push({ producto, qty: qtyReal });

    actualizarCarritoUI();
    abrirCarrito();
}

function quitarDelCarrito(productoId) {
    carrito = carrito.filter(i => i.producto.id !== productoId);
    actualizarCarritoUI();
}

async function cambiarQty(productoId, delta) {
    const item = carrito.find(i => i.producto.id === productoId);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) { quitarDelCarrito(productoId); return; }
    if (item.qty > item.producto.cantidad) {
        item.qty = item.producto.cantidad;
        await mostrarAlerta(`Máximo ${item.producto.cantidad} unidades disponibles.`);
    }
    actualizarCarritoUI();
}

function actualizarCarritoUI() {
    const totalItems  = carrito.reduce((s, i) => s + i.qty, 0);
    const totalPrecio = carrito.reduce((s, i) => s + i.qty * Number(i.producto.precio), 0);

    carritoCount.textContent = totalItems;
    carritoTotal.textContent = totalPrecio.toLocaleString('es-CO');

    if (carrito.length === 0) {
        carritoItems.innerHTML = '<p class="carrito-vacio">Tu carrito está vacío.</p>';
        return;
    }

    carritoItems.innerHTML = '';
    carrito.forEach(item => {
        const fila = document.createElement('div');
        fila.className = 'carrito-item-row';
        fila.innerHTML = `
            <img class="carrito-item-img"
                 src="${item.producto.imagen || 'https://via.placeholder.com/60'}"
                 alt="${item.producto.nombre}"
                 onerror="this.src='https://via.placeholder.com/60'">
            <div class="carrito-item-info">
                <div class="carrito-item-nombre">${item.producto.nombre}</div>
                <div class="carrito-item-precio">$${(item.qty * Number(item.producto.precio)).toLocaleString('es-CO')}</div>
            </div>
            <div class="carrito-item-controles">
                <button class="btn-qty" data-id="${item.producto.id}" data-delta="1">+</button>
                <span class="qty-num">${item.qty}</span>
                <button class="btn-qty" data-id="${item.producto.id}" data-delta="-1">−</button>
                <button class="btn-quitar-item" data-id="${item.producto.id}">✕ quitar</button>
            </div>
        `;
        carritoItems.appendChild(fila);
    });

    carritoItems.querySelectorAll('.btn-qty').forEach(btn => {
        btn.addEventListener('click', () =>
            cambiarQty(parseInt(btn.dataset.id), parseInt(btn.dataset.delta))
        );
    });
    carritoItems.querySelectorAll('.btn-quitar-item').forEach(btn => {
        btn.addEventListener('click', () => quitarDelCarrito(parseInt(btn.dataset.id)));
    });
}

function abrirCarrito()  {
    carritoOverlay.style.display = 'block';
    carritoPanel.classList.add('abierto');
}
function cerrarCarrito() {
    carritoOverlay.style.display = 'none';
    carritoPanel.classList.remove('abierto');
}

btnAbrirCarrito.addEventListener('click', abrirCarrito);
btnCerrarCarrito.addEventListener('click', cerrarCarrito);
carritoOverlay.addEventListener('click', cerrarCarrito);

// ================================================================
// CHECKOUT
// ================================================================
btnCheckout.addEventListener('click', async () => {
    if (carrito.length === 0) { await mostrarAlerta('Tu carrito está vacío.'); return; }
    cerrarCarrito();
    abrirModalCheckout();
});

function abrirModalCheckout() {
    const total = carrito.reduce((s, i) => s + i.qty * Number(i.producto.precio), 0);
    checkoutResumen.innerHTML = carrito.map(item => `
        <div class="checkout-resumen-item">
            <span>${item.qty}x ${item.producto.nombre}</span>
            <span>$${(item.qty * Number(item.producto.precio)).toLocaleString('es-CO')}</span>
        </div>
    `).join('');
    checkoutTotalFinal.textContent = total.toLocaleString('es-CO');
    modalCheckout.style.display    = 'flex';
}

btnCerrarCheckout.addEventListener('click', () => { modalCheckout.style.display = 'none'; });
modalCheckout.addEventListener('click', e => {
    if (e.target === modalCheckout) modalCheckout.style.display = 'none';
});

function limpiarFormCheckout() {
    document.getElementById('chkNombre').value    = '';
    document.getElementById('chkTelefono').value  = '';
    document.getElementById('chkDireccion').value = '';
    document.getElementById('chkNotas').value     = '';
}

// ================================================================
// CONFIRMAR PEDIDO — solo contra entrega
// ================================================================
btnConfirmarPedido.addEventListener('click', async () => {
    const nombre    = document.getElementById('chkNombre').value.trim();
    const telefono  = document.getElementById('chkTelefono').value.trim();
    const direccion = document.getElementById('chkDireccion').value.trim();
    const notas     = document.getElementById('chkNotas').value.trim();

    if (!nombre || !telefono || !direccion) {
        await mostrarAlerta('Por favor completa nombre, teléfono y dirección.');
        return;
    }

    const total = carrito.reduce((s, i) => s + i.qty * Number(i.producto.precio), 0);

    btnConfirmarPedido.disabled    = true;
    btnConfirmarPedido.textContent = 'Procesando...';

    try {
        const { data: pedidoData, error: pedidoError } = await sb
            .from('pedidos')
            .insert([{
                user_id:        currentUser.id,
                cliente_nombre: nombre,
                cliente_email:  currentUser.email,
                cliente_tel:    telefono,
                direccion,
                notas,
                total,
                metodo_pago:    'contraentrega',
                estado:         'pendiente',
                fecha:          new Date().toISOString()
            }])
            .select()
            .single();

        if (pedidoError) throw pedidoError;

        const items = carrito.map(i => ({
            pedido_id:  pedidoData.id,
            product_id: i.producto.id,
            nombre:     i.producto.nombre,
            cantidad:   i.qty,
            precio:     Number(i.producto.precio),
            subtotal:   i.qty * Number(i.producto.precio)
        }));

        const { error: itemsError } = await sb.from('items_pedido').insert(items);
        if (itemsError) throw itemsError;

        carrito = [];
        actualizarCarritoUI();
        modalCheckout.style.display = 'none';
        limpiarFormCheckout();

        await mostrarAlerta(`✅ ¡Pedido #${pedidoData.id} recibido!\n\nTe contactaremos para coordinar la entrega.\nEl pago se realizará al momento de la entrega.`);

        setTimeout(() => {
            abrirWhatsAppAuto(direccion, nombre, pedidoData.id, total, items);
        }, 1000);

    } catch (err) {
        console.error('Error al confirmar pedido:', err);
        await mostrarAlerta('Hubo un error al procesar tu pedido. Intenta de nuevo.');
    } finally {
        btnConfirmarPedido.disabled    = false;
        btnConfirmarPedido.textContent = 'Confirmar Pedido';
    }
});

// ================================================================
// MIS PEDIDOS — el cliente ve sus propios pedidos
// ================================================================
btnMisPedidos.addEventListener('click', async () => {
    modalMisPedidos.style.display = 'flex';
    listaMisPedidos.innerHTML     = '<p>Cargando...</p>';
    await cargarMisPedidos();
});

btnCerrarMisPedidos.addEventListener('click', () => { modalMisPedidos.style.display = 'none'; });
modalMisPedidos.addEventListener('click', e => {
    if (e.target === modalMisPedidos) modalMisPedidos.style.display = 'none';
});

async function cargarMisPedidos() {
    if (!currentUser) return;

    const { data, error } = await sb
        .from('pedidos')
        .select(`
            id, total, fecha, direccion, notas, cliente_nombre,
            items_pedido (nombre, cantidad, precio, subtotal)
        `)
        .eq('user_id', currentUser.id)
        .order('id', { ascending: false });

    if (error || !data || data.length === 0) {
        listaMisPedidos.innerHTML = `
            <div class="pedidos-vacio">
                <div class="pedidos-vacio-icon">🛍️</div>
                <p class="pedidos-vacio-titulo">Aún no tienes pedidos</p>
                <p class="pedidos-vacio-sub">Cuando realices tu primera compra, el historial aparecerá aquí.</p>
            </div>`;
        return;
    }

    const totalCompras = data.length;
    const totalGastado = data.reduce((s, p) => s + Number(p.total), 0);

    listaMisPedidos.innerHTML = '';

    // ── Tarjetas de resumen ──────────────────────────────────────
    const resumen = document.createElement('div');
    resumen.className = 'pedidos-resumen-stats';
    resumen.innerHTML = `
        <div class="stat-card stat-card-azul">
            <div class="stat-num">${totalCompras}</div>
            <div class="stat-label">Pedidos realizados</div>
        </div>
        <div class="stat-card stat-card-verde">
            <div class="stat-num">$${totalGastado.toLocaleString('es-CO')}</div>
            <div class="stat-label">Total acumulado</div>
        </div>
    `;
    listaMisPedidos.appendChild(resumen);

    // ── Etiqueta de sección ──────────────────────────────────────
    const etiqueta = document.createElement('p');
    etiqueta.className = 'pedidos-seccion-label';
    etiqueta.textContent = 'Historial de pedidos';
    listaMisPedidos.appendChild(etiqueta);

    // ── Un acordeón por pedido ───────────────────────────────────
    data.forEach((pedido, idx) => {
        const fechaObj  = new Date(pedido.fecha);
        const fechaDia  = fechaObj.toLocaleDateString('es-CO', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        const fechaHora = fechaObj.toLocaleTimeString('es-CO', {
            hour: '2-digit', minute: '2-digit'
        });

        const items     = pedido.items_pedido || [];
        const numItems  = items.reduce((s, i) => s + i.cantidad, 0);

        // Filas de la tabla de productos
        const filasHtml = items.map(i => `
            <tr>
                <td class="acc-td-nombre">${i.nombre}</td>
                <td class="acc-td-cant">${i.cantidad}</td>
                <td class="acc-td-precio">$${Number(i.precio).toLocaleString('es-CO')}</td>
                <td class="acc-td-sub">$${Number(i.subtotal).toLocaleString('es-CO')}</td>
            </tr>
        `).join('');

        const acordeon = document.createElement('div');
        acordeon.className = 'acordeon-pedido';
        if (idx === 0) acordeon.classList.add('acordeon-primero');

        acordeon.innerHTML = `
            <button class="acordeon-trigger" aria-expanded="false">
                <div class="acordeon-trigger-izq">
                    <span class="acordeon-icono-bolsa">🛒</span>
                    <div class="acordeon-trigger-info">
                        <span class="acordeon-num">Pedido #${pedido.id}</span>
                        <span class="acordeon-meta">
                            <span class="acordeon-fecha-dia">${fechaDia}</span>
                            <span class="acordeon-sep">·</span>
                            <span class="acordeon-hora">🕐 ${fechaHora}</span>
                            <span class="acordeon-sep">·</span>
                            <span class="acordeon-cant-items">${numItems} producto${numItems !== 1 ? 's' : ''}</span>
                        </span>
                    </div>
                </div>
                <div class="acordeon-trigger-der">
                    <span class="acordeon-total">$${Number(pedido.total).toLocaleString('es-CO')}</span>
                    <span class="acordeon-chevron">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                    </span>
                </div>
            </button>

            <div class="acordeon-panel" role="region">
                <div class="acordeon-panel-inner">

                    <!-- Tabla de productos -->
                    <div class="acc-tabla-wrap">
                        <table class="acc-tabla">
                            <thead>
                                <tr>
                                    <th class="acc-th-nombre">Producto</th>
                                    <th class="acc-th-cant">Cant.</th>
                                    <th class="acc-th-precio">Precio u.</th>
                                    <th class="acc-th-sub">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>${filasHtml}</tbody>
                            <tfoot>
                                <tr>
                                    <td colspan="3" class="acc-tfoot-label">Total del pedido</td>
                                    <td class="acc-tfoot-total">$${Number(pedido.total).toLocaleString('es-CO')}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    <!-- Datos de entrega -->
                    <div class="acc-entrega">
                        <div class="acc-entrega-fila">
                            <span class="acc-entrega-icon">📍</span>
                            <span class="acc-entrega-txt">${pedido.direccion || 'Sin dirección registrada'}</span>
                        </div>
                        ${pedido.notas ? `
                        <div class="acc-entrega-fila">
                            <span class="acc-entrega-icon">📝</span>
                            <span class="acc-entrega-txt"><em>${pedido.notas}</em></span>
                        </div>` : ''}
                        <div class="acc-entrega-fila">
                            <span class="acc-entrega-icon">💵</span>
                            <span class="acc-entrega-txt">Pago contra entrega</span>
                        </div>
                    </div>

                </div>
            </div>
        `;

        // ── Lógica acordeón con animación de altura ──────────────
        const trigger = acordeon.querySelector('.acordeon-trigger');
        const panel   = acordeon.querySelector('.acordeon-panel');
        const chevron = acordeon.querySelector('.acordeon-chevron');

        trigger.addEventListener('click', () => {
            const expandido = trigger.getAttribute('aria-expanded') === 'true';

            if (expandido) {
                // Cerrar: animar hacia 0
                panel.style.height = panel.scrollHeight + 'px';
                requestAnimationFrame(() => {
                    panel.style.height = '0px';
                    panel.style.opacity = '0';
                });
                trigger.setAttribute('aria-expanded', 'false');
                acordeon.classList.remove('abierto');
            } else {
                // Abrir: animar desde 0 hasta scrollHeight
                panel.style.height = '0px';
                panel.style.opacity = '0';
                panel.style.display = 'block';
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        panel.style.height  = panel.scrollHeight + 'px';
                        panel.style.opacity = '1';
                    });
                });
                trigger.setAttribute('aria-expanded', 'true');
                acordeon.classList.add('abierto');

                // Al terminar la transición, liberar la altura para que sea flexible
                panel.addEventListener('transitionend', () => {
                    if (acordeon.classList.contains('abierto')) {
                        panel.style.height = 'auto';
                    }
                }, { once: true });
            }
        });

        listaMisPedidos.appendChild(acordeon);
    });
}

// ================================================================
// WHATSAPP AUTO
// ================================================================
function abrirWhatsAppAuto(direccion, nombre, pedidoId, total, items) {
    // Construir lista detallada de productos
    const lineasProductos = items.map(i =>
        `  • *${i.nombre}*\n    ${i.cantidad} x $${Number(i.precio).toLocaleString('es-CO')} = *$${Number(i.subtotal).toLocaleString('es-CO')}*`
    ).join('\n\n');

    const mensaje =
        `📦 *Nuevo Pedido #${pedidoId}*\n\n` +
        `👤 *Cliente:* ${nombre}\n` +
        `📍 *Dirección:* ${direccion}\n\n` +
        `🛒 *Productos:*\n${lineasProductos}\n\n` +
        `💰 *Total a pagar:* $${Number(total).toLocaleString('es-CO')}\n\n` +
        `Hola, acabo de hacer un pedido y me gustaría coordinar la entrega.`;

    const ventana = window.open(`https://wa.me/${WHATSAPP_ADMIN}?text=${encodeURIComponent(mensaje)}`, '_blank');

    if (!ventana || ventana.closed || typeof ventana.closed === 'undefined') {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(mensaje).then(async () => {
                await mostrarAlerta('📱 Se copió el mensaje al portapapeles.\n\nAbre WhatsApp y pega el mensaje para chatear con el vendedor.');
                window.open('https://web.whatsapp.com', '_blank');
            }).catch(() => { prompt('Copia este mensaje y envíalo por WhatsApp:', mensaje); });
        } else {
            prompt('Copia este mensaje y envíalo por WhatsApp:', mensaje);
        }
    }
}

// ================================================================
// INIT
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();

    sb.auth.onAuthStateChange((_event, session) => {
        if (session && !currentUser) {
            currentUser = session.user;
            iniciarSesion();
        }
    });
});