const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// Todas las rutas aquí requieren autenticación de administrador
router.use(auth, admin);

// --- Gestión de Barras ---

// GET todas las barras
router.get('/bars', async (req, res) => {
  try {
    const [bars] = await db.query('SELECT * FROM bars ORDER BY name');
    res.json(bars);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener las barras.' });
  }
});

// POST nueva barra
router.post('/bars', async (req, res) => {
  const { name, location } = req.body;
  if (!name) {
    return res.status(400).json({ message: 'El nombre de la barra es requerido.' });
  }
  try {
    await db.query('INSERT INTO bars (name, location) VALUES (?, ?)', [name, location]);
    res.status(201).json({ message: 'Barra creada con éxito.' });
  } catch (error) {
    res.status(500).json({ message: 'Error al crear la barra.' });
  }
});

// PUT actualizar barra
router.put('/bars/:id', async (req, res) => {
  const { id } = req.params;
  const { name, location } = req.body;
  if (!name) {
    return res.status(400).json({ message: 'El nombre de la barra es requerido.' });
  }
  try {
    await db.query('UPDATE bars SET name = ?, location = ? WHERE id = ?', [name, location, id]);
    res.json({ message: 'Barra actualizada con éxito.' });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar la barra.' });
  }
});

// DELETE barra
router.delete('/bars/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM bars WHERE id = ?', [id]);
    res.json({ message: 'Barra eliminada con éxito.' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar la barra.' });
  }
});

// --- Gestión de Usuarios ---

// GET todos los usuarios
router.get('/users', async (req, res) => {
  try {
    const [users] = await db.query('SELECT u.id, u.username, u.role, u.bar_id, b.name as bar_name FROM users u LEFT JOIN bars b ON u.bar_id = b.id ORDER BY u.username');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener los usuarios.' });
  }
});

// POST nuevo usuario
const bcrypt = require('bcryptjs');
router.post('/users', async (req, res) => {
  const { username, password, role, bar_id } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ message: 'Usuario, contraseña y rol son requeridos.' });
  }
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    await db.query(
      'INSERT INTO users (username, password, role, bar_id) VALUES (?, ?, ?, ?)',
      [username, hashedPassword, role, bar_id || null]
    );
    res.status(201).json({ message: 'Usuario creado con éxito.' });
  } catch (error) {
    res.status(500).json({ message: 'Error al crear el usuario.' });
  }
});

// PUT actualizar usuario
router.put('/users/:id', async (req, res) => {
  const { id } = req.params;
  const { username, role, bar_id } = req.body;
  if (!username || !role) {
    return res.status(400).json({ message: 'Usuario y rol son requeridos.' });
  }
  try {
    await db.query(
      'UPDATE users SET username = ?, role = ?, bar_id = ? WHERE id = ?',
      [username, role, bar_id || null, id]
    );
    res.json({ message: 'Usuario actualizado con éxito.' });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar el usuario.' });
  }
});

// DELETE usuario
router.delete('/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: 'Usuario eliminado con éxito.' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar el usuario.' });
  }
});

// --- Gestión de Categorías ---

// GET todas las categorías
router.get('/categories', async (req, res) => {
  try {
    const [categories] = await db.query('SELECT * FROM guest_categories ORDER BY name');
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener las categorías.' });
  }
});

// POST nueva categoría
router.post('/categories', async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ message: 'Nombre requerido.' });
  try {
    await db.query('INSERT INTO guest_categories (name, description) VALUES (?, ?)', [name, description]);
    res.status(201).json({ message: 'Categoría creada con éxito.' });
  } catch (error) {
    res.status(500).json({ message: 'Error al crear la categoría.' });
  }
});

// DELETE categoría
router.delete('/categories/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM guest_categories WHERE id = ?', [id]);
    res.json({ message: 'Categoría eliminada con éxito.' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar la categoría.' });
  }
});

// --- Configuración Global ---

// GET todas las configuraciones
router.get('/settings', async (req, res) => {
  try {
    const [settings] = await db.query('SELECT * FROM global_settings');
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener las configuraciones.' });
  }
});

// PUT actualizar configuración
router.put('/settings/:key', async (req, res) => {
  const { key } = req.params;
  const { setting_value } = req.body;
  try {
    await db.query('UPDATE global_settings SET setting_value = ? WHERE setting_key = ?', [setting_value, key]);
    
    // Si la configuración es emergency_mode, emitir evento a todos los clientes
    if (key === 'emergency_mode') {
      const { emitUpdate } = require('../socket');
      emitUpdate('emergency_mode_update', { mode: setting_value });
    }

    // Si se cambia el límite global por defecto, actualizar a todos los invitados
    if (key === 'default_guest_points') {
      const parsed = parseInt(setting_value, 10);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        await db.query('UPDATE guests SET points_limit = ?', [parsed]);
      }
    }
    
    res.json({ message: 'Configuración actualizada con éxito.' });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar la configuración.' });
  }
});

module.exports = router;
