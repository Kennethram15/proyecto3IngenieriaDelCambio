const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');

const { refreshUser } = require('../middleware/auth');
const router = express.Router();
const regenerate = req => new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
const save = req => new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Registro de cliente
router.post('/registro', async (req, res, next) => {
  try {
    const nombre = String(req.body.nombre || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if ((nombre.length < 2 || nombre.length > 100)) return res.status(400).json({ error: 'Escribe tu nombre.' });
    if ((!EMAIL_RE.test(email) || email.length > 120)) return res.status(400).json({ error: 'Correo no válido.' });
    if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });

    const [existe] = await db.query('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (existe.length) return res.status(409).json({ error: 'Ese correo ya está registrado.' });

    const hash = await bcrypt.hash(password, 10);
    const [r] = await db.query(
      "INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, 'cliente')",
      [nombre, email, hash]
    );
    await regenerate(req);
    req.session.user = { id: r.insertId, nombre, email, rol: 'cliente' };
    await save(req);
    res.status(201).json({ user: req.session.user });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ese correo ya está registrado.' });
    next(err);
  }
});

// Inicio de sesión
router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    const [rows] = await db.query('SELECT * FROM usuarios WHERE email = ?', [email]);
    const u = rows[0];
    // Mismo mensaje para correo o contraseña incorrectos (no revelar cuál falló)
    if (!u || !(await bcrypt.compare(password, u.password_hash))) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }
    if (!u.activo) return res.status(403).json({ error: 'Tu cuenta está desactivada.' });

    await regenerate(req);
    req.session.user = { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol };
    await save(req);
    res.json({ user: req.session.user });
  } catch (err) { next(err); }
});

router.post('/logout', (req, res, next) => {
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

// Usuario actual (null si no hay sesión)
router.get('/yo', refreshUser, (req, res) => {
  res.json({ user: req.session.user || null });
});

module.exports = router;
