'use strict';
// Rebuilds the demo database from scratch (dates relative to today). Stop the server first.
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_DB } = require('../src/app');
const { openDatabase } = require('../src/persistence/database');
const { Persistence } = require('../src/persistence/persistence');
const { seedDemoData } = require('../src/persistence/seed');

for (const suffix of ['', '-wal', '-shm']) {
  const f = DEFAULT_DB + suffix;
  if (fs.existsSync(f)) fs.unlinkSync(f);
}
const db = openDatabase(DEFAULT_DB);
seedDemoData(new Persistence(db));
db.close();
console.log(`Demo database rebuilt at ${path.relative(process.cwd(), DEFAULT_DB)}`);
