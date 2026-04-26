-- ================================================================
-- TIENDA ONLINE — SQL DEFINITIVO
-- Ejecuta esto completo en Supabase SQL Editor
-- ================================================================
-- FLUJO DE INVENTARIO:
--   - El cliente hace el pedido → inventario NO se toca
--   - El admin confirma el pago → trigger descuenta inventario
--     y registra la venta en el historial del panel admin
-- ================================================================

-- Limpia si ya ejecutaste versiones anteriores
DROP TRIGGER  IF EXISTS trg_descontar_inventario_pedido ON pedidos;
DROP FUNCTION IF EXISTS fn_descontar_inventario_pedido();
DROP TABLE    IF EXISTS items_pedido CASCADE;
DROP TABLE    IF EXISTS pedidos      CASCADE;


-- ================================================================
-- TABLA: pedidos
-- ================================================================
CREATE TABLE IF NOT EXISTS pedidos (
    id                      BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id                 UUID            NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    cliente_nombre          TEXT            NOT NULL,
    cliente_email           TEXT            NOT NULL,
    cliente_tel             TEXT            NOT NULL,
    direccion               TEXT            NOT NULL,
    notas                   TEXT,
    total                   NUMERIC(12,2)   NOT NULL,
    metodo_pago             TEXT            NOT NULL
                                CHECK (metodo_pago IN ('contraentrega','wompi')),
    -- Estados:
    --   pendiente       → contra entrega recibido, esperando despacho
    --   esperando_pago  → Wompi iniciado, esperando confirmación
    --   pago_confirmado → admin confirma el pago (aquí descuenta inventario)
    --   despachado      → admin lo marcó como enviado
    --   entregado       → cliente recibió el paquete
    --   pago_fallido    → Wompi rechazó el pago
    --   cancelado       → cancelado
    estado                  TEXT            NOT NULL DEFAULT 'pendiente'
                                CHECK (estado IN (
                                    'pendiente',
                                    'esperando_pago',
                                    'pago_confirmado',
                                    'despachado',
                                    'entregado',
                                    'pago_fallido',
                                    'cancelado'
                                )),
    wompi_transaction_id    TEXT,
    fecha                   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    fecha_confirmacion      TIMESTAMPTZ,    -- cuando el admin confirma el pago
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_user_id ON pedidos (user_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado  ON pedidos (estado);


-- ================================================================
-- TABLA: items_pedido
-- ================================================================
CREATE TABLE IF NOT EXISTS items_pedido (
    id          BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pedido_id   BIGINT          NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    product_id  BIGINT          REFERENCES productos(id) ON DELETE SET NULL,
    nombre      TEXT            NOT NULL,
    cantidad    INT             NOT NULL CHECK (cantidad > 0),
    precio      NUMERIC(12,2)   NOT NULL,
    subtotal    NUMERIC(12,2)   NOT NULL,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_items_pedido_pedido_id  ON items_pedido (pedido_id);
CREATE INDEX IF NOT EXISTS idx_items_pedido_product_id ON items_pedido (product_id);


-- ================================================================
-- TRIGGER: Descuenta inventario cuando el admin confirma el pago
-- Se dispara al cambiar estado a 'pago_confirmado'
-- ================================================================
CREATE OR REPLACE FUNCTION fn_descontar_inventario_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_venta_id   BIGINT;
    v_admin_id   UUID;
    v_stock_neg  INT;
BEGIN
    -- *** Solo actúa cuando el estado cambia A 'pago_confirmado' ***
    IF NEW.estado = 'pago_confirmado' AND OLD.estado <> 'pago_confirmado' THEN

        -- 1. Verificar stock suficiente ANTES de descontar
        SELECT COUNT(*) INTO v_stock_neg
        FROM items_pedido ip
        JOIN productos p ON p.id = ip.product_id
        WHERE ip.pedido_id = NEW.id
          AND p.cantidad < ip.cantidad;

        IF v_stock_neg > 0 THEN
            RAISE EXCEPTION
                'Stock insuficiente en uno o más productos del pedido #%. Verifica el inventario.',
                NEW.id;
        END IF;

        -- 2. Descontar inventario
        UPDATE productos p
        SET
            cantidad   = p.cantidad - ip.cantidad,
            updated_at = NOW()
        FROM items_pedido ip
        WHERE ip.pedido_id = NEW.id
          AND ip.product_id = p.id;

        -- 3. Marcar fecha de confirmación
        NEW.fecha_confirmacion := NOW();

        -- 4. Buscar al admin de la tienda para registrar la venta en su historial
        --    IMPORTANTE: reemplaza el email con el tuyo real
        SELECT id INTO v_admin_id
        FROM auth.users
        WHERE email = 'tu-email-admin@gmail.com'   -- ← CAMBIA ESTO
        LIMIT 1;

        -- 5. Si encontró al admin, registra en historial de ventas
        IF v_admin_id IS NOT NULL THEN

            INSERT INTO ventas (
                global_id, numero_ticket, total,
                fecha, fecha_limpia, user_id
            ) VALUES (
                EXTRACT(EPOCH FROM NOW())::BIGINT,
                'ONLINE-' || NEW.id,
                NEW.total,
                TO_CHAR(NOW(), 'DD/MM/YYYY, HH24:MI:SS'),
                TO_CHAR(NOW(), 'DD/MM/YYYY'),
                v_admin_id
            )
            RETURNING id INTO v_venta_id;

            INSERT INTO items_venta (
                venta_id, product_id, nombre,
                cantidad, precio, subtotal, user_id
            )
            SELECT
                v_venta_id,
                ip.product_id,
                ip.nombre,
                ip.cantidad,
                ip.precio,
                ip.subtotal,
                v_admin_id
            FROM items_pedido ip
            WHERE ip.pedido_id = NEW.id;

        END IF;

    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_descontar_inventario_pedido
BEFORE UPDATE ON pedidos
FOR EACH ROW
EXECUTE FUNCTION fn_descontar_inventario_pedido();


-- ================================================================
-- ROW LEVEL SECURITY
-- ================================================================

ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;

-- Clientes ven sus propios pedidos
CREATE POLICY "pedidos: cliente select"
    ON pedidos FOR SELECT
    USING (auth.uid() = user_id);

-- Clientes crean sus pedidos
CREATE POLICY "pedidos: cliente insert"
    ON pedidos FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Clientes pueden cancelar si aún no fue confirmado
CREATE POLICY "pedidos: cliente cancelar"
    ON pedidos FOR UPDATE
    USING (
        auth.uid() = user_id
        AND estado IN ('pendiente', 'esperando_pago')
    );

-- *** EL ADMIN VE TODOS LOS PEDIDOS ***
-- Usamos una función auxiliar para verificar si es admin por email
-- Esto permite que el admin use la misma anon key del frontend
CREATE OR REPLACE FUNCTION es_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM auth.users
        WHERE id = auth.uid()
          AND email = 'tu-email-admin@gmail.com'  -- ← CAMBIA ESTO (mismo email de arriba)
    );
$$;

CREATE POLICY "pedidos: admin select todo"
    ON pedidos FOR SELECT
    USING (es_admin());

CREATE POLICY "pedidos: admin update todo"
    ON pedidos FOR UPDATE
    USING (es_admin());


ALTER TABLE items_pedido ENABLE ROW LEVEL SECURITY;

CREATE POLICY "items_pedido: cliente select"
    ON items_pedido FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM pedidos p
            WHERE p.id = items_pedido.pedido_id
              AND p.user_id = auth.uid()
        )
    );

CREATE POLICY "items_pedido: cliente insert"
    ON items_pedido FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM pedidos p
            WHERE p.id = items_pedido.pedido_id
              AND p.user_id = auth.uid()
        )
    );

CREATE POLICY "items_pedido: admin select todo"
    ON items_pedido FOR SELECT
    USING (es_admin());


-- ================================================================
-- POLÍTICA EN PRODUCTOS: lectura para todos los usuarios autenticados
-- Necesario para que los clientes de la tienda vean el catálogo
-- ================================================================
-- Elimina la política restrictiva existente si solo permitía al dueño
DROP POLICY IF EXISTS "productos: select propio" ON productos;

-- Política nueva: el dueño ve todos sus productos (para gestionar)
CREATE POLICY "productos: select propio"
    ON productos FOR SELECT
    USING (auth.uid() = user_id);

-- Política adicional: cualquier usuario autenticado puede ver
-- productos con stock > 0 (para la tienda online)
CREATE POLICY "productos: select tienda"
    ON productos FOR SELECT
    USING (auth.role() = 'authenticated' AND cantidad > 0);


-- ================================================================
-- NOTAS FINALES
-- ================================================================
-- 1. Reemplaza 'tu-email-admin@gmail.com' en DOS lugares:
--    a) Dentro del trigger fn_descontar_inventario_pedido
--    b) Dentro de la función es_admin()
--
-- 2. El flujo de estados es:
--    Cliente pide → [pendiente | esperando_pago]
--    Admin confirma → [pago_confirmado]  ← inventario se descuenta aquí
--    Admin despacha → [despachado]
--    Cliente recibe → [entregado]
--
-- 3. Para Wompi: la tienda (scrip.js) actualiza automáticamente
--    a 'pago_confirmado' cuando Wompi retorna APPROVED.
--    Para contra entrega, el admin lo confirma manualmente.
-- ================================================================