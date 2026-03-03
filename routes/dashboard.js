const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// Proteger todas las rutas del dashboard
router.use(auth, admin);

// GET /api/dashboard/stats
router.get('/stats', async (req, res) => {
  try {
    // Métricas principales en paralelo
    const [generalStats] = await db.query(`
      SELECT 
        COUNT(id) as total_drinks_served,
        IFNULL(SUM(points_transacted), 0) as total_points_consumed
      FROM audit_log
    `);

    const [guestStats] = await db.query(`
      SELECT
        COUNT(id) as total_guests,
        SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked_guests
      FROM guests
    `);

    const [topDrink] = await db.query(`
      SELECT d.name, COUNT(a.id) as times_served
      FROM audit_log a
      JOIN drinks_menu d ON a.drink_id = d.id
      GROUP BY d.name
      ORDER BY times_served DESC
      LIMIT 1
    `);

    const [consumptionByHour] = await db.query(`
      SELECT HOUR(created_at) as hour, COUNT(id) as drinks_served
      FROM audit_log
      GROUP BY HOUR(created_at)
      ORDER BY hour
    `);

    const [consumptionTimeline] = await db.query(`
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') as minute,
        COUNT(id) as drinks_served,
        SUM(points_transacted) as points_consumed
      FROM audit_log
      WHERE created_at >= NOW() - INTERVAL 1 HOUR
      GROUP BY minute
      ORDER BY minute
    `);

    const [consumptionByCategory] = await db.query(`
      SELECT gc.name as category_name, COUNT(al.id) as total_drinks, SUM(al.points_transacted) as total_points
      FROM audit_log al
      JOIN guests g ON al.guest_id = g.id
      JOIN guest_categories gc ON g.category_id = gc.id
      GROUP BY gc.name
    `);

    const [consumptionByBar] = await db.query(`
      SELECT b.name as bar_name, COUNT(a.id) as total_drinks, SUM(a.points_transacted) as total_points
      FROM audit_log a
      JOIN bars b ON a.bar_id = b.id
      GROUP BY b.name
      ORDER BY total_drinks DESC
    `);

    const average_points_per_guest = guestStats[0].total_guests > 0 
      ? (generalStats[0].total_points_consumed || 0) / guestStats[0].total_guests
      : 0;

    res.json({
      total_drinks_served: generalStats[0].total_drinks_served || 0,
      total_points_consumed: generalStats[0].total_points_consumed || 0,
      total_guests: guestStats[0].total_guests || 0,
      blocked_guests: guestStats[0].blocked_guests || 0,
      most_requested_drink: topDrink.length > 0 ? topDrink[0] : 'N/A',
      average_points_per_guest: average_points_per_guest.toFixed(2),
      consumption_by_hour: consumptionByHour || [],
      consumption_by_bar: consumptionByBar || [],
      consumption_timeline: consumptionTimeline || [],
      consumption_by_category: consumptionByCategory || []
    });

  } catch (error) {
    console.error('Error al obtener estadísticas del dashboard:', error);
    res.status(500).json({ message: 'Error en el servidor.' });
  }
});

// GET /api/dashboard/projectable (Versión simplificada para pantalla grande)
router.get('/projectable', async (req, res) => {
  try {
    const [generalStats] = await db.query(`
      SELECT COUNT(id) as total_drinks_served FROM audit_log
    `);
    
    const [topDrinks] = await db.query(`
      SELECT d.name, COUNT(a.id) as times_served
      FROM audit_log a
      JOIN drinks_menu d ON a.drink_id = d.id
      GROUP BY d.name
      ORDER BY times_served DESC
      LIMIT 5
    `);

    res.json({
      total_drinks_served: generalStats[0].total_drinks_served || 0,
      top_drinks: topDrinks
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener datos proyectables.' });
  }
});

module.exports = router;
