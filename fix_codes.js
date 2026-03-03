const db = require('./db');

async function fixCodes() {
  try {
    const [guests] = await db.query('SELECT id, name FROM guests');
    console.log(`Encontrados ${guests.length} invitados para corregir...`);

    for (const guest of guests) {
      let isUnique = false;
      let newCode;

      while (!isUnique) {
        newCode = Math.floor(1000 + Math.random() * 9000).toString();
        const [existing] = await db.query('SELECT id FROM guests WHERE unique_code = ?', [newCode]);
        if (existing.length === 0) isUnique = true;
      }

      await db.query('UPDATE guests SET unique_code = ? WHERE id = ?', [newCode, guest.id]);
      console.log(`Invitado ${guest.name} actualizado con éxito. Nuevo código: ${newCode}`);
    }

    console.log('¡TODOS LOS CÓDIGOS HAN SIDO CORREGIDOS DEFINITIVAMENTE!');
    process.exit(0);
  } catch (error) {
    console.error('Error al corregir códigos:', error);
    process.exit(1);
  }
}

fixCodes();
