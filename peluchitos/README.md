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
4. Copiar `.env.example` a `.env` y poner tu contraseña de MySQL:
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

**Administrador:** `admin@peluchitos.com` / `Admin123!`
Los clientes se registran desde la página "Ingresar → Crear cuenta".

## Funciones

**Cliente:** registro, login, catálogo, carrito (agregar, cambiar cantidad, quitar), compra con datos de envío y pago simulado, ver mis pedidos y cancelar un pedido.

**Administrador:** CRUD de productos, inventario con alerta de stock bajo, ver pedidos y avanzar su estado (Despachado → Enviado → Entregado), anular pedidos, ver y activar/desactivar usuarios.

## Escenarios contemplados (para la demo)

| Escenario | Qué pasa |
|---|---|
| Cliente cancela pedido | Solo si está Pendiente o Pagado. Pasa a Cancelado y el stock se devuelve |
| Admin anula un pedido | Igual, mientras no esté Entregado |
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
