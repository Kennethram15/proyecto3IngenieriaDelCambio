const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { anularPedido } = require('./tienda');

const { integer, price } = require('../validation');
const router = express.Router();
router.use(requireAdmin); // todo lo de aquí es solo para administradores
router.param('id', (req, res, next, id) => {
  if (!integer(id)) return res.status(400).json({ error: 'Identificador no válido.' });
  next();
});

// ---------- Productos ----------
function leerProducto(body) {
  const nombre = String(body.nombre || '').trim();
  const descripcion = String(body.descripcion || '').trim().slice(0, 255);
  const precio = price(body.precio);
  const stock = integer(body.stock, 0);
  const emoji = String(body.emoji || '🧸').trim().slice(0, 10) || '🧸';
  if (nombre.length < 2 || nombre.length > 100) return { error: 'El nombre es obligatorio.' };
  if (!(precio > 0)) return { error: 'El precio debe ser mayor que 0.' };
  if (!(stock >= 0)) return { error: 'El stock debe ser un entero mayor o igual a cero.' };
  return { nombre, descripcion, precio, stock, emoji };
}

router.get('/productos', async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM productos ORDER BY id');
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/productos', async (req, res, next) => {
  try {
    const p = leerProducto(req.body);
    if (p.error) return res.status(400).json({ error: p.error });
    const [r] = await db.query(
      'INSERT INTO productos (nombre, descripcion, precio, stock, emoji) VALUES (?, ?, ?, ?, ?)',
      [p.nombre, p.descripcion, p.precio, p.stock, p.emoji]
    );
    res.status(201).json({ id: r.insertId });
  } catch (err) { next(err); }
});

router.put('/productos/:id', async (req, res, next) => {
  try {
    const p = leerProducto(req.body);
    if (p.error) return res.status(400).json({ error: p.error });
    const activo = req.body.activo === 0 || req.body.activo === false ? 0 : 1;
    await db.query(
      'UPDATE productos SET nombre=?, descripcion=?, precio=?, stock=?, emoji=?, activo=? WHERE id=?',
      [p.nombre, p.descripcion, p.precio, p.stock, p.emoji, activo, parseInt(req.params.id, 10)]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Si el producto ya tiene pedidos se desactiva (no se borra) para no perder el historial
router.delete('/productos/:id', async (req, res, next) => {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    const id = parseInt(req.params.id, 10);
    const [[producto]] = await conn.query('SELECT id FROM productos WHERE id = ? FOR UPDATE', [id]);
    if (!producto) {
      await conn.rollback();
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }
    const [[{ usos }]] = await conn.query('SELECT COUNT(*) AS usos FROM pedido_detalle WHERE producto_id = ?', [id]);
    if (usos > 0) {
      await conn.query('UPDATE productos SET activo = 0 WHERE id = ?', [id]);
      await conn.commit();
      return res.json({ ok: true, mensaje: 'El producto tiene pedidos asociados, así que se desactivó en lugar de borrarse.' });
    }
    await conn.query('DELETE FROM carrito_items WHERE producto_id = ?', [id]);
    await conn.query('DELETE FROM productos WHERE id = ?', [id]);
    await conn.commit();
    res.json({ ok: true, mensaje: 'Producto eliminado.' });
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally { if (conn) conn.release(); }
});

// ---------- Pedidos ----------
router.get('/pedidos', async (req, res, next) => {
  try {
    const [pedidos] = await db.query(
      `SELECT p.id, p.total, p.estado, p.direccion, p.telefono, p.metodo_pago, p.tarjeta_ultimos4, p.fecha,
              u.nombre AS cliente, u.email
       FROM pedidos p JOIN usuarios u ON u.id = p.usuario_id ORDER BY p.id DESC`
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

// Flujo permitido: Pendiente/Pagado -> Despachado -> Enviado -> Entregado
const SIGUIENTE = { Pendiente: ['Despachado'], Pagado: ['Despachado'], Despachado: ['Enviado'], Enviado: ['Entregado'] };

router.put('/pedidos/:id/estado', async (req, res, next) => {
  let conn;
  try {
    conn = await db.getConnection();
    const nuevo = req.body.estado;
    await conn.beginTransaction();
    const [[ped]] = await conn.query('SELECT id, estado FROM pedidos WHERE id = ? FOR UPDATE', [parseInt(req.params.id, 10)]);
    if (!ped) { await conn.rollback(); return res.status(404).json({ error: 'Pedido no encontrado.' }); }

    if (nuevo === 'Cancelado') {
      if (!['Pendiente', 'Pagado', 'Despachado'].includes(ped.estado)) {
        await conn.rollback();
        return res.status(400).json({ error: `No se puede anular un pedido "${ped.estado}".` });
      }
      await anularPedido(conn, ped.id);
    } else {
      if (!(SIGUIENTE[ped.estado] || []).includes(nuevo)) {
        await conn.rollback();
        return res.status(400).json({ error: `No se puede pasar de "${ped.estado}" a "${nuevo}".` });
      }
      await conn.query('UPDATE pedidos SET estado = ? WHERE id = ?', [nuevo, ped.id]);
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// ---------- Usuarios / clientes ----------
router.get('/usuarios', async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.creado,
              (SELECT COUNT(*) FROM pedidos p WHERE p.usuario_id = u.id) AS pedidos
       FROM usuarios u ORDER BY u.id`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.put('/usuarios/:id/activo', async (req, res, next) => {
  try {
    if (![true, false, 0, 1].includes(req.body.activo)) return res.status(400).json({ error: 'Estado de usuario no válido.' });
    const id = parseInt(req.params.id, 10);
    if (id === req.session.user.id) return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta.' });
    await db.query('UPDATE usuarios SET activo = ? WHERE id = ?', [req.body.activo ? 1 : 0, id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
