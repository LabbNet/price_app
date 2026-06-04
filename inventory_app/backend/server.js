require('dotenv').config();
// Express 4 doesn't catch async handler rejections by default; this routes a
// thrown error in any async handler to the global error middleware.
require('express-async-errors');

process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const health = require('./routes/health');
const warehouses = require('./routes/warehouses');
const items = require('./routes/items');
const stock = require('./routes/stock');
const movements = require('./routes/movements');

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.use('/api/health', health);
app.use('/api/warehouses', warehouses);
app.use('/api/items', items);
app.use('/api/stock', stock);
app.use('/api/movements', movements);

app.use((err, req, res, _next) => {
  if (!err.status) console.error('[error]', err);
  res.status(err.status || 500).json({ error: err.code || 'internal_error', message: err.message });
});

const port = Number(process.env.PORT || 4100);
if (require.main === module) {
  app.listen(port, () => console.log(`[inventory_app] listening on :${port}`));
}

module.exports = app;
