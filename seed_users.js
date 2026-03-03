const bcrypt = require('bcryptjs');
const db = require('./db');

async function seedUsers() {
  const users = [
    { username: 'admin', password: 'password123', role: 'admin' },
    { username: 'bartender', password: 'bartender123', role: 'bartender' },
    { username: 'supervisor', password: 'supervisor123', role: 'supervisor' }
  ];

  console.log('--- Iniciando seeding de usuarios ---');

  for (const u of users) {
    try {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(u.password, salt);

      // Primero verificamos si el usuario existe para actualizarlo, o insertarlo si no
      const [rows] = await db.query('SELECT id FROM users WHERE username = ?', [u.username]);
      
      if (rows.length > 0) {
        await db.query('UPDATE users SET password = ?, role = ? WHERE username = ?', [hashedPassword, u.role, u.username]);
        console.log(`Usuario actualizado: ${u.username}`);
      } else {
        await db.query('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [u.username, hashedPassword, u.role]);
        console.log(`Usuario creado: ${u.username}`);
      }
    } catch (error) {
      console.error(`Error procesando usuario ${u.username}:`, error);
    }
  }

  console.log('--- Seeding completado ---');
  process.exit(0);
}

seedUsers();
