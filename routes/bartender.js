const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

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

// PUBLIC ROUTE: Get guest details by code (no auth needed)
router.get('/public/guest/:code', async (req, res) => {
    const { code } = req.params;
    try {
        const [rows] = await db.query('SELECT name, points_consumed, points_limit, status FROM guests WHERE unique_code = ?', [code]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Invitado no encontrado.' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error en el servidor.' });
    }
});

// Middleware for all subsequent bartender routes
router.use(auth);

// GET guest details by code (protected)
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

// POST a drink for a guest (the core transaction)
router.post('/drink', async (req, res) => {
    const { guest_code, drink_id, device_info } = req.body;
    const user_id = req.user.id;
    const bar_id = req.user.bar_id; // Assuming bartender is associated with a bar

    if (!guest_code || !drink_id) {
        return res.status(400).json({ message: 'Faltan datos (código de invitado o bebida).' });
    }

    if (!bar_id) {
        return res.status(400).json({ message: 'Usuario no asociado a ninguna barra.' });
    }

    try {
        // Fetch guest and drink details in parallel
        const [[guestRows], [drinkRows]] = await Promise.all([
            db.query('SELECT * FROM guests WHERE unique_code = ?', [guest_code]),
            db.query('SELECT * FROM drinks_menu WHERE id = ?', [drink_id])
        ]);

        if (guestRows.length === 0) {
            return res.status(404).json({ message: 'Invitado no encontrado.' });
        }
        if (drinkRows.length === 0) {
            return res.status(404).json({ message: 'Bebida no encontrada en el menú.' });
        }

        const guest = guestRows[0];
        const drink = drinkRows[0];

        // Check guest status
        if (guest.status === 'blocked') {
            return res.status(403).json({ message: 'Límite de puntos alcanzado.' });
        }

        // Check cooldown
        const cooldownSeconds = await getSetting('guest_cooldown_seconds', 30);
        if (guest.last_drink_timestamp) {
            const now = new Date();
            const lastDrinkTime = new Date(guest.last_drink_timestamp);
            const secondsSinceLast = (now.getTime() - lastDrinkTime.getTime()) / 1000;
            if (secondsSinceLast < cooldownSeconds) {
                return res.status(429).json({ message: `Debe esperar ${Math.ceil(cooldownSeconds - secondsSinceLast)} segundos.` });
            }
        }
        
        // Check emergency mode
        const emergencyMode = await getSetting('emergency_mode', 'inactive');
        if (emergencyMode === 'full_stop' || (emergencyMode === 'alcohol_off' && drink.is_alcoholic)) {
            return res.status(403).json({ message: 'Sistema en modo emergencia. Consumo no permitido.' });
        }

        const guest_points_before = guest.points_consumed;
        const new_points_consumed = guest_points_before + drink.points_value;
        let new_status = 'active';

        if (new_points_consumed >= guest.points_limit) {
            new_status = 'blocked';
        }

        // Start transaction
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // 1. Update guest status and points
            await connection.query(
                'UPDATE guests SET points_consumed = ?, status = ?, last_drink_timestamp = NOW() WHERE id = ?',
                [new_points_consumed, new_status, guest.id]
            );

            // 2. Log the audit trail
            await connection.query(
                'INSERT INTO audit_log (guest_id, user_id, drink_id, bar_id, points_transacted, guest_points_before, guest_points_after, device_info) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [guest.id, user_id, drink_id, bar_id, drink.points_value, guest_points_before, new_points_consumed, device_info || null]
            );

            await connection.commit();
            connection.release();

            res.json({ 
                message: 'Bebida registrada con éxito.', 
                points_remaining: guest.points_limit - new_points_consumed,
                guest_status: new_status
            });

        } catch (txError) {
            await connection.rollback();
            connection.release();
            throw txError; // Propagate to the outer catch block
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error en el servidor al registrar la bebida.' });
    }
});

module.exports = router;
