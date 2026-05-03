// ================================================================
// TIENDA ONLINE — scrip.js (versión definitiva)
// ================================================================
// *** REEMPLAZA ESTOS VALORES ***
const SB_URL          = "https://mhnhfdtdpryrjaeaymsa.supabase.co";
const SB_KEY          = "sb_publishable_tiKyjeMyir7LD0EmFCdo8g_CqAXoM8R";
const WOMPI_PUBLIC_KEY = "prv_test_BtjEYzhymGXEGuIHXqtTkwK012YHRoVy"; // 
const WOMPI_INTEGRITY_SECRET = "test_integrity_qTioWDOwgynT8K9DSIHGkDCncyWHOiLz"; 
const WHATSAPP_ADMIN   = "573248298649"; 

const sb = supabase.createClient(SB_URL, SB_KEY);

// ================================================================
// ESTADO GLOBAL
// ================================================================
let currentUser = null;
let productos   = [];
let carrito     = [];   // [{ producto, qty }]

// ================================================================
// DOM
// ================================================================
const pantLogin           = document.getElementById('pantalla-login');
const pantTienda          = document.getElementById('pantalla-tienda');
const btnGoogle           = document.getElementById('btnGoogle');
const btnLogout           = document.getElementById('btnLogout');
const productosGrid       = document.getElementById('productosGrid');
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
        await mostrarTienda();
    } else {
        mostrarLogin();
    }
}

function mostrarLogin() {
    pantLogin.style.display = 'flex';
    pantTienda.style.display = 'none';
}

async function mostrarTienda() {
    pantLogin.style.display = 'none';
    pantTienda.style.display = 'block';
    await cargarProductos();
    verificarRetornoWompi();
}

btnGoogle.addEventListener('click', async () => {
    await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href }
    });
});

btnLogout.addEventListener('click', async () => {
    await sb.auth.signOut();
    carrito = [];
    currentUser = null;
    mostrarLogin();
});

// ================================================================
// PRODUCTOS — carga desde Supabase
// Solo muestra los que tienen stock > 0
// ================================================================
async function cargarProductos() {
    loadingMsg.style.display = 'block';
    productosGrid.innerHTML  = '';
    emptyMsg.style.display   = 'none';

    const { data, error } = await sb
        .from('productos')
        .select('*')
        .gt('cantidad', 0)
        .order('nombre', { ascending: true });

    loadingMsg.style.display = 'none';

    if (error) {
        emptyMsg.style.display  = 'block';
        emptyMsg.textContent    = 'Error al cargar productos. Intenta de nuevo.';
        console.error(error);
        return;
    }

    productos = data || [];
    if (productos.length === 0) { emptyMsg.style.display = 'block'; return; }
    renderProductos(productos);
}

function renderProductos(lista) {
    productosGrid.innerHTML = '';
    emptyMsg.style.display  = lista.length === 0 ? 'block' : 'none';

    lista.forEach((p, i) => {
        const card = document.createElement('div');
        card.className = 'tarjeta-tienda';
        card.style.animationDelay = `${i * 0.05}s`;

        const agotado = p.cantidad === 0;

        card.innerHTML = `
            <img src="${p.imagen || 'https://via.placeholder.com/300x200?text=Sin+imagen'}"
                 alt="${p.nombre}"
                 onerror="this.src='https://via.placeholder.com/300x200?text=Sin+imagen'">
            <div class="tarjeta-info">
                <div class="tarjeta-nombre">${p.nombre}</div>
                <div class="tarjeta-precio">$${Number(p.precio).toLocaleString('es-CO')}</div>
                <div class="tarjeta-stock ${agotado ? 'agotado' : ''}">
                    ${agotado ? 'Agotado' : `${p.cantidad} disponibles`}
                </div>
            </div>
            <button class="btn-agregar" data-id="${p.id}" ${agotado ? 'disabled' : ''}>
                ${agotado ? 'Agotado' : '+ Agregar al carrito'}
            </button>
        `;

        card.querySelector('.btn-agregar').addEventListener('click', () => agregarAlCarrito(p));
        productosGrid.appendChild(card);
    });
}

// Búsqueda en tiempo real
inputBuscar.addEventListener('input', () => {
    const term = inputBuscar.value.trim().toLowerCase();
    if (!term) { renderProductos(productos); return; }
    renderProductos(productos.filter(p =>
        p.nombre.toLowerCase().includes(term) ||
        (p['codigoBarras'] && p['codigoBarras'].includes(term))
    ));
});

// ================================================================
// CARRITO
// ================================================================
function agregarAlCarrito(producto) {
    const existente      = carrito.find(i => i.producto.id === producto.id);
    const enCarrito      = existente ? existente.qty : 0;
    const stockDisponible = producto.cantidad;

    if (enCarrito >= stockDisponible) {
        alert(`Solo hay ${stockDisponible} unidades disponibles de "${producto.nombre}".`);
        return;
    }

    if (existente) { existente.qty++; }
    else           { carrito.push({ producto, qty: 1 }); }

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
// CHECKOUT — resumen y formulario
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
    modalCheckout.style.display   = 'flex';
}

btnCerrarCheckout.addEventListener('click',  () => { modalCheckout.style.display = 'none'; });
modalCheckout.addEventListener('click', e => { if (e.target === modalCheckout) modalCheckout.style.display = 'none'; });

function limpiarFormCheckout() {
    document.getElementById('chkNombre').value    = '';
    document.getElementById('chkTelefono').value  = '';
    document.getElementById('chkDireccion').value = '';
    document.getElementById('chkNotas').value     = '';
    document.querySelector('input[name="metodoPago"][value="contraentrega"]').checked = true;
}

// ================================================================
// CONFIRMAR PEDIDO
// El pedido se guarda en estado 'pendiente' o 'esperando_pago'.
// El inventario NO se toca aquí — lo hace el trigger en Supabase
// cuando el admin confirma el pago.
// ================================================================
btnConfirmarPedido.addEventListener('click', async () => {
    const nombre    = document.getElementById('chkNombre').value.trim();
    const telefono  = document.getElementById('chkTelefono').value.trim();
    const direccion = document.getElementById('chkDireccion').value.trim();
    const notas     = document.getElementById('chkNotas').value.trim();
    const metodo    = document.querySelector('input[name="metodoPago"]:checked').value;

    if (!nombre || !telefono || !direccion) {
        alert('Por favor completa nombre, teléfono y dirección.');
        return;
    }

    const total = carrito.reduce((s, i) => s + i.qty * Number(i.producto.precio), 0);

    btnConfirmarPedido.disabled    = true;
    btnConfirmarPedido.textContent = 'Procesando...';

    try {
        // 1. Crear el pedido en Supabase
        //    Estado inicial según método de pago:
        //    - contraentrega → 'pendiente'    (admin confirma manualmente)
        //    - wompi         → 'esperando_pago' (se actualiza cuando Wompi confirma)
        const estadoInicial = metodo === 'contraentrega' ? 'pendiente' : 'esperando_pago';

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
                metodo_pago:    metodo,
                estado:         estadoInicial,
                fecha:          new Date().toISOString()
            }])
            .select()
            .single();

        if (pedidoError) throw pedidoError;

        // 2. Guardar los items del pedido
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

        // 3. Wompi: redirigir al checkout de pago
        if (metodo === 'wompi') {
            await redirigirWompi(pedidoData, total, nombre, currentUser.email, telefono);
            return;
        }

        // 4. Contra entrega: confirmar al usuario
        //    El inventario NO se descuenta todavía — lo hace el admin al confirmar
        carrito = [];
        actualizarCarritoUI();
        modalCheckout.style.display = 'none';
        limpiarFormCheckout();
        
        const mensajeConfirmacion = `✅ ¡Pedido #${pedidoData.id} recibido!\n\n` +
            `Te contactaremos para coordinar la entrega.\n` +
            `El pago se realizará al momento de la entrega.`;
        
        alert(mensajeConfirmacion);
        
        // Redirigir automáticamente a WhatsApp para chatear con el vendedor
        if (metodo === 'contraentrega') {
            setTimeout(() => {
                abrirWhatsAppAuto(direccion, nombre, pedidoData.id, total);
            }, 1000);
        }

    } catch (err) {
        console.error('Error al confirmar pedido:', err);
        alert('Hubo un error al procesar tu pedido. Intenta de nuevo.');
    } finally {
        btnConfirmarPedido.disabled    = false;
        btnConfirmarPedido.textContent = 'Confirmar Pedido';
    }
});

// ================================================================
// WOMPI — redirección al checkout
// ================================================================
async function redirigirWompi(pedido, total, nombre, email, telefono) {
    const montoCentavos = Math.round(total * 100);
    const referencia    = `PEDIDO-${pedido.id}-${Date.now()}`;
    const urlRetorno    = `${window.location.origin}${window.location.pathname}?pedido_id=${pedido.id}&referencia=${referencia}`;

    // ✅ Generar firma de integridad
    const firma = await generarFirmaIntegridad(referencia, montoCentavos, 'COP', WOMPI_INTEGRITY_SECRET);

    const wompiUrl = new URL('https://checkout.wompi.co/p/');
    wompiUrl.searchParams.set('public-key',                        WOMPI_PUBLIC_KEY);
    wompiUrl.searchParams.set('currency',                          'COP');
    wompiUrl.searchParams.set('amount-in-cents',                   montoCentavos);
    wompiUrl.searchParams.set('reference',                         referencia);
    wompiUrl.searchParams.set('signature:integrity',               firma);  // ✅ firma
    wompiUrl.searchParams.set('redirect-url',                      urlRetorno);
    wompiUrl.searchParams.set('customer-data:email',               email);
    wompiUrl.searchParams.set('customer-data:full-name',           nombre);
    wompiUrl.searchParams.set('customer-data:phone-number',        telefono);
    wompiUrl.searchParams.set('customer-data:phone-number-prefix', '+57');

    localStorage.setItem('wompi_pedido_id',  pedido.id);
    localStorage.setItem('wompi_referencia', referencia);

    window.location.href = wompiUrl.toString();
}

// ================================================================
// WOMPI — retorno después del pago
// Cuando Wompi redirige de vuelta a la tienda, verificamos el
// estado de la transacción y actualizamos el pedido.
//
// Si el pago fue APROBADO → estado 'pago_confirmado'
// Esto dispara el trigger que descuenta el inventario automáticamente.
// ================================================================
async function verificarRetornoWompi() {
    const params      = new URLSearchParams(window.location.search);
    const pedidoId    = params.get('pedido_id');
    const referencia  = params.get('referencia');

    if (!pedidoId || !referencia) return;

    // Limpiar la URL sin recargar
    window.history.replaceState({}, '', window.location.pathname);

    try {
        // Consultar estado en la API de Wompi
        // En producción usa: https://production.wompi.co/v1/transactions
        // En pruebas usa:    https://sandbox.wompi.co/v1/transactions
        const res  = await fetch(`https://sandbox.wompi.co/v1/transactions?reference=${referencia}`, {
            headers: { 'Authorization': `Bearer ${WOMPI_PUBLIC_KEY}` }
        });
        const json = await res.json();
        const transacciones = json.data || [];
        const aprobada = transacciones.find(t => t.status === 'APPROVED');

        if (aprobada) {
            // Pago aprobado → 'pago_confirmado'
            // El trigger de Supabase descuenta el inventario al recibir este estado
            const { error } = await sb
                .from('pedidos')
                .update({
                    estado:               'pago_confirmado',
                    wompi_transaction_id: aprobada.id
                })
                .eq('id', parseInt(pedidoId));

            if (error) throw error;

            carrito = [];
            actualizarCarritoUI();
            limpiarFormCheckout();
            alert(
                `✅ ¡Pago aprobado!\n` +
                `Tu pedido #${pedidoId} fue confirmado y el inventario actualizado.\n` +
                `Recibirás tu pedido pronto.`
            );
        } else {
            // Pago fallido o pendiente
            await sb
                .from('pedidos')
                .update({ estado: 'pago_fallido' })
                .eq('id', parseInt(pedidoId));

            alert(
                `❌ El pago no pudo completarse.\n` +
                `Tu pedido #${pedidoId} fue marcado como fallido.\n` +
                `Puedes intentarlo de nuevo desde "Mis Pedidos".`
            );
        }
    } catch (err) {
        console.error('Error verificando pago Wompi:', err);
    }
}

// ================================================================
// MIS PEDIDOS — el cliente ve el estado de sus pedidos
// ================================================================
btnMisPedidos.addEventListener('click', async () => {
    modalMisPedidos.style.display  = 'flex';
    listaMisPedidos.innerHTML      = '<p>Cargando...</p>';
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
        pendiente:       { texto: 'Pendiente — contra entrega',    clase: 'estado-pendiente'  },
        esperando_pago:  { texto: 'Esperando pago online',         clase: 'estado-pendiente'  },
        pago_confirmado: { texto: '✅ Pago confirmado',            clase: 'estado-pagado'     },
        despachado:      { texto: '🚚 En camino',                  clase: 'estado-despachado' },
        entregado:       { texto: '📦 Entregado',                  clase: 'estado-entregado'  },
        pago_fallido:    { texto: '❌ Pago fallido',               clase: 'estado-cancelado'  },
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
                        `<li>
                            <span>${i.cantidad}x ${i.nombre}</span>
                            <span>$${Number(i.subtotal).toLocaleString('es-CO')}</span>
                        </li>`
                    ).join('')}
                </ul>
                <div class="pedido-info-extra">
                    📍 ${pedido.direccion || '—'}<br>
                    💳 ${pedido.metodo_pago === 'contraentrega' ? 'Contra entrega' : 'Online (Wompi)'}
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
// WHATSAPP AUTO —-redirige automáticamente después del pedido
// ================================================================

/**
 * Abre WhatsApp automáticamente después de confirmar pedido
 * @param {string} direccion - Dirección de entrega
 * @param {string} nombre - Nombre del cliente
 * @param {number} pedidoId - ID del pedido
 * @param {number} total - Total del pedido
 */
function abrirWhatsAppAuto(direccion, nombre, pedidoId, total) {
    // Crear mensaje con los detalles del pedido
    const mensaje = `📦 *Nuevo Pedido #${pedidoId}*\n\n` +
        `👤 *Cliente:* ${nombre}\n` +
        `💰 *Total:* $${Number(total).toLocaleString('es-CO')}\n` +
        `📍 *Dirección:* ${direccion}\n\n` +
        `Hola, acabo de hacer un pedido y me gustaría coordinar la entrega.`;
    
    const mensajeEncoded = encodeURIComponent(mensaje);
    const urlWhatsApp = `https://wa.me/${WHATSAPP_ADMIN}?text=${mensajeEncoded}`;
    
    console.log('Abriendo WhatsApp automáticamente:', urlWhatsApp);
    
    // Intentar abrir WhatsApp
    const ventana = window.open(urlWhatsApp, '_blank');
    
    // Verificar si se abrió correctamente
    if (!ventana || ventana.closed || typeof ventana.closed === 'undefined') {
        // Popup bloqueado - copiar al portapapeles
        console.log('Popup bloqueado - copiando al portapapeles');
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(mensaje).then(() => {
                alert('📱 Se copió el mensaje al portapapeles.\n\n' +
                      'Abre WhatsApp y pega el mensaje para chatear con el vendedor.');
                window.open('https://web.whatsapp.com', '_blank');
            }).catch(() => {
                prompt('Copia este mensaje y envíalo por WhatsApp:', mensaje);
            });
        } else {
            prompt('Copia este mensaje y envíalo por WhatsApp:', mensaje);
        }
    }
}

async function generarFirmaIntegridad(referencia, montoCentavos, moneda, secretoIntegridad) {
    const cadena = `${referencia}${Math.round(montoCentavos)}${moneda}${secretoIntegridad}`;
    
    const encoder = new TextEncoder();
    const data = encoder.encode(cadena);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ================================================================
// INIT
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();

    // Escucha cambios de sesión (ej: cuando Google redirige de vuelta)
    sb.auth.onAuthStateChange((_event, session) => {
        if (session && !currentUser) {
            currentUser = session.user;
            mostrarTienda();
        }
    });
});