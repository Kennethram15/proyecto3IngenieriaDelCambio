// Crea el usuario administrador y algunos peluches de ejemplo.
// Uso: npm run seed
const bcrypt = require('bcryptjs');
const db = require('./db');

const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASS = process.env.ADMIN_PASSWORD || '';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Administrador';

const productos = [
  ['Osito Abrazos', 'Osito suave de felpa, perfecto para dormir abrazado.', 85.00, 20, '🧸'],
  ['Conejo Zanahoria', 'Conejito orejón que viene con su zanahoria.', 70.00, 15, '🐰'],
  ['Panda Bambú', 'Panda gordito y relajado, amante del bambú.', 95.00, 12, '🐼'],
  ['Zorrito Fogata', 'Zorro de pelaje naranja, muy travieso.', 80.00, 10, '🦊'],
  ['Unicornio Arcoíris', 'Unicornio con melena de colores brillantes.', 120.00, 8, '🦄'],
  ['Pulpo Ocho Brazos', 'Pulpo con ocho brazos listos para abrazar.', 75.00, 14, '🐙'],
  ['Rana Saltarina', 'Ranita verde que alegra cualquier cuarto.', 60.00, 18, '🐸'],
  ['Pingüino Friolento', 'Pingüino con bufanda tejida a mano.', 90.00, 3, '🐧']
];

(async () => {
  try {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ADMIN_EMAIL) || ADMIN_PASS.length < 12) throw new Error('Configura ADMIN_EMAIL y ADMIN_PASSWORD (mínimo 12 caracteres).');
    const hash = await bcrypt.hash(ADMIN_PASS, 10);
    await db.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol)
       VALUES (?, ?, ?, 'admin')
       ON DUPLICATE KEY UPDATE id = id`,
      [ADMIN_NAME, ADMIN_EMAIL, hash]
    );

    const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM productos');
    if (total === 0) {
      await db.query(
        'INSERT INTO productos (nombre, descripcion, precio, stock, emoji) VALUES ?',
        [productos]
      );
      console.log(`Se crearon ${productos.length} productos de ejemplo.`);
    } else {
      console.log('Ya había productos, no se agregaron los de ejemplo.');
    }
    console.log('Administrador inicializado; las cuentas existentes no se modificaron.');
  } catch (err) {
    console.error('No se pudo completar el seed:', err.code || err.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
