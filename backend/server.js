require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const health = require('./routes/health');
const auth = require('./routes/auth');

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

const apiLimiter = rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false });
app.use('/api', apiLimiter);

app.use('/api/health', health);
app.use('/api/auth', auth);

// Feature route stubs — filled in subsequent commits.
app.use('/api/products', (req, res) => res.status(501).json({ error: 'not_implemented' }));
app.use('/api/buckets', (req, res) => res.status(501).json({ error: 'not_implemented' }));
app.use('/api/clients', (req, res) => res.status(501).json({ error: 'not_implemented' }));
app.use('/api/clinics', (req, res) => res.status(501).json({ error: 'not_implemented' }));
app.use('/api/contracts', (req, res) => res.status(501).json({ error: 'not_implemented' }));
app.use('/api/special-pricing', (req, res) => res.status(501).json({ error: 'not_implemented' }));
app.use('/api/users', (req, res) => res.status(501).json({ error: 'not_implemented' }));
app.use('/api/audit', (req, res) => res.status(501).json({ error: 'not_implemented' }));

app.use((err, req, res, _next) => {
  console.error('[error]', err);
  res.status(err.status || 500).json({ error: err.code || 'internal_error' });
});

const port = Number(process.env.PORT || 4000);
if (require.main === module) {
  app.listen(port, () => console.log(`[price_app] listening on :${port}`));
}

module.exports = app;
