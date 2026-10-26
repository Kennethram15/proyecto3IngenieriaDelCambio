-- Base de datos de la tienda de peluches
-- Ejecutar en MySQL:  mysql -u root -p < database.sql
CREATE DATABASE IF NOT EXISTS peluchitos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE peluchitos;

CREATE TABLE IF NOT EXISTS roles (
  nombre VARCHAR(50) PRIMARY KEY
);
INSERT IGNORE INTO roles (nombre) VALUES ('cliente'), ('admin');

CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  rol VARCHAR(50) NOT NULL DEFAULT 'cliente',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS productos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  descripcion VARCHAR(255) DEFAULT '',
  precio DECIMAL(10,2) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  emoji VARCHAR(10) NOT NULL DEFAULT '🧸',
  activo TINYINT(1) NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS carrito_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  producto_id INT NOT NULL,
  cantidad INT NOT NULL DEFAULT 1,
  UNIQUE KEY uq_usuario_producto (usuario_id, producto_id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (producto_id) REFERENCES productos(id)
);

CREATE TABLE IF NOT EXISTS pedidos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  estado ENUM('Pendiente','Pagado','Despachado','Enviado','Entregado','Cancelado') NOT NULL,
  direccion VARCHAR(255) NOT NULL,
  telefono VARCHAR(20) NOT NULL,
  metodo_pago ENUM('tarjeta','contra_entrega') NOT NULL,
  tarjeta_ultimos4 CHAR(4) NULL,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS pedido_detalle (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pedido_id INT NOT NULL,
  producto_id INT NOT NULL,
  cantidad INT NOT NULL,
  precio_unitario DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
  FOREIGN KEY (producto_id) REFERENCES productos(id)
);
