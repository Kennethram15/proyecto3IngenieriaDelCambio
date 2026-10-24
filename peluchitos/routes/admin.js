const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { anularPedido } = require('./tienda');

const router = express.Router();
router.use(requireAdmin); // todo lo de aquí es solo para administradores

// ---------- Productos ----------
function leerProducto(body) {
  const nombre = String(body.nombre || '').trim();
  const descripcion = String(body.descripcion || '').trim().slice(0, 255);
  const precio = Number(body.precio);
  const stock = parseInt(body.stock, 10);
  const emoji = String(body.emoji || '🧸').trim().slice(0, 10) || '🧸';
  if (nombre.length < 2) return { error: 'El nombre es obligatorio.' };
  if (!(precio > 0)) return { error: 'El precio debe ser mayor que 0.' };
  if (!(stock >= 0)) return { error: 'El stock no puede ser negativo.' };
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
  try {
    const id = parseInt(req.params.id, 10);
    const [[{ usos }]] = await db.query('SELECT COUNT(*) AS usos FROM pedido_detalle WHERE producto_id = ?', [id]);
    await db.query('DELETE FROM carrito_items WHERE producto_id = ?', [id]);
    if (usos > 0) {
      await db.query('UPDATE productos SET activo = 0 WHERE id = ?', [id]);
      return res.json({ ok: true, mensaje: 'El producto tiene pedidos asociados, así que se desactivó en lugar de borrarse.' });
    }
    await db.query('DELETE FROM productos WHERE id = ?', [id]);
    res.json({ ok: true, mensaje: 'Producto eliminado.' });
  } catch (err) { next(err); }
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
  const conn = await db.getConnection();
  try {
    const nuevo = req.body.estado;
    await conn.beginTransaction();
    const [[ped]] = await conn.query('SELECT id, estado FROM pedidos WHERE id = ? FOR UPDATE', [parseInt(req.params.id, 10)]);
    if (!ped) { await conn.rollback(); return res.status(404).json({ error: 'Pedido no encontrado.' }); }

    if (nuevo === 'Cancelado') {
      if (['Entregado', 'Cancelado'].includes(ped.estado)) {
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
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
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
    const id = parseInt(req.params.id, 10);
    if (id === req.session.user.id) return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta.' });
    await db.query('UPDATE usuarios SET activo = ? WHERE id = ?', [req.body.activo ? 1 : 0, id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
