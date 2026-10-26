-- Ejecutar una vez en instalaciones existentes. Conserva usuarios y pedidos.
USE peluchitos;
CREATE TABLE IF NOT EXISTS roles (
  nombre VARCHAR(50) PRIMARY KEY
);
ALTER TABLE usuarios MODIFY COLUMN rol VARCHAR(50) NOT NULL DEFAULT 'cliente';
INSERT IGNORE INTO roles (nombre) VALUES ('cliente'), ('admin');
INSERT IGNORE INTO roles (nombre) SELECT DISTINCT rol FROM usuarios;
