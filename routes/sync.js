const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { emitUpdate } = require('../socket');

// Middleware for authentication
router.use(auth);

// POST /api/sync
router.post('/', async (req, res) => {
  const { transactions } = req.body; // Array of transactions
  const user_id = req.user.id;
  const bar_id = req.user.bar_id;

  if (!Array.isArray(transactions)) {
    return res.status(400).json({ message: 'Formato de transacciones inválido.' });
  }

  const results = {
    synced: [],
    conflicts: [],
    errors: []
  };

  for (const tx of transactions) {
    try {
      // Fetch guest and drink details
      const [[guestRows], [drinkRows]] = await Promise.all([
        db.query('SELECT * FROM guests WHERE unique_code = ?', [tx.guest_code]),
        db.query('SELECT * FROM drinks_menu WHERE id = ?', [tx.drink_id])
      ]);

      if (guestRows.length === 0 || drinkRows.length === 0) {
        results.errors.push({ id: tx.id, message: 'Invitado o bebida no encontrada.' });
        continue;
      }

      const guest = guestRows[0];
      const drink = drinkRows[0];
      const points_value = drink.points_value || 0;

      // Conflict detection: if the transaction was already processed (by ID)
      const [existingTx] = await db.query('SELECT id FROM audit_log WHERE device_info = ?', [`offline_${tx.id}`]);
      if (existingTx.length > 0) {
        results.conflicts.push({ id: tx.id, message: 'Transacción ya sincronizada.' });
        continue;
      }

      // Check if guest has enough points and is not blocked
      if (guest.status === 'blocked' || (guest.points_consumed + points_value > guest.points_limit)) {
        results.conflicts.push({ id: tx.id, message: 'Límite de puntos excedido o invitado bloqueado.' });
        continue;
      }

      // Start transaction
      const connection = await db.getConnection();
      await connection.beginTransaction();

      try {
        const guest_points_before = guest.points_consumed;
        const new_points_consumed = guest_points_before + points_value;
        const new_status = new_points_consumed >= guest.points_limit ? 'blocked' : 'active';

        // 1. Update guest
        await connection.query(
          'UPDATE guests SET points_consumed = ?, status = ?, last_drink_timestamp = ? WHERE id = ?',
          [new_points_consumed, new_status, tx.local_timestamp, guest.id]
        );

        // 2. Log audit trail
        await connection.query(
          'INSERT INTO audit_log (guest_id, user_id, drink_id, bar_id, points_transacted, guest_points_before, guest_points_after, device_info, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [guest.id, user_id, drink.id, bar_id, points_value, guest_points_before, new_points_consumed, `offline_${tx.id}`, tx.local_timestamp]
        );

        await connection.commit();
        connection.release();

        results.synced.push(tx.id);

        // Emit socket update
        emitUpdate('new_transaction', {
          guest_name: guest.name,
          drink_name: drink.name,
          points: points_value,
          bar_id: bar_id,
          timestamp: tx.local_timestamp
        });

      } catch (txError) {
        await connection.rollback();
        connection.release();
        results.errors.push({ id: tx.id, message: txError.message });
      }

    } catch (error) {
      results.errors.push({ id: tx.id, message: error.message });
    }
  }

  res.json(results);
});

module.exports = router;
