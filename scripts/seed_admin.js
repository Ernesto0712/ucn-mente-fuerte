require('dotenv').config();
const bcrypt = require('bcryptjs');
const { openDb, initDb, get, run } = require('../db/db');

(async () => {
  const db = openDb();
  await initDb(db);

  const email = process.env.SEED_ADMIN_EMAIL || 'admin@ucn.local';
  const pass = process.env.SEED_ADMIN_PASSWORD || 'Admin1234';
  const name = process.env.SEED_ADMIN_NAME || 'Administrador Principal';

  const exists = await get(db, 'SELECT id FROM users WHERE email = ?', [email]);
  if (exists) {
    console.log('Admin ya existe:', email);
    process.exit(0);
  }

  const hash = await bcrypt.hash(pass, 12);
  await run(db, 'INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)', [name, email, hash, 'admin']);

  console.log('Admin creado.');
  console.log('Email:', email);
  console.log('Password:', pass);
  process.exit(0);
})();
