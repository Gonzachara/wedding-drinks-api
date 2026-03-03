const db = require('./db');

async function setupDatabase() {
  console.log('Asegurando la estructura de la base de datos...');
  try {
    // Crear tabla de barras
    await db.query(`
      CREATE TABLE IF NOT EXISTS bars (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        location VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Tabla 'bars' asegurada.");

    // Crear tabla de usuarios si no existe
    await db.query(`
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            role VARCHAR(50) NOT NULL DEFAULT 'bartender',
            bar_id INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (bar_id) REFERENCES bars(id) ON DELETE SET NULL
        )
    `);
    console.log("Tabla 'users' asegurada.");

    // Crear tabla de configuraciones globales
    await db.query(`
        CREATE TABLE IF NOT EXISTS global_settings (
            setting_key VARCHAR(100) PRIMARY KEY,
            setting_value VARCHAR(255) NOT NULL
        )
    `);
    console.log("Tabla 'global_settings' asegurada.");

    console.log('Estructura de la base de datos verificada y actualizada.');

  } catch (error) {
    console.error('Error crítico durante la configuración de la base de datos:', error);
    process.exit(1); // Detener la aplicación si la BD no se puede configurar
  }
}

module.exports = setupDatabase;
