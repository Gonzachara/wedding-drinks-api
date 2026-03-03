require('dotenv').config();
const express = require('express');
const db = require('./db');
const cors = require('cors');
const http = require('http');
const { initSocket } = require('./socket');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);
const io = initSocket(server);
const port = process.env.PORT || 3000;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Demasiadas solicitudes desde esta IP, por favor intente de nuevo más tarde.'
});

// Apply rate limiting to all requests
app.use(limiter);

// Habilitar CORS para el dominio de producción
app.use(cors());
app.use(express.json());

// Inyectar io en las rutas si es necesario
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Rutas
app.use('/api/auth', require('./routes/auth'));
app.use('/api/guests', require('./routes/guests'));
app.use('/api/bartender', require('./routes/bartender'));
app.use('/api/menu', require('./routes/menu'));
app.use('/api/management', require('./routes/management'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/export', require('./routes/export'));
app.use('/api/sync', require('./routes/sync'));

// Ruta de bienvenida
app.get('/', (req, res) => {
  res.send('¡El servidor del casamiento está funcionando!');
});

// Ruta para probar la conexión a la base de datos
app.get('/test-db', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ success: true, message: 'La conexión a la base de datos es exitosa.' });
  } catch (error) {
    console.error('Error al conectar a la base de datos:', error);
    res.status(500).json({ success: false, message: 'Error al conectar a la base de datos.' });
  }
});

const setupDatabase = require('./setup');

// ... (resto del código)

// Iniciar el servidor después de asegurar la BD
async function startServer() {
  await setupDatabase();
  server.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
  });
}

startServer();
