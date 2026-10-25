# 🧸 Peluchitos — Carrito de compras

Proyecto corto del III parcial de Ingeniería del Cambio (UMES).
Tienda en línea de peluches con vista de cliente y panel de administrador.

**Stack:** Node.js + Express · MySQL · HTML/CSS/JS con Bootstrap 5 (responsive).

## Cómo correrlo

1. Instalar [Node.js](https://nodejs.org) y MySQL.
2. En la carpeta del proyecto:
   ```bash
   npm install
   ```
3. Crear la base de datos y las tablas:
   ```bash
   mysql -u root -p < database.sql
   ```
4. Copiar `.env.example` a `.env` y configurar MySQL, SESSION_SECRET y las variables ADMIN_EMAIL, ADMIN_PASSWORD y ADMIN_NAME:
   ```bash
   cp .env.example .env      # en Windows: copy .env.example .env
   ```
5. Crear el administrador y los peluches de ejemplo:
   ```bash
   npm run seed
   ```
6. Iniciar:
   ```bash
   npm start
   ```
7. Abrir http://localhost:3000

**Administrador:** utiliza las credenciales que configuraste en las variables de entorno; no hay credenciales predeterminadas.
Los clientes se registran desde la página "Ingresar → Crear cuenta".

## Funciones

**Cliente:** registro, login, catálogo, carrito (agregar, cambiar cantidad, quitar), compra con datos de envío y pago simulado, ver mis pedidos y cancelar un pedido.

**Administrador:** CRUD de productos, inventario con alerta de stock bajo, ver pedidos y avanzar su estado (Despachado → Enviado → Entregado), anular pedidos, ver y activar/desactivar usuarios.

## Escenarios contemplados (para la demo)

| Escenario | Qué pasa |
|---|---|
| Cliente cancela pedido | Solo si está Pendiente o Pagado. Pasa a Cancelado y el stock se devuelve |
| Admin anula un pedido | Solo Pendiente, Pagado o Despachado; nunca Enviado, Entregado o Cancelado |
| Stock insuficiente | Se bloquea al agregar al carrito, al cambiar cantidad y al confirmar |
| Pago rechazado | Tarjeta que termina en `0000` se rechaza; el carrito se conserva |
| Tarjeta inválida / vencida | Se valida número (16 dígitos), vencimiento y CVV |
| Borrar producto con pedidos | Se desactiva en vez de borrarse (se conserva el historial) |

## Seguridad aplicada

- Contraseñas con hash (bcrypt), nunca en texto plano.
- Consultas SQL parametrizadas (contra inyección SQL).
- Sesiones con cookie `httpOnly`; rutas del admin protegidas por rol.
- No se guarda el número de tarjeta, solo los últimos 4 dígitos.
- Texto escapado en el navegador (contra XSS).
- La compra usa una transacción para no descuadrar el inventario.

## Estructura

```
server.js            servidor Express
db.js                conexión a MySQL
seed.js              admin + productos de ejemplo
database.sql         tablas
routes/              auth.js, tienda.js (cliente), admin.js
middleware/auth.js   control de sesión y rol
public/              páginas HTML, css y js
```

## Configuración de seguridad

`SESSION_SECRET` es obligatorio: debe contener al menos 32 caracteres aleatorios. Puedes generar un valor local con:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Copia el resultado únicamente a tu `.env`. Los valores de ejemplo y los secretos cortos impiden iniciar el servidor. Configura `DB_HOST`, `DB_USER`, `DB_PASSWORD` y `DB_NAME` según tu instalación. No sobrescribas tu `.env` existente al actualizar el proyecto.

Para una base nueva de demostración, configura `ADMIN_EMAIL`, `ADMIN_PASSWORD` (mínimo 12 caracteres) y opcionalmente `ADMIN_NAME` antes de ejecutar `npm run seed`. El seed no cambia contraseñas ni roles de correos existentes; utiliza un correo nuevo si el anterior pertenece a un cliente. No ejecutes el seed sobre datos de producción.

`.env` y `node_modules/` se excluyen de Git; instala las dependencias con `npm ci`. Las copias locales se conservan. Como estuvieron versionados secretos y credenciales de ejemplo, rota el secreto de sesión, las credenciales de base de datos expuestas y la contraseña administrativa anterior. Quitarlos del seguimiento no los elimina del historial; no se reescribe el historial automáticamente.

Se consulta en MySQL el usuario activo y su rol en cada petición protegida. Login y registro regeneran la sesión. Solo los clientes operan carritos y pedidos propios. Las sesiones usan el almacén en memoria de Express, adecuado para la demostración local: reiniciar el servidor cierra las sesiones.

## Reglas de compra e inventario

- El cliente cancela únicamente pedidos Pendiente o Pagado.
- El administrador anula únicamente pedidos Pendiente, Pagado o Despachado.
- El flujo de entrega es Pendiente/Pagado → Despachado → Enviado → Entregado.
- Una cancelación bloquea el pedido dentro de una transacción y devuelve existencias una sola vez.
- Los productos inactivos siguen visibles en el carrito, con aviso y opción de quitarlos. Impiden confirmar la compra.
- Cantidades y stock deben ser enteros; el precio positivo admite como máximo dos decimales y el límite de `DECIMAL(10,2)`.
- Los totales se calculan en centavos desde los precios de MySQL. La compra bloquea los registros, descuenta stock y vacía el carrito dentro de una transacción. Las modificaciones del carrito y las compras del mismo usuario se serializan bloqueando su registro.
- Los pagos siguen siendo simulados; nunca uses datos de tarjetas reales.

## Pruebas

```bash
npm test
```

En PowerShell, si la política bloquea `npm.ps1`, utiliza `npm.cmd test` (también `npm.cmd ci`, `npm.cmd start`). Se usa `node:test` sin dependencias adicionales. Las pruebas hacen peticiones HTTP a Express con sesiones reales y un doble de MySQL: validan autenticación, permisos, entradas, carrito, pagos, errores con reversión, pedidos propios, cancelaciones repetidas y transiciones. Las pruebas concurrentes usan un bloqueo simulado; **no comprueban el aislamiento ni los bloqueos reales de InnoDB**.

En este entorno MySQL rechazó la conexión (`ECONNREFUSED`); no se ejecutaron pruebas con una base real ni pruebas visuales en navegador. Antes de la presentación, verifica con una base exclusiva de pruebas y tablas InnoDB:

1. Registro, login correcto e incorrecto, logout, permisos y desactivación de una cuenta que tenga sesión abierta.
2. Agregar, modificar y quitar productos; desactivar un producto ya agregado y comprobar el aviso y bloqueo de compra.
3. Compra contra entrega y con tarjeta simulada de 16 dígitos, CVV de tres dígitos y vencimiento futuro; rechazo si termina en `0000`. Confirmar importes, detalle, vaciado del carrito y descuento de inventario.
4. Reducir el stock desde otra sesión antes de comprar y verificar el rechazo sin pedido ni descuento parcial.
5. Enviar dos compras simultáneas del mismo carrito y compras de clientes distintos sobre las últimas unidades; comprobar que no haya doble descuento ni stock negativo.
6. Cancelar simultáneamente desde cliente y administrador; comprobar una sola devolución. Repetir la cancelación y comprobar su rechazo. Probar pedidos de otro cliente.
7. Despachar, enviar y entregar; comprobar que el cliente no cancela desde Despachado y que el administrador no anula desde Enviado.
8. Revisar en navegador los botones, mensajes y adaptación responsive de catálogo, carrito, pedidos y administración.

No ejecutes estas pruebas sobre una base de producción. No se requieren cambios al esquema existente.
