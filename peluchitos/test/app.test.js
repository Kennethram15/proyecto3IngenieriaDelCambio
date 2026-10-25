const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { spawnSync } = require('node:child_process');
const { integer, price } = require('../validation');

// Doble de MySQL: prueba HTTP, sesiones reales y consultas esperadas.
// No sustituye las pruebas de bloqueos y aislamiento con InnoDB.
let users, product, cart, orders, details, server, base, failDetail;
let queue = Promise.resolve();
function reset() {
  users = [
    { id: 1, nombre: 'Cliente', email: 'cliente@example.test', rol: 'cliente', activo: 1, password_hash: bcrypt.hashSync('Test-password-123', 4) },
    { id: 2, nombre: 'Admin', email: 'admin@example.test', rol: 'admin', activo: 1, password_hash: bcrypt.hashSync('Test-password-123', 4) }
  ];
  product = { id: 1, nombre: 'Osito', precio: 85.25, stock: 10, activo: 1, emoji: '' };
  cart = []; orders = []; details = []; failDetail = false;
}
async function query(sql, args = []) {
  sql = sql.replace(/\s+/g, ' ').trim();
  if (sql.startsWith('SELECT id, nombre, email, rol, activo FROM usuarios')) return [users.filter(u => u.id === args[0]).map(({ password_hash, ...u }) => ({ ...u }))];
  if (sql.startsWith('SELECT * FROM usuarios WHERE email') || sql.startsWith('SELECT id FROM usuarios WHERE email')) return [users.filter(u => u.email === args[0])];
  if (sql.startsWith('SELECT id FROM usuarios WHERE id')) return [users.filter(u => u.id === args[0])];
  if (sql.startsWith('INSERT INTO usuarios')) {
    const id = users.length + 1;
    users.push({ id, nombre: args[0], email: args[1], password_hash: args[2], rol: 'cliente', activo: 1 });
    return [{ insertId: id }];
  }
  if (sql.startsWith('SELECT stock FROM productos')) return [[...(product.activo && args[0] === product.id ? [{ stock: product.stock }] : [])]];
  if (sql.startsWith('SELECT cantidad FROM carrito_items')) return [cart.filter(c => c.usuario_id === args[0] && c.producto_id === args[1])];
  if (sql.startsWith('SELECT c.producto_id')) return [cart.filter(c => c.usuario_id === args[0]).map(c => ({ ...product, ...c }))];
  if (sql.startsWith('INSERT INTO carrito_items')) {
    cart = cart.filter(c => !(c.usuario_id === args[0] && c.producto_id === args[1]));
    cart.push({ usuario_id: args[0], producto_id: args[1], cantidad: args[2] });
    return [{}];
  }
  if (sql.startsWith('UPDATE carrito_items')) {
    cart.filter(c => c.usuario_id === args[1] && c.producto_id === args[2]).forEach(c => c.cantidad = args[0]);
    return [{}];
  }
  if (sql.startsWith('DELETE FROM carrito_items')) {
    cart = cart.filter(c => !(c.usuario_id === args[0] && (args.length === 1 || c.producto_id === args[1])));
    return [{}];
  }
  if (sql.startsWith('INSERT INTO pedidos')) {
    const id = orders.length + 1;
    orders.push({ id, usuario_id: args[0], total: args[1], estado: args[2], tarjeta_ultimos4: args[6] });
    return [{ insertId: id }];
  }
  if (sql.startsWith('INSERT INTO pedido_detalle')) {
    if (failDetail) throw new Error('Fallo deliberado');
    details.push({ pedido_id: args[0], producto_id: args[1], cantidad: args[2], precio_unitario: args[3] });
    return [{}];
  }
  if (sql.startsWith('UPDATE productos SET stock = stock -')) { product.stock -= args[0]; return [{}]; }
  if (sql.startsWith('UPDATE productos SET stock = stock +')) { product.stock += args[0]; return [{}]; }
  if (sql.startsWith('SELECT id, estado FROM pedidos')) return [orders.filter(p => p.id === args[0] && (args.length === 1 || p.usuario_id === args[1])).map(p => ({ ...p }))];
  if (sql.startsWith('SELECT producto_id, cantidad FROM pedido_detalle')) return [details.filter(d => d.pedido_id === args[0])];
  if (sql.startsWith("UPDATE pedidos SET estado = 'Cancelado'")) { orders.find(p => p.id === args[0]).estado = 'Cancelado'; return [{}]; }
  if (sql.startsWith('UPDATE pedidos SET estado = ?')) { orders.find(p => p.id === args[1]).estado = args[0]; return [{}]; }
  if (sql.startsWith('SELECT id, total, estado')) return [orders.filter(p => p.usuario_id === args[0]).map(p => ({ ...p }))];
  if (sql.startsWith('SELECT d.cantidad')) return [details.filter(d => d.pedido_id === args[0])];
  throw new Error('Consulta inesperada: ' + sql);
}
const db = {
  query,
  async getConnection() {
    let unlock, snapshot, active = false;
    return {
      query,
      async beginTransaction() {
        const previous = queue;
        queue = new Promise(resolve => { unlock = resolve; });
        await previous;
        snapshot = structuredClone({ product, cart, orders, details });
        active = true;
      },
      async commit() { active = false; unlock(); },
      async rollback() {
        if (!active) return;
        ({ product, cart, orders, details } = snapshot);
        active = false; unlock();
      },
      release() {}
    };
  }
};
require.cache[require.resolve('../db')] = { exports: db };
process.env.SESSION_SECRET = 'test-only-secret-with-more-than-32-characters';
const app = require('../server');
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));
function client() {
  let cookie = '';
  return {
    get cookie() { return cookie; },
    async request(path, method = 'GET', body) {
      const r = await fetch(base + path, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
      return { status: r.status, body: await r.json() };
    }
  };
}
async function login(admin = false) {
  const c = client();
  assert.equal((await c.request('/api/auth/login', 'POST', { email: admin ? 'admin@example.test' : 'cliente@example.test', password: 'Test-password-123' })).status, 200);
  return c;
}
const shipping = { direccion: 'Direccion de prueba', telefono: '55555555', metodo_pago: 'contra_entrega' };
async function add(c, cantidad = 2) { return c.request('/api/carrito', 'POST', { producto_id: 1, cantidad }); }

test('validacion estricta sin truncamientos, booleanos ni infinitos', () => {
  for (const v of [1.5, '2x', '', null, true, NaN, Infinity, 2147483648, -1]) assert.ok(Number.isNaN(integer(v)));
  assert.equal(integer(0, 0), 0); assert.equal(integer('2'), 2);
  for (const v of [0, -1, true, Infinity, '1x', '0.001', 100000000]) assert.ok(Number.isNaN(price(v)));
  assert.equal(price('85.25'), 85.25);
});
test('servidor exige un secreto configurado y rechaza valores de ejemplo', () => {
  for (const secret of ['', 'corto', 'cambia_esto_por_un_texto_largo_y_aleatorio']) {
    const result = spawnSync(process.execPath, ['-e', "require('./server')"], {
      cwd: require('node:path').resolve(__dirname, '..'),
      env: { ...process.env, SESSION_SECRET: secret }, encoding: 'utf8'
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Configura SESSION_SECRET/);
  }
});
test('administracion rechaza precios y existencias invalidos antes de consultar SQL', async () => {
  reset(); const admin = await login(true);
  for (const data of [{ precio: 0, stock: 1 }, { precio: 'Infinity', stock: 1 }, { precio: 2, stock: 1.5 }, { precio: 2, stock: '2x' }, { precio: 2, stock: -1 }]) {
    assert.equal((await admin.request('/api/admin/productos', 'POST', { nombre: 'Osito', ...data })).status, 400);
  }
  assert.equal((await admin.request('/api/admin/productos/1x', 'DELETE')).status, 400);
});
test('registro, credenciales incorrectas, regeneracion de sesion y logout', async () => {
  reset(); const c = client();
  assert.equal((await c.request('/api/auth/login', 'POST', { email: users[0].email, password: 'incorrecta' })).status, 401);
  assert.equal((await c.request('/api/auth/registro', 'POST', { nombre: 'Nuevo', email: 'nuevo@example.test', password: 'Test-password-123' })).status, 201);
  const old = c.cookie;
  assert.equal((await c.request('/api/auth/login', 'POST', { email: 'nuevo@example.test', password: 'Test-password-123' })).status, 200);
  assert.notEqual(c.cookie, old);
  const stale = await fetch(base + '/api/carrito', { headers: { Cookie: old } });
  assert.equal(stale.status, 401);
  const beforeRegistration = c.cookie;
  assert.equal((await c.request('/api/auth/registro', 'POST', { nombre: 'Otro', email: 'otro@example.test', password: 'Test-password-123' })).status, 201);
  assert.notEqual(c.cookie, beforeRegistration);
  assert.equal((await c.request('/api/auth/logout', 'POST')).status, 200);
  assert.equal((await c.request('/api/carrito')).status, 401);
});
test('permisos, rol actualizado, cuenta eliminada y desactivada con sesion abierta', async () => {
  reset(); const c = await login(); const admin = await login(true);
  assert.equal((await c.request('/api/admin/productos')).status, 403);
  for (const [path, method] of [['/api/carrito','GET'], ['/api/carrito','POST'], ['/api/carrito/1','PUT'], ['/api/carrito/1','DELETE'], ['/api/pedidos','GET'], ['/api/pedidos','POST'], ['/api/pedidos/1/cancelar','PUT']]) assert.equal((await admin.request(path, method, method === 'GET' ? undefined : {})).status, 403);
  users[0].rol = 'admin'; assert.equal((await c.request('/api/carrito')).status, 403);
  users[0].activo = 0; assert.equal((await c.request('/api/carrito')).status, 401);
  assert.equal((await c.request('/api/auth/yo')).body.user, null);
  users[1].activo = 0; assert.equal((await admin.request('/api/auth/login', 'POST', { email: users[1].email, password: 'Test-password-123' })).status, 403);
  users = []; assert.equal((await admin.request('/api/admin/pedidos')).status, 401);
});
test('carrito: agregar, modificar, quitar, rechazar cantidades y stock', async () => {
  reset(); const c = await login();
  assert.equal((await add(c)).body.items[0].cantidad, 2);
  assert.equal((await c.request('/api/carrito/1', 'PUT', { cantidad: 3 })).body.items[0].cantidad, 3);
  for (const cantidad of [0, -1, 1.5, '2x', null, 11]) assert.equal((await add(c, cantidad)).status, 400);
  assert.equal((await c.request('/api/carrito/1', 'PUT', { cantidad: 11 })).status, 400);
  assert.equal((await c.request('/api/carrito/1', 'DELETE')).body.items.length, 0);
});
test('producto inactivo visible, bloqueado en compra y modificacion, eliminable', async () => {
  reset(); const c = await login(); await add(c); product.activo = 0;
  assert.equal((await c.request('/api/carrito')).body.items[0].activo, 0);
  assert.equal((await c.request('/api/pedidos', 'POST', shipping)).status, 400);
  assert.equal((await c.request('/api/carrito/1', 'PUT', { cantidad: 1 })).status, 404);
  assert.equal((await c.request('/api/carrito/1', 'DELETE')).body.items.length, 0);
  assert.equal(product.stock, 10);
});
test('compra contra entrega calcula precios desde BD y descuenta solo una vez', async () => {
  reset(); const c = await login(); await add(c);
  const results = await Promise.all([1, 2].map(() => c.request('/api/pedidos', 'POST', { ...shipping, total: 1, precio: 1 })));
  assert.deepEqual(results.map(r => r.status).sort(), [201, 400]);
  assert.equal(orders.length, 1); assert.equal(orders[0].total, 170.50);
  assert.equal(product.stock, 8); assert.equal(cart.length, 0); assert.equal(orders[0].estado, 'Pendiente');
});
test('tarjeta simulada aprobada y rechazada, stock insuficiente y rollback', async () => {
  reset(); const c = await login(); await add(c);
  const card = { ...shipping, metodo_pago: 'tarjeta', tarjeta: { numero: '4111111111110000', cvv: '123', vencimiento: '12/99' } };
  assert.equal((await c.request('/api/pedidos', 'POST', card)).status, 400);
  assert.equal(cart.length, 1); assert.equal(orders.length, 0);
  product.stock = 1; assert.equal((await c.request('/api/pedidos', 'POST', shipping)).status, 400);
  product.stock = 10; failDetail = true;
  assert.equal((await c.request('/api/pedidos', 'POST', shipping)).status, 500);
  assert.equal(orders.length, 0); assert.equal(product.stock, 10); assert.equal(cart.length, 1);
  failDetail = false; card.tarjeta.numero = '4111111111111111';
  assert.equal((await c.request('/api/pedidos', 'POST', card)).status, 201);
  assert.equal(orders[0].estado, 'Pagado'); assert.equal(orders[0].tarjeta_ultimos4, '1111');
  assert.equal(product.stock, 8);
});
test('cancelacion concurrente repone una sola vez y protege pedidos ajenos', async () => {
  reset(); const c = await login(); await add(c); await c.request('/api/pedidos', 'POST', shipping);
  const other = client();
  await other.request('/api/auth/registro', 'POST', { nombre: 'Otro', email: 'otro@example.test', password: 'Test-password-123' });
  assert.equal((await other.request('/api/pedidos/1/cancelar', 'PUT')).status, 404);
  assert.equal((await other.request('/api/pedidos')).body.length, 0);
  const results = await Promise.all([1, 2].map(() => c.request('/api/pedidos/1/cancelar', 'PUT')));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
  assert.equal(product.stock, 10); assert.equal(orders[0].estado, 'Cancelado');
});
test('flujo de estados y anulacion administrativa solo antes del envio', async () => {
  reset(); const c = await login(); const admin = await login(true);
  await add(c); await c.request('/api/pedidos', 'POST', shipping);
  const change = estado => admin.request('/api/admin/pedidos/1/estado', 'PUT', { estado });
  assert.equal((await change('Entregado')).status, 400);
  assert.equal((await change('Despachado')).status, 200);
  assert.equal((await c.request('/api/pedidos/1/cancelar', 'PUT')).status, 400);
  assert.equal((await change('Enviado')).status, 200);
  assert.equal((await change('Cancelado')).status, 400);
  assert.equal((await change('Entregado')).status, 200);
  assert.equal((await change('Cancelado')).status, 400);
  assert.equal(product.stock, 8);
  for (const estado of ['Pendiente', 'Pagado', 'Despachado']) {
    orders[0].estado = estado;
    assert.equal((await change('Cancelado')).status, 200);
    const stock = product.stock;
    assert.equal((await change('Cancelado')).status, 400);
    assert.equal(product.stock, stock);
  }
});
test('errores de conexion en rutas async devuelven 500', async () => {
  reset(); const c = await login(); const original = db.getConnection;
  db.getConnection = async () => { throw new Error('Conexion de prueba no disponible'); };
  try { assert.equal((await c.request('/api/pedidos', 'POST', shipping)).status, 500); }
  finally { db.getConnection = original; }
});
