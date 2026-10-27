'use strict';
// Opens the SQLite database (the "Relational Database" external service, D10) and applies the schema.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

function openDatabase(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 3000');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  applySchema(db);
  return db;
}

function applySchema(db) {
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
}

function dropAllTables(db) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
  db.exec('PRAGMA foreign_keys = OFF');
  for (const t of tables) db.exec(`DROP TABLE IF EXISTS "${t.name}"`);
  db.exec('PRAGMA foreign_keys = ON');
}

module.exports = { openDatabase, applySchema, dropAllTables };
