const express = require('express');
const db = require('../db');
const { requireCliente } = require('../middleware/auth');

const { integer, price } = require('../validation');
const router = express.Router();
for (const param of ['id', 'productoId']) router.param(param, (req, res, next, value) => {
  if (!integer(value)) return res.status(400).json({ error: 'Identificador no válido.' });
  next();
});

// ---------- Catálogo ----------
router.get('/productos', async (req, res, next) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nombre, descripcion, precio, stock, emoji FROM productos WHERE activo = 1 ORDER BY id'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ---------- Carrito ----------
async function leerCarrito(usuarioId, conn = db) {
  const [items] = await conn.query(
    `SELECT c.producto_id, c.cantidad, p.nombre, p.precio, p.stock, p.emoji, p.activo
     FROM carrito_items c JOIN productos p ON p.id = c.producto_id
     WHERE c.usuario_id = ? ORDER BY c.id`,
    [usuarioId]
  );
  const centavos = items.reduce((s, i) => s + Math.round(i.precio * 100) * i.cantidad, 0);
  return { items, total: centavos / 100 };
}

router.get('/carrito', requireCliente, async (req, res, next) => {
  try { res.json(await leerCarrito(req.session.user.id)); } catch (err) { next(err); }
});

// Agregar al carrito (suma si ya existe)
router.post('/carrito', requireCliente, async (req, res, next) => {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    await conn.query('SELECT id FROM usuarios WHERE id = ? FOR UPDATE', [req.session.user.id]);
    const productoId = integer(req.body.producto_id);
    const cantidad = integer(req.body.cantidad === undefined ? 1 : req.body.cantidad);
    if (!productoId || !cantidad) return res.status(400).json({ error: 'Datos no válidos.' });

    const [[p]] = await conn.query('SELECT stock FROM productos WHERE id = ? AND activo = 1', [productoId]);
    if (!p) return res.status(404).json({ error: 'Producto no disponible.' });

    const [[actual]] = await conn.query(
      'SELECT cantidad FROM carrito_items WHERE usuario_id = ? AND producto_id = ?',
      [req.session.user.id, productoId]
    );
    const nueva = (actual ? actual.cantidad : 0) + cantidad;
    if (nueva > p.stock) {
      return res.status(400).json({ error: `Stock insuficiente. Solo quedan ${p.stock} unidades.` });
    }

    await conn.query(
      `INSERT INTO carrito_items (usuario_id, producto_id, cantidad) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE cantidad = ?`,
      [req.session.user.id, productoId, nueva, nueva]
    );
    const carrito = await leerCarrito(req.session.user.id, conn);
    await conn.commit();
    res.json(carrito);
  } catch (err) { next(err); } finally {
    if (conn) {
      try { await conn.rollback(); } finally { conn.release(); }
    }
  }
});

// Modificar cantidad
router.put('/carrito/:productoId', requireCliente, async (req, res, next) => {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    await conn.query('SELECT id FROM usuarios WHERE id = ? FOR UPDATE', [req.session.user.id]);
    const productoId = integer(req.params.productoId);
    const cantidad = integer(req.body.cantidad);
    if (!productoId || !cantidad || cantidad < 1) return res.status(400).json({ error: 'Cantidad no válida.' });

    const [[p]] = await conn.query('SELECT stock FROM productos WHERE id = ? AND activo = 1', [productoId]);
    if (!p) return res.status(404).json({ error: 'Producto no disponible.' });
    if (cantidad > p.stock) return res.status(400).json({ error: `Stock insuficiente. Solo quedan ${p.stock} unidades.` });

    await conn.query(
      'UPDATE carrito_items SET cantidad = ? WHERE usuario_id = ? AND producto_id = ?',
      [cantidad, req.session.user.id, productoId]
    );
    const carrito = await leerCarrito(req.session.user.id, conn);
    await conn.commit();
    res.json(carrito);
  } catch (err) { next(err); } finally {
    if (conn) {
      try { await conn.rollback(); } finally { conn.release(); }
    }
  }
});

// Eliminar del carrito
router.delete('/carrito/:productoId', requireCliente, async (req, res, next) => {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    await conn.query('SELECT id FROM usuarios WHERE id = ? FOR UPDATE', [req.session.user.id]);
    if (!integer(req.params.productoId)) return res.status(400).json({ error: 'Producto no valido.' });
    await conn.query(
      'DELETE FROM carrito_items WHERE usuario_id = ? AND producto_id = ?',
      [req.session.user.id, integer(req.params.productoId)]
    );
    const carrito = await leerCarrito(req.session.user.id, conn);
    await conn.commit();
    res.json(carrito);
  } catch (err) { next(err); } finally {
    if (conn) {
      try { await conn.rollback(); } finally { conn.release(); }
    }
  }
});

// ---------- Pago simulado ----------
// Reglas: número de 16 dígitos, vencimiento MM/AA vigente, CVV de 3 dígitos.
// Escenario de prueba: una tarjeta que termine en 0000 es RECHAZADA.
// Los datos de la tarjeta nunca se guardan; solo los últimos 4 dígitos.
function validarTarjeta(t) {
  if (!t) return { ok: false, error: 'Faltan los datos de la tarjeta.' };
  const numero = String(t.numero || '').replace(/\s+/g, '');
  const cvv = String(t.cvv || '');
  const m = /^(\d{2})\/(\d{2})$/.exec(String(t.vencimiento || ''));

  if (!/^\d{16}$/.test(numero)) return { ok: false, error: 'El número de tarjeta debe tener 16 dígitos.' };
  if (!/^\d{3}$/.test(cvv)) return { ok: false, error: 'El CVV debe tener 3 dígitos.' };
  if (!m) return { ok: false, error: 'El vencimiento debe tener el formato MM/AA.' };

  const mes = parseInt(m[1], 10);
  const anio = 2000 + parseInt(m[2], 10);
  const hoy = new Date();
  if (mes < 1 || mes > 12 || anio < hoy.getFullYear() || (anio === hoy.getFullYear() && mes < hoy.getMonth() + 1)) {
    return { ok: false, error: 'La tarjeta está vencida o la fecha no es válida.' };
  }
  if (numero.endsWith('0000')) {
    return { ok: false, error: 'Pago rechazado por el banco (simulado). Prueba con otra tarjeta.' };
  }
  return { ok: true, ultimos4: numero.slice(-4) };
}

// ---------- Pedidos ----------
// Confirmar compra (checkout) con transacción para que el stock no se descuadre
router.post('/pedidos', requireCliente, async (req, res, next) => {
  const direccion = String(req.body.direccion || '').trim();
  const telefono = String(req.body.telefono || '').trim();
  const metodo = req.body.metodo_pago;

  if (direccion.length < 5 || direccion.length > 255) return res.status(400).json({ error: 'Escribe una dirección de envío válida.' });
  if (!/^[0-9+\-\s]{8,15}$/.test(telefono)) return res.status(400).json({ error: 'Teléfono no válido.' });
  if (!['tarjeta', 'contra_entrega'].includes(metodo)) return res.status(400).json({ error: 'Elige un método de pago.' });

  let ultimos4 = null;
  let estado = 'Pendiente';
  if (metodo === 'tarjeta') {
    const v = validarTarjeta(req.body.tarjeta);
    if (!v.ok) return res.status(400).json({ error: v.error });
    ultimos4 = v.ultimos4;
    estado = 'Pagado';
  }

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    await conn.query('SELECT id FROM usuarios WHERE id = ? FOR UPDATE', [req.session.user.id]);

    const [items] = await conn.query(
      `SELECT c.producto_id, c.cantidad, p.nombre, p.precio, p.stock, p.activo
       FROM carrito_items c JOIN productos p ON p.id = c.producto_id
       WHERE c.usuario_id = ? ORDER BY c.producto_id FOR UPDATE`,
      [req.session.user.id]
    );
    if (!items.length) {
      await conn.rollback();
      return res.status(400).json({ error: 'Tu carrito está vacío.' });
    }
    for (const i of items) {
      if (!i.activo || !integer(i.cantidad) || !price(i.precio) || i.cantidad > i.stock) {
        await conn.rollback();
        return res.status(400).json({ error: `"${i.nombre}" no está disponible o no tiene existencias suficientes. Ajusta tu carrito.` });
      }
    }

    const total = items.reduce((s, i) => s + Math.round(i.precio * 100) * i.cantidad, 0) / 100;
    if (total > 99999999.99) {
      await conn.rollback();
      return res.status(400).json({ error: 'El total excede el máximo permitido.' });
    }
    const [ped] = await conn.query(
      `INSERT INTO pedidos (usuario_id, total, estado, direccion, telefono, metodo_pago, tarjeta_ultimos4)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.session.user.id, total, estado, direccion, telefono, metodo, ultimos4]
    );
    for (const i of items) {
      await conn.query(
        'INSERT INTO pedido_detalle (pedido_id, producto_id, cantidad, precio_unitario) VALUES (?, ?, ?, ?)',
        [ped.insertId, i.producto_id, i.cantidad, i.precio]
      );
      await conn.query('UPDATE productos SET stock = stock - ? WHERE id = ?', [i.cantidad, i.producto_id]);
    }
    await conn.query('DELETE FROM carrito_items WHERE usuario_id = ?', [req.session.user.id]);

    await conn.commit();
    res.status(201).json({ pedido_id: ped.insertId, total, estado });
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// Mis pedidos (con su detalle)
router.get('/pedidos', requireCliente, async (req, res, next) => {
  try {
    const [pedidos] = await db.query(
      'SELECT id, total, estado, direccion, metodo_pago, fecha FROM pedidos WHERE usuario_id = ? ORDER BY id DESC',
      [req.session.user.id]
    );
    for (const p of pedidos) {
      const [det] = await db.query(
        `SELECT d.cantidad, d.precio_unitario, pr.nombre, pr.emoji
         FROM pedido_detalle d JOIN productos pr ON pr.id = d.producto_id WHERE d.pedido_id = ?`,
        [p.id]
      );
      p.items = det;
    }
    res.json(pedidos);
  } catch (err) { next(err); }
});

// Cancelar pedido (solo si aún no ha sido despachado). Devuelve el stock.
router.put('/pedidos/:id/cancelar', requireCliente, async (req, res, next) => {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    const [[ped]] = await conn.query(
      'SELECT id, estado FROM pedidos WHERE id = ? AND usuario_id = ? FOR UPDATE',
      [parseInt(req.params.id, 10), req.session.user.id]
    );
    if (!ped) { await conn.rollback(); return res.status(404).json({ error: 'Pedido no encontrado.' }); }
    if (!['Pendiente', 'Pagado'].includes(ped.estado)) {
      await conn.rollback();
      return res.status(400).json({ error: `No se puede cancelar un pedido en estado "${ped.estado}".` });
    }
    await anularPedido(conn, ped.id);
    await conn.commit();
    res.json({ ok: true, estado: 'Cancelado' });
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// Marca el pedido como Cancelado y devuelve las unidades al inventario
async function anularPedido(conn, pedidoId) {
  const [det] = await conn.query('SELECT producto_id, cantidad FROM pedido_detalle WHERE pedido_id = ? ORDER BY producto_id', [pedidoId]);
  for (const d of det) {
    await conn.query('UPDATE productos SET stock = stock + ? WHERE id = ?', [d.cantidad, d.producto_id]);
  }
  await conn.query("UPDATE pedidos SET estado = 'Cancelado' WHERE id = ?", [pedidoId]);
}

module.exports = router;
module.exports.anularPedido = anularPedido;
