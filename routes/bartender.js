const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { emitUpdate } = require('../socket');

async function ensureAuditLogTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      guest_id INT,
      user_id INT,
      drink_id INT,
      bar_id INT,
      points_transacted INT NOT NULL,
      guest_points_before INT NOT NULL,
      guest_points_after INT NOT NULL,
      device_info VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      suspicious_activity BOOLEAN DEFAULT FALSE,
      FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL, -- Asumiendo una tabla 'users'
      FOREIGN KEY (drink_id) REFERENCES drinks_menu(id) ON DELETE SET NULL,
      FOREIGN KEY (bar_id) REFERENCES bars(id) ON DELETE SET NULL -- Asumiendo una tabla 'bars'
    )
  `);
  try {
    await db.query('ALTER TABLE audit_log ADD COLUMN suspicious_activity BOOLEAN DEFAULT FALSE');
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') throw e; // Ignorar si la columna ya existe
  }
}

ensureAuditLogTable();

async function ensureGuestsTable() {
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function ensureDrinksMenuTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS drinks_menu (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT NULL,
      category VARCHAR(100),
      points_value INT NOT NULL DEFAULT 10,
      is_alcoholic BOOLEAN DEFAULT TRUE,
      is_available BOOLEAN DEFAULT TRUE,
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
    const bar_id = req.user.bar_id || null; // bar opcional

    if (!guest_code || !drink_id) {
        return res.status(400).json({ message: 'Faltan datos (código de invitado o bebida).' });
    }
    // bar_id puede ser null en algunos usuarios; permitimos registrar igualmente

    try {
        await Promise.all([ensureGuestsTable(), ensureDrinksMenuTable(), ensureAuditLogTable()]);
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
        // Cada registro de bebida cuenta como 1 unidad de consumo (independientemente de points_value en drinks_menu)
        const points_value = 1;

        let is_suspicious = false;
        const suspicious_interval_seconds = await getSetting('suspicious_interval_seconds', 10);

        const [lastLog] = await db.query(
            'SELECT timestamp FROM audit_log WHERE guest_id = ? ORDER BY timestamp DESC LIMIT 1',
            [guest.id]
        );

        if (lastLog.length > 0) {
            const now = new Date();
            const lastLogTime = new Date(lastLog[0].created_at);
            const secondsSinceLast = (now.getTime() - lastLogTime.getTime()) / 1000;
            if (secondsSinceLast < suspicious_interval_seconds) {
                is_suspicious = true;
            }
        }

        // Check guest status
        if (guest.status === 'blocked') {
            return res.status(403).json({ message: 'Límite de bebidas alcanzado.' });
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
        const new_points_consumed = guest_points_before + points_value;
        let new_status = 'active';

        if (new_points_consumed >= guest.points_limit) {
            new_status = 'blocked';
        }

        // Start transaction
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // Determinar bar efectivo (bar_id NOT NULL en audit_log)
            let effectiveBarId = bar_id;
            if (!effectiveBarId) {
                const [bars] = await connection.query('SELECT id FROM bars ORDER BY id ASC LIMIT 1');
                if (bars.length > 0) {
                    effectiveBarId = bars[0].id;
                } else {
                    // Crear una barra por defecto si no existe ninguna
                    const [result] = await connection.query('INSERT INTO bars (name, location) VALUES (?, ?)', ['BAR PRINCIPAL', null]);
                    effectiveBarId = result.insertId;
                }
            }
            // 1. Update guest status and points
            await connection.query(
                'UPDATE guests SET points_consumed = ?, status = ?, last_drink_timestamp = NOW() WHERE id = ?',
                [new_points_consumed, new_status, guest.id]
            );

            // 2. Log the audit trail
            await connection.query(
                'INSERT INTO audit_log (guest_id, user_id, drink_id, bar_id, points_transacted, guest_points_before, guest_points_after, device_info, suspicious_activity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [guest.id, user_id, drink_id, effectiveBarId, points_value, guest_points_before, new_points_consumed, device_info || null, is_suspicious]
            );

            await connection.commit();
            connection.release();

            // Emitir evento de actualización en tiempo real
            emitUpdate('new_transaction', {
              guest_name: guest.name,
              guest_code: guest.unique_code,
              drink_name: drink.name,
              points: points_value,
              bar_id: bar_id,
              timestamp: new Date()
            });

            res.json({ 
                message: 'Bebida registrada con éxito.', 
                points_remaining: guest.points_limit - new_points_consumed,
                guest_status: new_status
            });

        } catch (txError) {
            try { await connection.rollback(); } catch (_) {}
            try { connection.release(); } catch (_) {}
            if (txError && txError.code) {
                return res.status(500).json({ message: 'No se pudo registrar la bebida', code: txError.code });
            }
            return res.status(500).json({ message: 'No se pudo registrar la bebida' });
        }

    } catch (error) {
        console.error('Error general en /bartender/drink:', error);
        res.status(500).json({ message: 'Error en el servidor al registrar la bebida.', code: error && error.code ? error.code : undefined });
    }
});

module.exports = router;
