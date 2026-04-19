const express = require('express');
const { z } = require('zod');
const db = require('../db/knex');
const { requireAuth, requireStaff } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { resolveEffectivePrice } = require('../services/pricing');

const router = express.Router();
router.use(requireAuth);

const baseSchema = z.object({
  client_id: z.string().uuid(),
  product_id: z.string().uuid(),
  unit_price: z.coerce.number().min(0),
  total_price: z.coerce.number().min(0).nullable().optional(),
  condition_type: z.enum(['time_limited', 'single_order', 'clinic_specific']),
  effective_from: z.string().datetime().nullable().optional().or(z.literal('').transform(() => null)),
  effective_until: z.string().datetime().nullable().optional().or(z.literal('').transform(() => null)),
  max_uses: z.coerce.number().int().min(1).nullable().optional(),
  reason: z.string().min(1),
  notes: z.string().nullable().optional(),
});

const createSchema = baseSchema.superRefine((data, ctx) => {
  if (data.condition_type === 'time_limited' && !data.effective_from && !data.effective_until) {
    ctx.addIssue({ code: 'custom', message: 'time_limited requires at least one of effective_from or effective_until' });
  }
});

const updateSchema = baseSchema.partial().omit({ client_id: true, product_id: true });

// List with filters — useful both globally and scoped.
router.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const { client_id, clinic_id, product_id, condition_type } = req.query;
  const active = req.query.active;
  const expired = req.query.expired === 'true';
  const exhausted = req.query.exhausted === 'true';

  const q = db('special_pricing as sp')
    .join('clients as cl', 'cl.id', 'sp.client_id')
    .join('clinics as c', 'c.id', 'cl.clinic_id')
    .join('products as p', 'p.id', 'sp.product_id')
    .leftJoin('users as u', 'u.id', 'sp.created_by')
    .select(
      'sp.*',
      'cl.name as client_name',
      'c.id as clinic_id',
      'c.name as clinic_name',
      'p.name as product_name',
      'p.unit_of_measure',
      'p.labb_cost',
      'u.email as created_by_email',
    )
    .orderBy('sp.created_at', 'desc')
    .limit(limit)
    .offset(offset);

  if (client_id) q.where('sp.client_id', client_id);
  if (clinic_id) q.where('c.id', clinic_id);
  if (product_id) q.where('sp.product_id', product_id);
  if (condition_type) q.where('sp.condition_type', condition_type);
  if (active === 'true') q.where('sp.is_active', true);
  if (active === 'false') q.where('sp.is_active', false);
  if (expired) q.where('sp.condition_type', 'time_limited').whereNotNull('sp.effective_until').where('sp.effective_until', '<', db.fn.now());
  if (exhausted) q.where('sp.condition_type', 'single_order').whereRaw('sp.uses_count >= COALESCE(sp.max_uses, 1)');

  const rows = await q;
  res.json({ special_pricing: rows });
});

router.get('/:id', async (req, res) => {
  const row = await db('special_pricing as sp')
    .join('clients as cl', 'cl.id', 'sp.client_id')
    .join('clinics as c', 'c.id', 'cl.clinic_id')
    .join('products as p', 'p.id', 'sp.product_id')
    .leftJoin('users as u', 'u.id', 'sp.created_by')
    .where('sp.id', req.params.id)
    .select(
      'sp.*',
      'cl.name as client_name',
      'c.id as clinic_id',
      'c.name as clinic_name',
      'p.name as product_name',
      'p.unit_of_measure',
      'p.labb_cost',
      'u.email as created_by_email',
    )
    .first();
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({ special_pricing: row });
});

router.post('/', requireStaff, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const client = await db('clients').where({ id: parsed.data.client_id }).first();
  if (!client) return res.status(400).json({ error: 'client_not_found' });
  const product = await db('products').where({ id: parsed.data.product_id }).first();
  if (!product) return res.status(400).json({ error: 'product_not_found' });

  const [row] = await db('special_pricing')
    .insert({ ...parsed.data, created_by: req.user.id })
    .returning('*');

  await audit({ req, action: 'special_pricing.create', entityType: 'special_pricing', entityId: row.id, after: row });
  res.status(201).json({ special_pricing: row });
});

router.patch('/:id', requireStaff, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const before = await db('special_pricing').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });

  const [row] = await db('special_pricing')
    .where({ id: req.params.id })
    .update({ ...parsed.data, updated_at: db.fn.now() })
    .returning('*');

  await audit({ req, action: 'special_pricing.update', entityType: 'special_pricing', entityId: row.id, before, after: row });
  res.json({ special_pricing: row });
});

router.post('/:id/deactivate', requireStaff, async (req, res) => {
  const before = await db('special_pricing').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });
  const [row] = await db('special_pricing').where({ id: req.params.id }).update({ is_active: false, updated_at: db.fn.now() }).returning('*');
  await audit({ req, action: 'special_pricing.deactivate', entityType: 'special_pricing', entityId: row.id, before, after: row });
  res.json({ special_pricing: row });
});

router.post('/:id/activate', requireStaff, async (req, res) => {
  const before = await db('special_pricing').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });
  const [row] = await db('special_pricing').where({ id: req.params.id }).update({ is_active: true, updated_at: db.fn.now() }).returning('*');
  await audit({ req, action: 'special_pricing.activate', entityType: 'special_pricing', entityId: row.id, before, after: row });
  res.json({ special_pricing: row });
});

// Increment uses_count for single_order consumption. The caller (future orders
// subsystem) will call this after resolving and committing an order line.
router.post('/:id/consume', requireStaff, async (req, res) => {
  const before = await db('special_pricing').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });
  const cap = before.max_uses ?? (before.condition_type === 'single_order' ? 1 : null);
  if (cap != null && before.uses_count >= cap) {
    return res.status(409).json({ error: 'exhausted' });
  }
  const [row] = await db('special_pricing')
    .where({ id: req.params.id })
    .update({ uses_count: db.raw('uses_count + 1'), updated_at: db.fn.now() })
    .returning('*');

  await audit({ req, action: 'special_pricing.consume', entityType: 'special_pricing', entityId: row.id, before, after: row });
  res.json({ special_pricing: row });
});

// Resolve effective price for (client, product) — the canonical lookup.
router.get('/resolve/:clientId/:productId', async (req, res) => {
  const out = await resolveEffectivePrice({ clientId: req.params.clientId, productId: req.params.productId });
  res.json(out);
});

// Resolve all effective prices for a client — one per active product that has
// either a special row or a bucket row. Used by the client detail page.
router.get('/resolve-client/:clientId', async (req, res) => {
  const client = await db('clients').where({ id: req.params.clientId }).first();
  if (!client) return res.status(404).json({ error: 'client_not_found' });

  const products = await db('products').where({ is_active: true }).orderBy('name');
  const results = [];
  for (const p of products) {
    const r = await resolveEffectivePrice({ clientId: req.params.clientId, productId: p.id });
    if (r.source !== 'none') {
      results.push({
        product_id: p.id,
        product_name: p.name,
        unit_of_measure: p.unit_of_measure,
        labb_cost: Number(p.labb_cost),
        ...r,
      });
    }
  }
  res.json({ client_id: client.id, effective: results });
});

module.exports = router;
