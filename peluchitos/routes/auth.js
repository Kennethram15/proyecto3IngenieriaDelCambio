const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Registro de cliente
router.post('/registro', async (req, res, next) => {
  try {
    const nombre = String(req.body.nombre || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (nombre.length < 2) return res.status(400).json({ error: 'Escribe tu nombre.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Correo no válido.' });
    if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });

    const [existe] = await db.query('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (existe.length) return res.status(409).json({ error: 'Ese correo ya está registrado.' });

    const hash = await bcrypt.hash(password, 10);
    const [r] = await db.query(
      "INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, 'cliente')",
      [nombre, email, hash]
    );
    req.session.user = { id: r.insertId, nombre, email, rol: 'cliente' };
    res.status(201).json({ user: req.session.user });
  } catch (err) { next(err); }
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

    req.session.user = { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol };
    res.json({ user: req.session.user });
  } catch (err) { next(err); }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// Usuario actual (null si no hay sesión)
router.get('/yo', (req, res) => {
  res.json({ user: req.session.user || null });
});

module.exports = router;
