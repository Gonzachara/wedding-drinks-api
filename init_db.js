require('dotenv').config();
const mysql = require('mysql2/promise');

async function createDatabaseAndTables() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  console.log('--- Iniciando creación de base de datos ---');
  
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\`;`);
  console.log(`Base de datos ${process.env.DB_NAME} asegurada.`);
  
  await connection.changeUser({ database: process.env.DB_NAME });

  // Tabla global_settings
  await connection.query(`
    CREATE TABLE IF NOT EXISTS global_settings (
        setting_key VARCHAR(50) PRIMARY KEY,
        setting_value VARCHAR(255) NOT NULL,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
  `);
  console.log("Tabla 'global_settings' asegurada.");

  // Insertar default settings
  const defaultSettings = [
    ['default_guest_points', '100', 'Default points assigned to a new guest.'],
    ['emergency_mode', 'inactive', 'Global emergency mode (inactive, alcohol_off, full_stop).'],
    ['guest_cooldown_seconds', '30', 'Minimum seconds between drink registrations for a guest.'],
    ['suspicious_behavior_interval', '10', 'Timeframe in seconds to detect rapid multiple registrations.']
  ];

  for (const s of defaultSettings) {
    await connection.query('INSERT IGNORE INTO global_settings (setting_key, setting_value, description) VALUES (?, ?, ?)', s);
  }

  // Tabla bars
  await connection.query(`
    CREATE TABLE IF NOT EXISTS bars (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log("Tabla 'bars' asegurada.");

  // Tabla users
  await connection.query(`
    CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin', 'supervisor', 'bartender') NOT NULL,
        bar_id INT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bar_id) REFERENCES bars(id) ON DELETE SET NULL
    );
  `);
  console.log("Tabla 'users' asegurada.");

  // Tabla guest_categories
  await connection.query(`
    CREATE TABLE IF NOT EXISTS guest_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log("Tabla 'guest_categories' asegurada.");

  // Tabla guests
  await connection.query(`
    CREATE TABLE IF NOT EXISTS guests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        unique_code VARCHAR(10) NOT NULL UNIQUE,
        category_id INT NULL,
        points_consumed INT DEFAULT 0,
        points_limit INT DEFAULT 100,
        status ENUM('active', 'blocked', 'cooldown') DEFAULT 'active',
        last_drink_timestamp TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES guest_categories(id) ON DELETE SET NULL
    );
  `);
  console.log("Tabla 'guests' asegurada.");

  // Tabla drinks_menu
  await connection.query(`
    CREATE TABLE IF NOT EXISTS drinks_menu (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        points_value INT NOT NULL DEFAULT 10,
        is_alcoholic BOOLEAN DEFAULT TRUE,
        is_available BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log("Tabla 'drinks_menu' asegurada.");

  // Tabla audit_log
  await connection.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        guest_id INT,
        user_id INT,
        drink_id INT,
        bar_id INT,
        points_transacted INT NOT NULL,
        guest_points_before INT NOT NULL,
        guest_points_after INT NOT NULL,
        device_info VARCHAR(255),
        notes TEXT,
        is_suspicious BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE SET NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (drink_id) REFERENCES drinks_menu(id) ON DELETE SET NULL,
        FOREIGN KEY (bar_id) REFERENCES bars(id) ON DELETE SET NULL
    );
  `);
  console.log("Tabla 'audit_log' asegurada.");

  console.log('--- Base de datos y tablas inicializadas con éxito ---');
  await connection.end();
}

createDatabaseAndTables().catch(console.error);
