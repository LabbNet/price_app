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

/**
 * Bulk import. By default, duplicates (same name, case-insensitive) are
 * skipped. Pass { mode: 'update' } to update labb_cost + other fields on
 * existing products by name instead of skipping.
 */
router.post('/import', requireStaff, async (req, res) => {
  const importSchema = z.object({
    products: z.array(productSchema).min(1).max(5000),
    mode: z.enum(['skip_existing', 'update_existing']).optional().default('skip_existing'),
  });
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const { products, mode } = parsed.data;
  const names = products.map((p) => p.name.toLowerCase());
  const existing = await db('products').whereRaw('LOWER(name) = ANY(?)', [names]).select('id', 'name');
  const existingByLowerName = new Map(existing.map((e) => [e.name.toLowerCase(), e]));

  const created = [];
  const updated = [];
  const skipped = [];

  await db.transaction(async (trx) => {
    for (const p of products) {
      const match = existingByLowerName.get(p.name.toLowerCase());
      if (match) {
        if (mode === 'update_existing') {
          const [row] = await trx('products')
            .where({ id: match.id })
            .update({ ...p, updated_at: trx.fn.now() })
            .returning(['id', 'name']);
          updated.push(row);
        } else {
          skipped.push({ name: p.name, existing_id: match.id });
        }
      } else {
        const [row] = await trx('products').insert(p).returning(['id', 'name']);
        created.push(row);
      }
    }
  });

  await audit({
    req,
    action: 'product.bulk_import',
    entityType: 'product',
    notes: `created=${created.length} updated=${updated.length} skipped=${skipped.length} mode=${mode}`,
    after: { created: created.length, updated: updated.length, skipped: skipped.length },
  });
  res.status(201).json({ created, updated, skipped });
});

module.exports = router;
