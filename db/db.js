const path = require('path');
const fs = require('fs');

const sqlite3 = require('sqlite3');

let Pool;
try {
  ({ Pool } = require('pg'));
} catch (e) {
  Pool = null;
}

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'app.sqlite');
const DATABASE_URL = process.env.DATABASE_URL; // ✅ Render/Neon usa esto

function isPostgres() {
  return Boolean(DATABASE_URL) && Pool;
}

// Convierte "?" -> "$1, $2..." para poder reutilizar queries si algo quedó en sqlite formato
function adaptPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function openDb() {
  if (isPostgres()) {
    const pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false } // Neon/Render OK
    });
    return pool;
  }

  const db = new sqlite3.Database(DB_PATH);
  db.run('PRAGMA foreign_keys = ON');
  return db;
}

async function run(db, sql, params = []) {
  // POSTGRES
  if (isPostgres()) {
    const pgSql = adaptPlaceholders(sql);
    const result = await db.query(pgSql, params);

    // Si el INSERT trae RETURNING id
    const insertId = result?.rows?.[0]?.id ?? null;
    const changes = typeof result.rowCount === 'number' ? result.rowCount : 0;

    return { insertId, changes };
  }

  // SQLITE
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ insertId: this.lastID, changes: this.changes });
    });
  });
}

async function get(db, sql, params = []) {
  // POSTGRES
  if (isPostgres()) {
    const pgSql = adaptPlaceholders(sql);
    const result = await db.query(pgSql, params);
    return result.rows[0] || null;
  }

  // SQLITE
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

async function all(db, sql, params = []) {
  // POSTGRES
  if (isPostgres()) {
    const pgSql = adaptPlaceholders(sql);
    const result = await db.query(pgSql, params);
    return result.rows;
  }

  // SQLITE
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

async function initDb(db) {
  // POSTGRES: ejecuta init.pg.sql si existe, si no init.sql
  if (isPostgres()) {
    const initPgPath = path.join(__dirname, 'init.pg.sql');
    const initSqlitePath = path.join(__dirname, 'init.sql');

    const initPath = fs.existsSync(initPgPath) ? initPgPath : initSqlitePath;
    const sql = fs.readFileSync(initPath, 'utf8');

    await db.query(sql);
    return;
  }

  // SQLITE
  const initSqlPath = path.join(__dirname, 'init.sql');
  const sql = fs.readFileSync(initSqlPath, 'utf8');

  await new Promise((resolve, reject) => {
    db.exec(sql, (err) => (err ? reject(err) : resolve()));
  });
}

module.exports = { openDb, initDb, run, get, all, DB_PATH };
