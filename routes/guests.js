const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// Función para generar código corto aleatorio (4 dígitos numéricos)
const generateShortCode = () => {
  return Math.floor(1000 + Math.random() * 9000).toString(); // Genera entre 1000 y 9999
};

// NUEVA RUTA PÚBLICA: Búsqueda por nombre para invitados (Sin Auth)
router.get('/public/search/:name', async (req, res) => {
  const { name } = req.params;
  try {
    const [rows] = await db.query('SELECT name, unique_code FROM guests WHERE name LIKE ?', [`%${name}%`]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Error al buscar.' });
  }
});

// Proteger el resto de las rutas con autenticación y rol de admin
router.use(auth, admin);

// Obtener todos los invitados
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM guests');
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error en el servidor.' });
  }
});

// Crear un nuevo invitado
router.post('/', async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'El nombre es requerido.' });
  }

  try {
    let unique_code;
    let isUnique = false;

    // Asegurarnos de que el código sea realmente único (4 dígitos)
    while (!isUnique) {
      unique_code = Math.floor(1000 + Math.random() * 9000).toString(); 
      const [existing] = await db.query('SELECT id FROM guests WHERE unique_code = ?', [unique_code]);
      if (existing.length === 0) isUnique = true;
    }

    await db.query('INSERT INTO guests (name, unique_code) VALUES (?, ?)', [name, unique_code]);
    res.status(201).json({ message: 'Invitado creado con éxito.', code: unique_code });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error en el servidor.' });
  }
});

// Actualizar un invitado
router.put('/:id', async (req, res) => {
  const { name, max_drinks, status } = req.body;
  const { id } = req.params;

  try {
    await db.query('UPDATE guests SET name = ?, max_drinks = ?, status = ? WHERE id = ?', [name, max_drinks, status, id]);
    res.json({ message: 'Invitado actualizado con éxito.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error en el servidor.' });
  }
});

// Eliminar un invitado
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await db.query('DELETE FROM guests WHERE id = ?', [id]);
    res.json({ message: 'Invitado eliminado con éxito.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error en el servidor.' });
  }
});

// Resetear el consumo de un invitado
router.put('/reset/:id', async (req, res) => {
    const { id } = req.params;

    try {
        await db.query('UPDATE guests SET drinks_consumed = 0, status = "active" WHERE id = ?', [id]);
        res.json({ message: 'Consumo del invitado reseteado con éxito.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error en el servidor.' });
    }
});

module.exports = router;
