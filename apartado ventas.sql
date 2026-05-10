-- ================================================================
-- PARCHE SQL — Ejecuta esto en Supabase SQL Editor
-- Versión: solo contra entrega (sin Wompi)
-- ================================================================

-- ================================================================
-- 1. Recrear función get_admin_user_id() si no existe
-- ================================================================
DROP FUNCTION IF EXISTS get_admin_user_id();

CREATE OR REPLACE FUNCTION get_admin_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id
    FROM auth.users
    WHERE email = 'chindoyfranklin9@gmail.com'
    LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_admin_user_id() TO authenticated;

-- ================================================================
-- 2. Ajustar el CHECK de metodo_pago: solo contraentrega
-- ================================================================
ALTER TABLE pedidos
DROP CONSTRAINT IF EXISTS pedidos_metodo_pago_check;

ALTER TABLE pedidos
ADD CONSTRAINT pedidos_metodo_pago_check
CHECK (metodo_pago IN ('contraentrega'));

-- ================================================================
-- 3. Ajustar el CHECK de estado: quitar estados de pago online
-- ================================================================
ALTER TABLE pedidos
DROP CONSTRAINT IF EXISTS pedidos_estado_check;

ALTER TABLE pedidos
ADD CONSTRAINT pedidos_estado_check
CHECK (estado IN (
    'pendiente',
    'pago_confirmado',
    'despachado',
    'entregado',
    'cancelado'
));

-- ================================================================
-- 4. Ajustar el trigger fn_descontar_inventario_pedido
--    Ya no necesita excluir 'esperando_pago' ni 'pago_fallido'.
--    El flujo ahora es: pendiente → pago_confirmado → despachado → entregado
-- ================================================================
DROP TRIGGER IF EXISTS trg_descontar_inventario_pedido ON pedidos;
DROP FUNCTION IF EXISTS fn_descontar_inventario_pedido() CASCADE;

CREATE OR REPLACE FUNCTION fn_descontar_inventario_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venta_id  BIGINT;
    v_admin_id  UUID;
    v_stock_neg INT;
BEGIN
    -- Solo actuar cuando se pasa A pago_confirmado por primera vez
    IF NEW.estado <> 'pago_confirmado' OR OLD.estado = 'pago_confirmado' THEN
        RETURN NEW;
    END IF;

    -- Verificar stock suficiente en todos los items
    SELECT COUNT(*) INTO v_stock_neg
    FROM items_pedido ip
    JOIN productos p ON p.id = ip.product_id
    WHERE ip.pedido_id = NEW.id AND p.cantidad < ip.cantidad;

    IF v_stock_neg > 0 THEN
        RAISE EXCEPTION 'Stock insuficiente en uno o más productos del pedido #%.', NEW.id;
    END IF;

    -- Descontar inventario
    UPDATE productos p
    SET cantidad = p.cantidad - ip.cantidad, updated_at = NOW()
    FROM items_pedido ip
    WHERE ip.pedido_id = NEW.id AND ip.product_id = p.id;

    NEW.fecha_confirmacion := NOW();

    -- Registrar como venta en el historial del admin
    SELECT id INTO v_admin_id FROM auth.users
    WHERE email = 'chindoyfranklin9@gmail.com' LIMIT 1;

    IF v_admin_id IS NOT NULL THEN
        INSERT INTO ventas (global_id, numero_ticket, total, fecha, fecha_limpia, user_id)
        VALUES (
            EXTRACT(EPOCH FROM NOW())::BIGINT,
            'ONLINE-' || NEW.id,
            NEW.total,
            TO_CHAR(NOW(), 'DD/MM/YYYY, HH24:MI:SS'),
            TO_CHAR(NOW(), 'DD/MM/YYYY'),
            v_admin_id
        ) RETURNING id INTO v_venta_id;

        INSERT INTO items_venta (venta_id, product_id, nombre, cantidad, precio, subtotal, user_id)
        SELECT v_venta_id, ip.product_id, ip.nombre, ip.cantidad, ip.precio, ip.subtotal, v_admin_id
        FROM items_pedido ip WHERE ip.pedido_id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_descontar_inventario_pedido
BEFORE UPDATE ON pedidos
FOR EACH ROW EXECUTE FUNCTION fn_descontar_inventario_pedido();

-- ================================================================
-- 5. Recrear función RPC cambiar_estado_pedido sin estados Wompi
-- ================================================================
DROP FUNCTION IF EXISTS cambiar_estado_pedido(BIGINT, TEXT, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION cambiar_estado_pedido(
    p_pedido_id          BIGINT,
    p_nuevo_estado       TEXT,
    p_fecha_confirmacion TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT es_admin() THEN
        RAISE EXCEPTION 'No tienes permisos para cambiar el estado del pedido.';
    END IF;

    IF p_nuevo_estado NOT IN ('pendiente','pago_confirmado','despachado','entregado','cancelado') THEN
        RAISE EXCEPTION 'Estado no válido: %', p_nuevo_estado;
    END IF;

    UPDATE pedidos SET estado = p_nuevo_estado WHERE id = p_pedido_id;
END;
$$;

GRANT EXECUTE ON FUNCTION cambiar_estado_pedido(BIGINT, TEXT, TIMESTAMPTZ) TO authenticated;

-- ================================================================
-- 6. Actualizar pedidos huérfanos con estados eliminados
--    (solo si tienes datos de prueba con esos estados)
-- ================================================================
UPDATE pedidos SET estado = 'cancelado'
WHERE estado IN ('esperando_pago', 'pago_fallido');

-- ================================================================
-- FIN DEL PARCHE
-- ================================================================
