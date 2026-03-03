const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

async function ensureCoreTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS drinks_menu (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT NULL,
      category VARCHAR(100) NULL,
      points_value INT NOT NULL DEFAULT 10,
      is_alcoholic BOOLEAN DEFAULT TRUE,
      is_available BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// Helper function to get a global setting value
const getSetting = async (key, defaultValue) => {
  try {
    const [rows] = await db.query('SELECT setting_value FROM global_settings WHERE setting_key = ?', [key]);
    return rows.length > 0 ? rows[0].setting_value : defaultValue;
  } catch (error) {
    console.error(`Error fetching setting ${key}:`, error);
    return defaultValue;
  }
};

// PUBLIC ROUTE: Search guests by name (no auth needed)
router.get('/public/search/:name', async (req, res) => {
  const { name } = req.params;
  try {
    const [rows] = await db.query('SELECT name, unique_code FROM guests WHERE name LIKE ?', [`%${name}%`]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Error al buscar.' });
  }
});

// Middleware to protect all subsequent routes
router.use(auth);

// ADMIN: Recent activity (audit log)
router.get('/admin/activity', admin, async (req, res) => {
  try {
    await ensureCoreTables();
    const [rows] = await db.query(`
      SELECT 
        a.id,
        g.name AS guest_name,
        d.name AS action,
        a.points_transacted,
        a.timestamp AS timestamp
      FROM audit_log a
      LEFT JOIN guests g ON a.guest_id = g.id
      LEFT JOIN drinks_menu d ON a.drink_id = d.id
      ORDER BY a.timestamp DESC
      LIMIT 50
    `);
    res.json(rows);
  } catch (error) {
    res.json([]);
  }
});

// GET all guests (protected)
router.get('/', admin, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT g.*, c.name as category_name FROM guests g LEFT JOIN guest_categories c ON g.category_id = c.id ORDER BY g.name ASC');
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error en el servidor al obtener invitados.' });
  }
});

// POST a new guest (admin only)
router.post('/', admin, async (req, res) => {
  const { name, category_id, points_limit } = req.body;
  if (!name) {
    return res.status(400).json({ message: 'El nombre es requerido.' });
  }

  try {
    const defaultPoints = await getSetting('default_guest_points', 100);
    let unique_code;
    let isUnique = false;
    while (!isUnique) {
      unique_code = Math.floor(1000 + Math.random() * 9000).toString();
      const [existing] = await db.query('SELECT id FROM guests WHERE unique_code = ?', [unique_code]);
      if (existing.length === 0) isUnique = true;
    }

    await db.query(
      'INSERT INTO guests (name, unique_code, category_id, points_limit) VALUES (?, ?, ?, ?)',
      [name, unique_code, category_id || null, points_limit || defaultPoints]
    );
    res.status(201).json({ message: 'Invitado creado con éxito.', code: unique_code });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error en el servidor al crear invitado.' });
  }
});

// POST bulk import guests (admin only)
router.post('/bulk', admin, async (req, res) => {
  const { names, category_id, points_limit } = req.body;
  if (!names || !Array.isArray(names) || names.length === 0) {
    return res.status(400).json({ message: 'No se proporcionaron nombres.' });
  }

  try {
    const defaultPoints = await getSetting('default_guest_points', 100);
    const insertedGuests = [];

    for (const guestName of names) {
      if (!guestName.trim()) continue;
      
      let unique_code;
      let isUnique = false;
      while (!isUnique) {
        unique_code = Math.floor(1000 + Math.random() * 9000).toString();
        const [existing] = await db.query('SELECT id FROM guests WHERE unique_code = ?', [unique_code]);
        if (existing.length === 0) isUnique = true;
      }

      await db.query(
        'INSERT INTO guests (name, unique_code, category_id, points_limit) VALUES (?, ?, ?, ?)',
        [guestName.trim(), unique_code, category_id || null, points_limit || defaultPoints]
      );
      insertedGuests.push({ name: guestName.trim(), code: unique_code });
    }

    res.status(201).json({ message: `${insertedGuests.length} invitados importados con éxito.`, guests: insertedGuests });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error en el servidor al importar invitados.' });
  }
});

// PUT to update a guest (admin only)
router.put('/:id', admin, async (req, res) => {
  const { id } = req.params;
  const { name, category_id, points_limit, status } = req.body;
  try {
    await db.query(
      'UPDATE guests SET name = ?, category_id = ?, points_limit = ?, status = ? WHERE id = ?',
      [name, category_id, points_limit, status, id]
    );
    res.json({ message: 'Invitado actualizado con éxito.' });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar invitado.' });
  }
});

// PUT to update global points limit (admin only)
router.put('/admin/global-limit', admin, async (req, res) => {
  const { points_limit } = req.body;
  if (!points_limit || points_limit < 0) {
    return res.status(400).json({ message: 'Límite de puntos no válido.' });
  }
  try {
    await db.query('UPDATE guests SET points_limit = ?', [points_limit]);
    res.json({ message: `Límite de puntos global actualizado a ${points_limit}.` });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar el límite global.' });
  }
});

// PUT to reset a guest's consumption (admin only)
router.put('/reset/:id', admin, async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('UPDATE guests SET points_consumed = 0, status = "active", last_drink_timestamp = NULL WHERE id = ?', [id]);
        res.json({ message: 'Consumo del invitado reseteado con éxito.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error en el servidor al resetear.' });
    }
});

// DELETE a guest (admin only)
router.delete('/:id', admin, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM guests WHERE id = ?', [id]);
    res.json({ message: 'Invitado eliminado con éxito.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error en el servidor al eliminar.' });
  }
});

module.exports = router;
