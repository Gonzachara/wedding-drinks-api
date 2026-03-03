const express = require('express');
const db = require('./db');

const app = express();
const port = process.env.PORT || 3000;

// Habilitar CORS para el dominio de producción
const cors = require('cors');
app.use(cors());

app.use(express.json());

// Rutas
app.use('/api/auth', require('./routes/auth'));
app.use('/api/guests', require('./routes/guests'));
app.use('/api/bartender', require('./routes/bartender'));

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

app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});
