const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit');

// Todas las rutas aquí requieren autenticación de administrador
router.use(auth, admin);

// GET /api/export/csv/summary
router.get('/csv/summary', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        g.name as guest_name,
        gc.name as category,
        d.name as drink_name,
        al.points_transacted as points,
        b.name as bar_name,
        al.created_at as timestamp
      FROM audit_log al
      JOIN guests g ON al.guest_id = g.id
      LEFT JOIN guest_categories gc ON g.category_id = gc.id
      JOIN drinks_menu d ON al.drink_id = d.id
      JOIN bars b ON al.bar_id = b.id
      ORDER BY al.created_at DESC
    `);

    const json2csvParser = new Parser();
    const csv = json2csvParser.parse(rows);

    res.header('Content-Type', 'text/csv');
    res.attachment('resumen_evento.csv');
    return res.send(csv);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al exportar CSV.' });
  }
});

// GET /api/export/pdf/report
router.get('/pdf/report', async (req, res) => {
  try {
    const [generalStats] = await db.query(`
      SELECT 
        COUNT(id) as total_drinks,
        SUM(points_transacted) as total_points
      FROM audit_log
    `);

    const [guestStats] = await db.query(`
      SELECT COUNT(id) as total_guests FROM guests
    `);

    const [barStats] = await db.query(`
      SELECT b.name, COUNT(al.id) as drinks, SUM(al.points_transacted) as points
      FROM bars b
      LEFT JOIN audit_log al ON b.id = al.bar_id
      GROUP BY b.name
    `);

    const doc = new PDFDocument();
    let filename = 'reporte_final_evento.pdf';
    filename = encodeURIComponent(filename);
    res.setHeader('Content-disposition', 'attachment; filename="' + filename + '"');
    res.setHeader('Content-type', 'application/pdf');

    doc.fontSize(20).text('Reporte Final del Evento', { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text(`Fecha: ${new Date().toLocaleString()}`);
    doc.moveDown();

    doc.fontSize(16).text('Estadísticas Generales');
    doc.fontSize(12).text(`Total Bebidas Servidas: ${generalStats[0].total_drinks || 0}`);
    doc.text(`Total Puntos Consumidos: ${generalStats[0].total_points || 0}`);
    doc.text(`Total Invitados: ${guestStats[0].total_guests || 0}`);
    doc.moveDown();

    doc.fontSize(16).text('Consumo por Barra');
    barStats.forEach(bar => {
      doc.fontSize(12).text(`${bar.name}: ${bar.drinks || 0} bebidas, ${bar.points || 0} puntos`);
    });

    doc.end();
    doc.pipe(res);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al exportar PDF.' });
  }
});

module.exports = router;
