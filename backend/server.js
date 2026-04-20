require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const health = require('./routes/health');
const auth = require('./routes/auth');
const products = require('./routes/products');
const buckets = require('./routes/buckets');
const clinics = require('./routes/clinics');
const clients = require('./routes/clients');
const specialPricing = require('./routes/specialPricing');
const contractTemplates = require('./routes/contractTemplates');
const contracts = require('./routes/contracts');
const users = require('./routes/users');
const portal = require('./routes/portal');
const priceRequests = require('./routes/priceRequests');
const duplicates = require('./routes/duplicates');

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

const apiLimiter = rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false });
app.use('/api', apiLimiter);

app.use('/api/health', health);
app.use('/api/auth', auth);
app.use('/api/products', products);
app.use('/api/buckets', buckets);
app.use('/api/clinics', clinics);
app.use('/api/clients', clients);
app.use('/api/special-pricing', specialPricing);
app.use('/api/contract-templates', contractTemplates);
app.use('/api/contracts', contracts);
app.use('/api/users', users);
app.use('/api/portal', portal);
app.use('/api/price-requests', priceRequests);
app.use('/api/duplicates', duplicates);

// Feature route stubs — filled in subsequent commits.
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
