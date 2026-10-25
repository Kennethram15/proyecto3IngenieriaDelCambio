require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const secret = process.env.SESSION_SECRET;
if (!secret || secret.length < 32 || /cambia|secreto-de-desarrollo|change.?me/i.test(secret)) throw new Error('Configura SESSION_SECRET con al menos 32 caracteres aleatorios.');
const app = express();

app.use(express.json());
app.use(session({
  secret: secret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 4 } // 4 horas
}));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/tienda'));
app.use('/api/admin', require('./routes/admin'));

// Manejo de errores general
app.use((err, req, res, next) => {
  console.error('Error del servidor:', err.code || err.name);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) app.listen(PORT, () => console.log(`Tienda de peluches en http://localhost:${PORT}`));
module.exports = app;
