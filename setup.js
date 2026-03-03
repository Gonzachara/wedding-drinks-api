const db = require('./db');
const bcrypt = require('bcryptjs');

async function setupDatabase() {
  console.log('--- Iniciando configuración automática de la base de datos ---');
  try {
    // 1. Tabla global_settings
    await db.query(`
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
      await db.query('INSERT IGNORE INTO global_settings (setting_key, setting_value, description) VALUES (?, ?, ?)', s);
    }

    // 2. Tabla bars
    await db.query(`
      CREATE TABLE IF NOT EXISTS bars (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          description TEXT,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Tabla 'bars' asegurada.");

    // 3. Tabla users
    await db.query(`
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

    // 4. SEED Usuarios iniciales si no existen
    const users = [
      { username: 'admin', password: 'password123', role: 'admin' },
      { username: 'bartender', password: 'bartender123', role: 'bartender' },
      { username: 'supervisor', password: 'supervisor123', role: 'supervisor' }
    ];

    for (const u of users) {
      const [rows] = await db.query('SELECT id FROM users WHERE username = ?', [u.username]);
      if (rows.length === 0) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(u.password, salt);
        await db.query('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [u.username, hashedPassword, u.role]);
        console.log(`Usuario semilla creado: ${u.username}`);
      }
    }

    // 5. Tabla guest_categories
    await db.query(`
      CREATE TABLE IF NOT EXISTS guest_categories (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Tabla 'guest_categories' asegurada.");

    // 6. Tabla guests
    await db.query(`
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

    // 7. Tabla drinks_menu
    await db.query(`
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

    // 8. Tabla audit_log
    await db.query(`
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

    console.log('--- Configuración de base de datos completada con éxito ---');

  } catch (error) {
    console.error('ERROR CRÍTICO durante la configuración de la base de datos:', error);
    // En Render, a veces es mejor no matar el proceso si es un error no fatal, 
    // pero aquí la BD es vital.
    throw error; 
  }
}

module.exports = setupDatabase;
