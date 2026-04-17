require('dotenv').config();

const connection = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    }
  : {
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
      database: process.env.PGDATABASE || 'price_app',
    };

module.exports = {
  development: {
    client: 'pg',
    connection,
    migrations: { directory: './db/migrations' },
    seeds: { directory: './db/seeds' },
  },
  production: {
    client: 'pg',
    connection,
    pool: { min: 2, max: 10 },
    migrations: { directory: './db/migrations' },
    seeds: { directory: './db/seeds' },
  },
};
