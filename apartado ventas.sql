-- ================================================================
-- TABLAS PARA LA TIENDA ONLINE
-- Ejecuta esto en el SQL Editor de tu proyecto Supabase
-- ================================================================


-- ----------------------------------------------------------------
-- TABLA: pedidos
-- Cabecera de cada pedido hecho por un cliente
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedidos (
    id                      BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id                 UUID            NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    cliente_nombre          TEXT            NOT NULL,
    cliente_email           TEXT            NOT NULL,
    cliente_tel             TEXT            NOT NULL,
    direccion               TEXT            NOT NULL,
    notas                   TEXT,
    total                   NUMERIC(12,2)   NOT NULL,
    metodo_pago             TEXT            NOT NULL CHECK (metodo_pago IN ('contraentrega','wompi')),
    -- Estados posibles:
    -- pendiente      → pedido contra entrega, esperando despacho
    -- esperando_pago → pedido online, esperando confirmación de Wompi
    -- pagado         → Wompi confirmó el pago
    -- entregado      → domiciliario confirmó entrega (descuenta inventario)
    -- pago_fallido   → pago online rechazado
    -- cancelado      → cancelado manualmente
    estado                  TEXT            NOT NULL DEFAULT 'pendiente'
                                CHECK (estado IN ('pendiente','esperando_pago','pagado','entregado','pago_fallido','cancelado')),
    wompi_transaction_id    TEXT,           -- ID de transacción Wompi (si aplica)
    fecha                   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    fecha_entrega           TIMESTAMPTZ,    -- Se llena cuando el domiciliario confirma
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_user_id ON pedidos (user_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado  ON pedidos (estado);


-- ----------------------------------------------------------------
-- TABLA: items_pedido
-- Líneas de detalle de cada pedido
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS items_pedido (
    id          BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pedido_id   BIGINT          NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    product_id  BIGINT          REFERENCES productos(id) ON DELETE SET NULL,
    nombre      TEXT            NOT NULL,   -- snapshot del nombre al momento del pedido
    cantidad    INT             NOT NULL CHECK (cantidad > 0),
    precio      NUMERIC(12,2)   NOT NULL,   -- snapshot del precio al momento del pedido
    subtotal    NUMERIC(12,2)   NOT NULL,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_items_pedido_pedido_id   ON items_pedido (pedido_id);
CREATE INDEX IF NOT EXISTS idx_items_pedido_product_id  ON items_pedido (product_id);


-- ----------------------------------------------------------------
-- TRIGGER: Descontar inventario SOLO cuando el pedido pasa a 'entregado'
-- El stock NO se descuenta al crear el pedido, sino cuando el
-- domiciliario confirma la entrega desde el panel admin.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_descontar_inventario_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Solo actúa cuando el estado cambia A 'entregado'
    IF NEW.estado = 'entregado' AND OLD.estado <> 'entregado' THEN

        -- Registrar la venta en la tabla `ventas` (historial del admin)
        INSERT INTO ventas (global_id, numero_ticket, total, fecha, fecha_limpia, user_id)
        SELECT
            EXTRACT(EPOCH FROM NOW())::BIGINT,
            'ONLINE-' || NEW.id,
            NEW.total,
            TO_CHAR(NOW(), 'DD/MM/YYYY, HH24:MI:SS'),
            TO_CHAR(NOW(), 'DD/MM/YYYY'),
            NEW.user_id  -- user_id del admin de la tienda (ver nota abajo)
        ;

        -- Obtener el id de la venta recién insertada
        DECLARE venta_id BIGINT;
        SELECT id INTO venta_id FROM ventas
        WHERE numero_ticket = 'ONLINE-' || NEW.id
        LIMIT 1;

        -- Descontar inventario y registrar items en ventas por cada item del pedido
        UPDATE productos p
        SET
            cantidad   = p.cantidad - ip.cantidad,
            updated_at = NOW()
        FROM items_pedido ip
        WHERE ip.pedido_id = NEW.id
          AND ip.product_id = p.id;

        -- Registrar items en items_venta para que aparezcan en el historial del admin
        INSERT INTO items_venta (venta_id, product_id, nombre, cantidad, precio, subtotal, user_id)
        SELECT
            venta_id,
            ip.product_id,
            ip.nombre,
            ip.cantidad,
            ip.precio,
            ip.subtotal,
            NEW.user_id
        FROM items_pedido ip
        WHERE ip.pedido_id = NEW.id;

        -- Marcar la fecha de entrega
        NEW.fecha_entrega = NOW();

    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_descontar_inventario_pedido ON pedidos;

CREATE TRIGGER trg_descontar_inventario_pedido
BEFORE UPDATE ON pedidos
FOR EACH ROW
EXECUTE FUNCTION fn_descontar_inventario_pedido();


-- ----------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------

-- pedidos: el cliente ve y crea solo los suyos
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pedidos: select propio"
    ON pedidos FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "pedidos: insert propio"
    ON pedidos FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- El update lo hace el trigger del admin (service role), no el cliente
-- Si quieres permitir cancelación por parte del cliente:
CREATE POLICY "pedidos: cancelar propio"
    ON pedidos FOR UPDATE
    USING (auth.uid() = user_id AND estado IN ('pendiente', 'esperando_pago'));


-- items_pedido: el cliente ve los suyos a través del join con pedidos
ALTER TABLE items_pedido ENABLE ROW LEVEL SECURITY;

CREATE POLICY "items_pedido: select propio"
    ON items_pedido FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM pedidos p
            WHERE p.id = items_pedido.pedido_id
              AND p.user_id = auth.uid()
        )
    );

CREATE POLICY "items_pedido: insert propio"
    ON items_pedido FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM pedidos p
            WHERE p.id = items_pedido.pedido_id
              AND p.user_id = auth.uid()
        )
    );


-- ================================================================
-- NOTA IMPORTANTE: user_id en ventas generadas por pedidos online
-- ================================================================
-- Cuando un pedido es entregado, el trigger crea automáticamente
-- una venta en la tabla `ventas` usando el user_id del pedido
-- (el del cliente). Sin embargo, las ventas del admin usan el
-- user_id del administrador de la tienda.
--
-- SOLUCIÓN RECOMENDADA: En el trigger fn_descontar_inventario_pedido,
-- reemplaza NEW.user_id por el UUID fijo de tu usuario administrador:
--
--   SELECT id INTO admin_id FROM auth.users
--   WHERE email = 'tu-email-admin@gmail.com' LIMIT 1;
--
-- O simplemente pasa el user_id del admin como parámetro desde
-- el panel de administración al confirmar la entrega.
-- ================================================================
