const db = require('../db');
async function refreshUser(req, res, next) {
  try {
    if (!req.session.user) return next();
    const [[user]] = await db.query('SELECT id, nombre, email, rol, activo FROM usuarios WHERE id = ?', [req.session.user.id]);
    if (!user || !user.activo) return req.session.destroy(err => {
      if (err) return next(err);
      res.clearCookie('connect.sid');
      if (req.path === '/yo') return res.json({ user: null });
      res.status(401).json({ error: 'Tu cuenta ya no está disponible.' });
    });
    const { activo, ...actual } = user;
    req.session.user = actual;
    next();
  } catch (err) { next(err); }
}
function requireLogin(req, res, next) {
  refreshUser(req, res, err => {
    if (err) return next(err);
    if (!req.session.user) return res.status(401).json({ error: 'Debes iniciar sesión.' });
    next();
  });
}
const role = rol => (req, res, next) => requireLogin(req, res, err => {
  if (err) return next(err);
  if (req.session.user.rol !== rol) return res.status(403).json({ error: 'No tienes permiso para esta operación.' });
  next();
});
module.exports = { refreshUser, requireLogin, requireAdmin: role('admin'), requireCliente: role('cliente') };
