require('dotenv').config();
const mysql = require('mysql2');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: 3306, // Puerto estándar de MySQL
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000 // 10 segundos de timeout
});

// Verificar conexión al iniciar
pool.getConnection((err, connection) => {
  if (err) {
    console.error('ERROR CRÍTICO: No se pudo conectar a la base de datos en NutHost:', err.message);
  } else {
    console.log('CONEXIÓN EXITOSA: El backend está conectado a la base de datos.');
    connection.release();
  }
});

module.exports = pool.promise();
