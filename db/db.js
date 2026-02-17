const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3");
const { Pool } = require("pg");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "app.sqlite");
const DATABASE_URL = process.env.DATABASE_URL;
const IS_POSTGRES = !!DATABASE_URL;

const pgPool = IS_POSTGRES
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : null;

function openDb() {
  if (IS_POSTGRES) return pgPool;

  const db = new sqlite3.Database(DB_PATH);
  db.run("PRAGMA foreign_keys = ON");
  return db;
}

async function run(db, sql, params = []) {
  if (IS_POSTGRES) {
    const res = await db.query(sql, params);
    return { rowCount: res.rowCount, rows: res.rows };
  }

  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

async function get(db, sql, params = []) {
  if (IS_POSTGRES) {
    const res = await db.query(sql, params);
    return res.rows[0] || null;
  }

  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

async function all(db, sql, params = []) {
  if (IS_POSTGRES) {
    const res = await db.query(sql, params);
    return res.rows;
  }

  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function initDb(db) {
  const initSqlPath = path.join(__dirname, "init.sql");
  let sql = fs.readFileSync(initSqlPath, "utf8");

  if (IS_POSTGRES) {
    sql = sql
      .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, "SERIAL PRIMARY KEY")
      .replace(/\bDATETIME\b/gi, "TIMESTAMP")
      .replace(/PRAGMA[^;]*;/gi, "");

    // Postgres: ejecutar statement por statement
    const statements = sql
      .split(";")
      .map(s => s.trim())
      .filter(Boolean);

    for (const stmt of statements) {
      await db.query(stmt);
    }
    return;
  }

  await new Promise((resolve, reject) => {
    db.exec(sql, (err) => (err ? reject(err) : resolve()));
  });
}


module.exports = { openDb, initDb, run, get, all, DB_PATH, IS_POSTGRES };
