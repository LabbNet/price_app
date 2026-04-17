const express = require('express');
const { z } = require('zod');
const db = require('../db/knex');
const { requireAuth, requireStaff } = require('../middleware/auth');
const { audit } = require('../services/audit');

const router = express.Router();

const productSchema = z.object({
  name: z.string().min(1).max(200),
  product_type: z.string().max(100).nullable().optional(),
  unit_of_measure: z.string().max(50).nullable().optional(),
  labb_cost: z.coerce.number().min(0),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

const productUpdateSchema = productSchema.partial();

router.use(requireAuth);

router.get('/', async (req, res) => {
  const includeInactive = req.query.include_inactive === 'true';
  const q = db('products').orderBy('name');
  if (!includeInactive) q.where({ is_active: true });
  const rows = await q;
  res.json({ products: rows });
});

router.get('/:id', async (req, res) => {
  const row = await db('products').where({ id: req.params.id }).first();
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({ product: row });
});

router.post('/', requireStaff, async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const [row] = await db('products').insert(parsed.data).returning('*');
  await audit({ req, action: 'product.create', entityType: 'product', entityId: row.id, after: row });
  res.status(201).json({ product: row });
});

router.patch('/:id', requireStaff, async (req, res) => {
  const parsed = productUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const before = await db('products').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });

  const [row] = await db('products')
    .where({ id: req.params.id })
    .update({ ...parsed.data, updated_at: db.fn.now() })
    .returning('*');

  await audit({ req, action: 'product.update', entityType: 'product', entityId: row.id, before, after: row });
  res.json({ product: row });
});

router.post('/:id/deactivate', requireStaff, async (req, res) => {
  const before = await db('products').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });

  const [row] = await db('products')
    .where({ id: req.params.id })
    .update({ is_active: false, updated_at: db.fn.now() })
    .returning('*');

  await audit({ req, action: 'product.deactivate', entityType: 'product', entityId: row.id, before, after: row });
  res.json({ product: row });
});

router.post('/:id/activate', requireStaff, async (req, res) => {
  const before = await db('products').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });

  const [row] = await db('products')
    .where({ id: req.params.id })
    .update({ is_active: true, updated_at: db.fn.now() })
    .returning('*');

  await audit({ req, action: 'product.activate', entityType: 'product', entityId: row.id, before, after: row });
  res.json({ product: row });
});

module.exports = router;
