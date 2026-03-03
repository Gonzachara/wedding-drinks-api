const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

// RUTA PÚBLICA PARA INVITADOS (No requiere token)
router.get('/public/guest/:code', async (req, res) => {
    const { code } = req.params;
    try {
        const [rows] = await db.query('SELECT name, drinks_consumed, max_drinks, status FROM guests WHERE unique_code = ?', [code]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Invitado no encontrado.' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error en el servidor.' });
    }
});

// Proteger el resto de rutas de bartender con autenticación
router.use(auth);

// Buscar un invitado por su código único
router.get('/guest/:code', async (req, res) => {
    const { code } = req.params;

    try {
        const [rows] = await db.query('SELECT * FROM guests WHERE unique_code = ?', [code]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Invitado no encontrado.' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error en el servidor.' });
    }
});

// Registrar una bebida para un invitado
router.post('/drink/:code', async (req, res) => {
    const { code } = req.params;

    try {
        const [rows] = await db.query('SELECT * FROM guests WHERE unique_code = ?', [code]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Invitado no encontrado.' });
        }

        const guest = rows[0];

        if (guest.status === 'blocked') {
            return res.status(403).json({ message: 'Límite de bebidas alcanzado.' });
        }

        const newDrinksConsumed = guest.drinks_consumed + 1;
        let newStatus = guest.status;

        if (newDrinksConsumed >= guest.max_drinks) {
            newStatus = 'blocked';
        }

        await db.query('UPDATE guests SET drinks_consumed = ?, status = ? WHERE unique_code = ?', [newDrinksConsumed, newStatus, code]);

        res.json({ message: 'Bebida registrada con éxito.', drinks_remaining: guest.max_drinks - newDrinksConsumed });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error en el servidor.' });
    }
});

module.exports = router;
