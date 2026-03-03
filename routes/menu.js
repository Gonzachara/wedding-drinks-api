const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS drinks_menu (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description VARCHAR(255) NULL,
      category VARCHAR(100) NULL,
      points INT NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// Public: list all drinks
router.get('/', async (req, res) => {
  try {
    await ensureTable();
    const [rows] = await db.query('SELECT id, name, description, category, points FROM drinks_menu ORDER BY name ASC');
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener el menú.' });
  }
});

// Protected admin routes
router.use(auth, admin);

router.post('/', async (req, res) => {
  const { name, description, category, points } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'El nombre del trago es requerido.' });
  }
  try {
    await ensureTable();
    await db.query('INSERT INTO drinks_menu (name, description, category, points) VALUES (?, ?, ?, ?)', [name.trim(), description || null, category || null, points || 1]);
    res.status(201).json({ message: 'Trago agregado al menú.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al agregar trago.' });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, category, points } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'El nombre del trago es requerido.' });
  }
  try {
    await ensureTable();
    await db.query('UPDATE drinks_menu SET name = ?, description = ?, category = ?, points = ? WHERE id = ?', [name.trim(), description || null, category || null, points || 1, id]);
    res.json({ message: 'Trago actualizado.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al actualizar trago.' });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await ensureTable();
    await db.query('DELETE FROM drinks_menu WHERE id = ?', [id]);
    res.json({ message: 'Trago eliminado.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al eliminar trago.' });
  }
});

module.exports = router;
