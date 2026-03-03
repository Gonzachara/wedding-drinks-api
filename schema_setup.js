require('dotenv').config();
const db = require('./db');

async function setupDatabase() {
  try {
    // Crear tabla de barras
    await db.query(`
      CREATE TABLE IF NOT EXISTS bars (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        location VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Tabla 'bars' asegurada.");

    // Añadir columna bar_id a la tabla de usuarios si no existe
    try {
      await db.query('ALTER TABLE users ADD COLUMN bar_id INT NULL');
      await db.query('ALTER TABLE users ADD CONSTRAINT fk_bar_id FOREIGN KEY (bar_id) REFERENCES bars(id) ON DELETE SET NULL');
      console.log("Columna 'bar_id' añadida a la tabla 'users'.");
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }

    // Asegurar que la columna role existe
    try {
      await db.query("ALTER TABLE users ADD COLUMN role VARCHAR(50) NOT NULL DEFAULT 'bartender'");
      console.log("Columna 'role' añadida a la tabla 'users'.");
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }

    console.log('Configuración de la base de datos completada con éxito.');

  } catch (error) {
    console.error('Error durante la configuración de la base de datos:', error);
    process.exit(1); // Salir con error
  }
}

// Ejecutar la configuración y cerrar la conexión
setupDatabase().then(() => {
    db.end();
});
