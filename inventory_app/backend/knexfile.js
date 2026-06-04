require('dotenv').config();
const path = require('path');
const fs = require('fs');

const file = process.env.DATABASE_FILE || './data/inventory.sqlite';
const filename = path.resolve(__dirname, file);
// better-sqlite3 won't create missing parent directories — make sure it exists.
fs.mkdirSync(path.dirname(filename), { recursive: true });

/** @type {import('knex').Knex.Config} */
const config = {
  client: 'better-sqlite3',
  connection: { filename },
  // SQLite has no native pool; this keeps a single connection and enables FKs.
  useNullAsDefault: true,
  pool: {
    afterCreate: (conn, done) => {
      conn.pragma('foreign_keys = ON');
      done(null, conn);
    },
  },
  migrations: { directory: path.join(__dirname, 'db/migrations') },
  seeds: { directory: path.join(__dirname, 'db/seeds') },
};

module.exports = config;
