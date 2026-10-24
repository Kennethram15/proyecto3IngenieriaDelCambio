// Crea el usuario administrador y algunos peluches de ejemplo.
// Uso: npm run seed
const bcrypt = require('bcryptjs');
const db = require('./db');

const ADMIN_EMAIL = 'admin@peluchitos.com';
const ADMIN_PASS = 'Admin123!';

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
    const hash = await bcrypt.hash(ADMIN_PASS, 10);
    await db.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol)
       VALUES (?, ?, ?, 'admin')
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), rol = 'admin'`,
      ['Administrador', ADMIN_EMAIL, hash]
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
    console.log(`Admin listo -> correo: ${ADMIN_EMAIL}  |  contraseña: ${ADMIN_PASS}`);
  } catch (err) {
    console.error('Error en el seed:', err.message);
  } finally {
    await db.end();
  }
})();
