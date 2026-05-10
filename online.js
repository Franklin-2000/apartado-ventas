// ================================================================
// TIENDA ONLINE — online.js
// ================================================================
const SB_URL          = "https://mhnhfdtdpryrjaeaymsa.supabase.co";
const SB_KEY          = "sb_publishable_tiKyjeMyir7LD0EmFCdo8g_CqAXoM8R";
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

    const btnAdmin = document.getElementById('btnPanelAdmin');
    if (btnAdmin) btnAdmin.style.display = esAdmin ? 'inline-flex' : 'none';

    await cargarProductos();
}

btnGoogle.addEventListener('click', async () => {
    await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href }
    });
});

btnLogout.addEventListener('click', async () => {
    await sb.auth.signOut();
    carrito      = [];
    currentUser  = null;
    esAdmin      = false;
    adminUserId  = null;
    mostrarLogin();
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
            <button class="btn-qty-card btn-qty-bajar" title="Restar" ${agotado ? 'disabled' : ''}>−</button>
            <input  class="input-qty-card" type="number" value="1" min="1" max="${p.cantidad}" ${agotado ? 'disabled' : ''}>
            <button class="btn-qty-card btn-qty-subir" title="Sumar"  ${agotado ? 'disabled' : ''}>+</button>
        </div>
        <button class="btn-agregar" ${agotado ? 'disabled' : ''}>
            ${agotado ? 'Agotado' : '🛒 Agregar al carrito'}
        </button>
    `;

    if (!agotado) {
        const inputQty   = card.querySelector('.input-qty-card');
        const btnBajar   = card.querySelector('.btn-qty-bajar');
        const btnSubir   = card.querySelector('.btn-qty-subir');
        const btnAgregar = card.querySelector('.btn-agregar');

        btnSubir.addEventListener('click', () => {
            let v = parseInt(inputQty.value) || 1;
            if (v < p.cantidad) inputQty.value = v + 1;
        });
        btnBajar.addEventListener('click', () => {
            let v = parseInt(inputQty.value) || 1;
            if (v > 1) inputQty.value = v - 1;
        });
        inputQty.addEventListener('focus', () => {
            inputQty.select();
        });
        inputQty.addEventListener('click', () => {
            setTimeout(() => inputQty.select(), 0);
        });
        inputQty.addEventListener('touchend', (e) => {
            e.preventDefault();
            inputQty.focus();
            setTimeout(() => inputQty.select(), 50);
        });
        inputQty.addEventListener('input', () => {
            let v = parseInt(inputQty.value);
            if (isNaN(v) || v < 1)        inputQty.value = 1;
            else if (v > p.cantidad)       inputQty.value = p.cantidad;
        });
        inputQty.addEventListener('blur', () => {
            if (!inputQty.value || parseInt(inputQty.value) < 1) inputQty.value = 1;
        });
        inputQty.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const qty = parseInt(inputQty.value) || 1;
                agregarAlCarritoConQty(p, qty);
                inputQty.value = 1;
            }
        });
        btnAgregar.addEventListener('click', () => {
            const qty = parseInt(inputQty.value) || 1;
            agregarAlCarritoConQty(p, qty);
            inputQty.value = 1;
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

function agregarAlCarritoConQty(producto, qty) {
    qty = parseInt(qty) || 1;
    if (qty < 1) qty = 1;

    const existente       = carrito.find(i => i.producto.id === producto.id);
    const enCarrito       = existente ? existente.qty : 0;
    const stockDisponible = producto.cantidad;

    if (enCarrito >= stockDisponible) {
        alert(`Solo hay ${stockDisponible} unidades disponibles de "${producto.nombre}".`);
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

function cambiarQty(productoId, delta) {
    const item = carrito.find(i => i.producto.id === productoId);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) { quitarDelCarrito(productoId); return; }
    if (item.qty > item.producto.cantidad) {
        item.qty = item.producto.cantidad;
        alert(`Máximo ${item.producto.cantidad} unidades disponibles.`);
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
btnCheckout.addEventListener('click', () => {
    if (carrito.length === 0) { alert('Tu carrito está vacío.'); return; }
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
        alert('Por favor completa nombre, teléfono y dirección.');
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

        alert(`✅ ¡Pedido #${pedidoData.id} recibido!\n\nTe contactaremos para coordinar la entrega.\nEl pago se realizará al momento de la entrega.`);

        setTimeout(() => {
            abrirWhatsAppAuto(direccion, nombre, pedidoData.id, total);
        }, 1000);

    } catch (err) {
        console.error('Error al confirmar pedido:', err);
        alert('Hubo un error al procesar tu pedido. Intenta de nuevo.');
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
            id, estado, total, metodo_pago, fecha, direccion, notas,
            items_pedido (nombre, cantidad, precio, subtotal)
        `)
        .eq('user_id', currentUser.id)
        .order('id', { ascending: false });

    if (error || !data || data.length === 0) {
        listaMisPedidos.innerHTML = '<p style="color:#888; text-align:center; padding:20px;">Aún no tienes pedidos.</p>';
        return;
    }

    listaMisPedidos.innerHTML = '';

    const etiquetaEstado = {
        pendiente:       { texto: '⏳ Pendiente — contra entrega', clase: 'estado-pendiente'  },
        pago_confirmado: { texto: '✅ Pago confirmado',            clase: 'estado-pagado'     },
        despachado:      { texto: '🚚 En camino',                  clase: 'estado-despachado' },
        entregado:       { texto: '📦 Entregado',                  clase: 'estado-entregado'  },
        cancelado:       { texto: '🚫 Cancelado',                  clase: 'estado-cancelado'  },
    };

    data.forEach(pedido => {
        const fecha = new Date(pedido.fecha).toLocaleString('es-CO');
        const etq   = etiquetaEstado[pedido.estado] || { texto: pedido.estado, clase: '' };

        const card = document.createElement('div');
        card.className = 'pedido-card';
        card.innerHTML = `
            <div class="pedido-card-header">
                <div>
                    <div class="pedido-num">Pedido #${pedido.id}</div>
                    <div class="pedido-fecha">${fecha}</div>
                </div>
                <span class="pedido-estado ${etq.clase}">${etq.texto}</span>
                <div class="pedido-total-header">$${Number(pedido.total).toLocaleString('es-CO')}</div>
            </div>
            <div class="pedido-card-body">
                <ul>
                    ${pedido.items_pedido.map(i =>
                        `<li><span>${i.cantidad}x ${i.nombre}</span><span>$${Number(i.subtotal).toLocaleString('es-CO')}</span></li>`
                    ).join('')}
                </ul>
                <div class="pedido-info-extra">
                    📍 ${pedido.direccion || '—'}<br>
                    💵 Contra entrega
                    ${pedido.notas ? `<br>📝 ${pedido.notas}` : ''}
                </div>
            </div>
        `;

        card.querySelector('.pedido-card-header').addEventListener('click', () => {
            const body = card.querySelector('.pedido-card-body');
            body.style.display = body.style.display === 'block' ? 'none' : 'block';
        });

        listaMisPedidos.appendChild(card);
    });
}

// ================================================================
// WHATSAPP AUTO
// ================================================================
function abrirWhatsAppAuto(direccion, nombre, pedidoId, total) {
    const mensaje = `📦 *Nuevo Pedido #${pedidoId}*\n\n` +
        `👤 *Cliente:* ${nombre}\n` +
        `💰 *Total:* $${Number(total).toLocaleString('es-CO')}\n` +
        `📍 *Dirección:* ${direccion}\n\n` +
        `Hola, acabo de hacer un pedido y me gustaría coordinar la entrega.`;

    const ventana = window.open(`https://wa.me/${WHATSAPP_ADMIN}?text=${encodeURIComponent(mensaje)}`, '_blank');

    if (!ventana || ventana.closed || typeof ventana.closed === 'undefined') {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(mensaje).then(() => {
                alert('📱 Se copió el mensaje al portapapeles.\n\nAbre WhatsApp y pega el mensaje para chatear con el vendedor.');
                window.open('https://web.whatsapp.com', '_blank');
            }).catch(() => { prompt('Copia este mensaje y envíalo por WhatsApp:', mensaje); });
        } else {
            prompt('Copia este mensaje y envíalo por WhatsApp:', mensaje);
        }
    }
}

// ================================================================
// ╔══════════════════════════════════════════════════════════════╗
// ║               PANEL ADMINISTRADOR DE PEDIDOS                ║
// ║  Solo visible para el admin. Permite confirmar pedidos,     ║
// ║  marcar como despachado y entregado.                        ║
// ╚══════════════════════════════════════════════════════════════╝
// ================================================================

const ESTADOS_ADMIN = {
    pendiente:       { label: '⏳ Pendiente',      clase: 'estado-pendiente',  acciones: ['pago_confirmado', 'cancelado'] },
    pago_confirmado: { label: '✅ Confirmado',      clase: 'estado-pagado',    acciones: ['despachado'] },
    despachado:      { label: '🚚 Despachado',      clase: 'estado-despachado', acciones: ['entregado'] },
    entregado:       { label: '📦 Entregado',       clase: 'estado-entregado',  acciones: [] },
    cancelado:       { label: '🚫 Cancelado',       clase: 'estado-cancelado',  acciones: [] },
};

const ACCION_LABELS = {
    pago_confirmado: '✅ Confirmar pedido',
    despachado:      '🚚 Marcar despachado',
    entregado:       '📦 Marcar entregado',
    cancelado:       '🚫 Cancelar pedido',
};

// Inyectar el modal del panel admin en el DOM
function inyectarPanelAdmin() {
    if (document.getElementById('modalPanelAdmin')) return;

    const html = `
    <div class="modal-overlay" id="modalPanelAdmin" style="display:none;">
        <div class="modal-box modal-box-admin">
            <button class="modal-cerrar" id="btnCerrarPanelAdmin">✕</button>
            <h2>🛠️ Panel de Pedidos</h2>

            <div class="admin-filtros">
                <button class="btn-filtro-admin activo" data-estado="todos">🏪 Todos</button>
                <button class="btn-filtro-admin" data-estado="pago_confirmado">✅ Confirmados</button>
                <button class="btn-filtro-admin" data-estado="entregado">📦 Entregados</button>
                <button class="btn-filtro-admin" data-estado="cancelado">🚫 Cancelados</button>
            </div>

            <div id="adminListaPedidos" class="admin-lista-pedidos">
                <p>Cargando pedidos...</p>
            </div>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    document.getElementById('btnCerrarPanelAdmin').addEventListener('click', () => {
        document.getElementById('modalPanelAdmin').style.display = 'none';
    });
    document.getElementById('modalPanelAdmin').addEventListener('click', e => {
        if (e.target === document.getElementById('modalPanelAdmin'))
            document.getElementById('modalPanelAdmin').style.display = 'none';
    });

    document.querySelectorAll('.btn-filtro-admin').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-filtro-admin').forEach(b => b.classList.remove('activo'));
            btn.classList.add('activo');
            filtrarPedidosAdmin(btn.dataset.estado);
        });
    });
}

let pedidosAdmin = [];

async function abrirPanelAdmin() {
    document.getElementById('modalPanelAdmin').style.display = 'flex';
    document.getElementById('adminListaPedidos').innerHTML   = '<p class="admin-cargando">Cargando pedidos...</p>';
    await cargarPedidosAdmin();
}

async function cargarPedidosAdmin() {
    const { data, error } = await sb
        .from('pedidos')
        .select(`
            id, estado, total, metodo_pago, fecha,
            cliente_nombre, cliente_email, cliente_tel,
            direccion, notas, fecha_confirmacion,
            items_pedido (nombre, cantidad, precio, subtotal)
        `)
        .order('id', { ascending: false });

    if (error) {
        document.getElementById('adminListaPedidos').innerHTML =
            `<p style="color:red; padding:20px;">Error al cargar pedidos: ${error.message}</p>`;
        return;
    }

    pedidosAdmin = data || [];
    filtrarPedidosAdmin('todos');
}

function filtrarPedidosAdmin(estado) {
    let lista;
    if (estado === 'todos') {
        lista = pedidosAdmin;
    } else if (estado === 'pago_confirmado') {
        // "Confirmados" agrupa pendientes activos y confirmados en proceso
        lista = pedidosAdmin.filter(p =>
            ['pendiente', 'pago_confirmado', 'despachado'].includes(p.estado)
        );
    } else {
        lista = pedidosAdmin.filter(p => p.estado === estado);
    }
    renderPedidosAdmin(lista);
}

function renderPedidosAdmin(lista) {
    const contenedor = document.getElementById('adminListaPedidos');

    if (lista.length === 0) {
        contenedor.innerHTML = '<p class="admin-vacio">No hay pedidos en este estado.</p>';
        return;
    }

    contenedor.innerHTML = '';

    lista.forEach(pedido => {
        const estadoInfo = ESTADOS_ADMIN[pedido.estado] || { label: pedido.estado, clase: '', acciones: [] };
        const fecha      = new Date(pedido.fecha).toLocaleString('es-CO');

        const card = document.createElement('div');
        card.className       = 'admin-pedido-card';
        card.dataset.pedidoId = pedido.id;

        const botonesAccion = estadoInfo.acciones.map(accion => `
            <button class="btn-accion-admin btn-accion-${accion}"
                    data-pedido="${pedido.id}"
                    data-accion="${accion}">
                ${ACCION_LABELS[accion] || accion}
            </button>
        `).join('');

        card.innerHTML = `
            <div class="admin-pedido-header" data-toggle="${pedido.id}">
                <div class="admin-pedido-id-fecha">
                    <span class="admin-pedido-num">Pedido #${pedido.id}</span>
                    <span class="admin-pedido-fecha">${fecha}</span>
                </div>
                <span class="pedido-estado ${estadoInfo.clase}">${estadoInfo.label}</span>
                <span class="admin-pedido-total">$${Number(pedido.total).toLocaleString('es-CO')}</span>
                <span class="admin-toggle-icon">▼</span>
            </div>
            <div class="admin-pedido-body" id="admin-body-${pedido.id}" style="display:none;">
                <div class="admin-cliente-info">
                    <strong>👤 ${pedido.cliente_nombre}</strong>
                    <span>📧 ${pedido.cliente_email}</span>
                    <span>📞 ${pedido.cliente_tel}</span>
                    <span>📍 ${pedido.direccion}</span>
                    <span>💵 Contra entrega</span>
                    ${pedido.notas ? `<span>📝 ${pedido.notas}</span>` : ''}
                </div>
                <div class="admin-items-lista">
                    <table class="admin-tabla-items">
                        <thead>
                            <tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr>
                        </thead>
                        <tbody>
                            ${pedido.items_pedido.map(i => `
                                <tr>
                                    <td>${i.nombre}</td>
                                    <td>${i.cantidad}</td>
                                    <td>$${Number(i.precio).toLocaleString('es-CO')}</td>
                                    <td>$${Number(i.subtotal).toLocaleString('es-CO')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="3"><strong>Total</strong></td>
                                <td><strong>$${Number(pedido.total).toLocaleString('es-CO')}</strong></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                ${botonesAccion ? `<div class="admin-acciones">${botonesAccion}</div>` : ''}
            </div>
        `;

        card.querySelector(`[data-toggle="${pedido.id}"]`).addEventListener('click', () => {
            const body = document.getElementById(`admin-body-${pedido.id}`);
            const icon = card.querySelector('.admin-toggle-icon');
            const abierto = body.style.display === 'block';
            body.style.display = abierto ? 'none' : 'block';
            icon.textContent   = abierto ? '▼' : '▲';
        });

        card.querySelectorAll('.btn-accion-admin').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const pedidoId    = parseInt(btn.dataset.pedido);
                const nuevaAccion = btn.dataset.accion;
                await cambiarEstadoPedido(pedidoId, nuevaAccion, btn);
            });
        });

        contenedor.appendChild(card);
    });
}

async function cambiarEstadoPedido(pedidoId, nuevoEstado, btnEl) {
    const confirmMsg = {
        pago_confirmado: `¿Confirmar el pedido #${pedidoId}?\n\nEsto descontará el inventario automáticamente.`,
        despachado:      `¿Marcar el pedido #${pedidoId} como despachado?`,
        entregado:       `¿Marcar el pedido #${pedidoId} como entregado?`,
        cancelado:       `¿Cancelar el pedido #${pedidoId}?`,
    };

    if (!confirm(confirmMsg[nuevoEstado] || `¿Cambiar estado a "${nuevoEstado}"?`)) return;

    const textoOriginal  = btnEl.textContent;
    btnEl.disabled       = true;
    btnEl.textContent    = 'Procesando...';

    try {
        const { error } = await sb.rpc('cambiar_estado_pedido', {
            p_pedido_id:    pedidoId,
            p_nuevo_estado: nuevoEstado
        });

        if (error) throw error;

        alert(`✅ Pedido #${pedidoId} actualizado a: ${ACCION_LABELS[nuevoEstado] || nuevoEstado}`);

        await cargarPedidosAdmin();

        const filtroActivo = document.querySelector('.btn-filtro-admin.activo');
        if (filtroActivo) filtrarPedidosAdmin(filtroActivo.dataset.estado);

    } catch (err) {
        console.error('Error al cambiar estado:', err);
        alert(`❌ Error: ${err.message || 'No se pudo cambiar el estado.'}`);
        btnEl.disabled    = false;
        btnEl.textContent = textoOriginal;
    }
}

// ================================================================
// INIT
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
    inyectarPanelAdmin();

    const btnAdmin = document.getElementById('btnPanelAdmin');
    if (btnAdmin) {
        btnAdmin.style.display = 'none';
        btnAdmin.addEventListener('click', abrirPanelAdmin);
    }

    checkAuth();

    sb.auth.onAuthStateChange((_event, session) => {
        if (session && !currentUser) {
            currentUser = session.user;
            iniciarSesion();
        }
    });
});