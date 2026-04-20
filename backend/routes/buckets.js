const express = require('express');
const { z } = require('zod');
const db = require('../db/knex');
const { requireAuth, requireStaff } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { seedBucketWithAllProducts } = require('../services/bucketSeed');

const router = express.Router();

router.use(requireAuth);

const bucketSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

const bucketUpdateSchema = bucketSchema.partial();

const itemSchema = z.object({
  product_id: z.string().uuid(),
  unit_price: z.coerce.number().min(0),
  total_price: z.coerce.number().min(0).nullable().optional(),
  notes: z.string().nullable().optional(),
  is_enabled: z.boolean().optional(),
});

const itemUpdateSchema = z.object({
  unit_price: z.coerce.number().min(0).optional(),
  total_price: z.coerce.number().min(0).nullable().optional(),
  notes: z.string().nullable().optional(),
  is_enabled: z.boolean().optional(),
});

// List buckets (with item counts, optional inactive)
router.get('/', async (req, res) => {
  const includeInactive = req.query.include_inactive === 'true';

  const rows = await db('pricing_buckets as b')
    .leftJoin('bucket_items as bi', 'bi.bucket_id', 'b.id')
    .select(
      'b.id',
      'b.name',
      'b.description',
      'b.notes',
      'b.copied_from_bucket_id',
      'b.is_active',
      'b.created_at',
      'b.updated_at',
      db.raw('COUNT(bi.id)::int as item_count'),
    )
    .modify((q) => { if (!includeInactive) q.where('b.is_active', true); })
    .groupBy('b.id')
    .orderBy('b.name');

  res.json({ buckets: rows });
});

// Bucket detail with items + joined product data (for margin display)
router.get('/:id', async (req, res) => {
  const bucket = await db('pricing_buckets').where({ id: req.params.id }).first();
  if (!bucket) return res.status(404).json({ error: 'not_found' });

  const items = await db('bucket_items as bi')
    .join('products as p', 'p.id', 'bi.product_id')
    .where('bi.bucket_id', req.params.id)
    .select(
      'bi.id',
      'bi.product_id',
      'bi.unit_price',
      'bi.total_price',
      'bi.notes',
      'bi.is_enabled',
      'bi.created_at',
      'p.name as product_name',
      'p.product_type',
      'p.unit_of_measure',
      'p.labb_cost',
      'p.is_active as product_is_active',
    )
    .orderByRaw("COALESCE(p.product_type, 'zzz') ASC, p.name ASC");

  res.json({ bucket, items });
});

router.post('/', requireStaff, async (req, res) => {
  const parsed = bucketSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const { row, seededCount } = await db.transaction(async (trx) => {
    const [bucket] = await trx('pricing_buckets')
      .insert({ ...parsed.data, created_by: req.user.id })
      .returning('*');
    const count = await seedBucketWithAllProducts(bucket.id, { trx });
    return { row: bucket, seededCount: count };
  });

  await audit({
    req,
    action: 'bucket.create',
    entityType: 'pricing_bucket',
    entityId: row.id,
    after: row,
    notes: `seeded ${seededCount} products at MSRP (all disabled by default)`,
  });
  res.status(201).json({ bucket: row, seeded: seededCount });
});

router.patch('/:id', requireStaff, async (req, res) => {
  const parsed = bucketUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const before = await db('pricing_buckets').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });

  const [row] = await db('pricing_buckets')
    .where({ id: req.params.id })
    .update({ ...parsed.data, updated_at: db.fn.now() })
    .returning('*');

  await audit({ req, action: 'bucket.update', entityType: 'pricing_bucket', entityId: row.id, before, after: row });
  res.json({ bucket: row });
});

router.post('/:id/deactivate', requireStaff, async (req, res) => {
  const before = await db('pricing_buckets').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });

  const [row] = await db('pricing_buckets')
    .where({ id: req.params.id })
    .update({ is_active: false, updated_at: db.fn.now() })
    .returning('*');

  await audit({ req, action: 'bucket.deactivate', entityType: 'pricing_bucket', entityId: row.id, before, after: row });
  res.json({ bucket: row });
});

router.post('/:id/activate', requireStaff, async (req, res) => {
  const before = await db('pricing_buckets').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });

  const [row] = await db('pricing_buckets')
    .where({ id: req.params.id })
    .update({ is_active: true, updated_at: db.fn.now() })
    .returning('*');

  await audit({ req, action: 'bucket.activate', entityType: 'pricing_bucket', entityId: row.id, before, after: row });
  res.json({ bucket: row });
});

// Duplicate bucket + all items under a new name
router.post('/:id/copy', requireStaff, async (req, res) => {
  const copySchema = z.object({ name: z.string().min(1).max(200), description: z.string().nullable().optional() });
  const parsed = copySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const source = await db('pricing_buckets').where({ id: req.params.id }).first();
  if (!source) return res.status(404).json({ error: 'not_found' });

  const result = await db.transaction(async (trx) => {
    const [copy] = await trx('pricing_buckets')
      .insert({
        name: parsed.data.name,
        description: parsed.data.description ?? source.description,
        notes: source.notes,
        copied_from_bucket_id: source.id,
        created_by: req.user.id,
      })
      .returning('*');

    const sourceItems = await trx('bucket_items').where({ bucket_id: source.id });
    if (sourceItems.length > 0) {
      await trx('bucket_items').insert(
        sourceItems.map((i) => ({
          bucket_id: copy.id,
          product_id: i.product_id,
          unit_price: i.unit_price,
          total_price: i.total_price,
          notes: i.notes,
          is_enabled: i.is_enabled,
        })),
      );
    }
    return { copy, itemsCopied: sourceItems.length };
  });

  await audit({
    req,
    action: 'bucket.copy',
    entityType: 'pricing_bucket',
    entityId: result.copy.id,
    after: result.copy,
    notes: `copied from ${source.id} (${result.itemsCopied} items)`,
  });
  res.status(201).json({ bucket: result.copy, items_copied: result.itemsCopied });
});

// Items
router.post('/:id/items', requireStaff, async (req, res) => {
  const parsed = itemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const bucket = await db('pricing_buckets').where({ id: req.params.id }).first();
  if (!bucket) return res.status(404).json({ error: 'bucket_not_found' });

  const product = await db('products').where({ id: parsed.data.product_id }).first();
  if (!product) return res.status(400).json({ error: 'product_not_found' });

  const dupe = await db('bucket_items')
    .where({ bucket_id: req.params.id, product_id: parsed.data.product_id })
    .first();
  if (dupe) return res.status(409).json({ error: 'item_already_in_bucket' });

  const [row] = await db('bucket_items')
    .insert({ bucket_id: req.params.id, ...parsed.data })
    .returning('*');

  await audit({
    req,
    action: 'bucket_item.create',
    entityType: 'bucket_item',
    entityId: row.id,
    after: row,
    notes: `bucket=${req.params.id} product=${parsed.data.product_id}`,
  });
  res.status(201).json({ item: row });
});

router.patch('/:id/items/:itemId', requireStaff, async (req, res) => {
  const parsed = itemUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const before = await db('bucket_items').where({ id: req.params.itemId, bucket_id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });

  const [row] = await db('bucket_items')
    .where({ id: req.params.itemId })
    .update({ ...parsed.data, updated_at: db.fn.now() })
    .returning('*');

  await audit({ req, action: 'bucket_item.update', entityType: 'bucket_item', entityId: row.id, before, after: row });
  res.json({ item: row });
});

router.delete('/:id/items/:itemId', requireStaff, async (req, res) => {
  const before = await db('bucket_items').where({ id: req.params.itemId, bucket_id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });

  await db('bucket_items').where({ id: req.params.itemId }).del();
  await audit({ req, action: 'bucket_item.delete', entityType: 'bucket_item', entityId: before.id, before });
  res.json({ ok: true });
});

/**
 * Bulk toggle every item in this bucket on or off at once. Used by
 * the "Enable all / Disable all" buttons on the bucket detail page
 * for the 250-clinic-at-MSRP rollout case.
 */
router.post('/:id/items/set-enabled', requireStaff, async (req, res) => {
  const schema = z.object({ is_enabled: z.boolean() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const bucket = await db('pricing_buckets').where({ id: req.params.id }).first();
  if (!bucket) return res.status(404).json({ error: 'not_found' });

  const updated = await db('bucket_items')
    .where({ bucket_id: req.params.id })
    .update({ is_enabled: parsed.data.is_enabled, updated_at: db.fn.now() });

  await audit({
    req,
    action: 'bucket_item.bulk_set_enabled',
    entityType: 'pricing_bucket',
    entityId: req.params.id,
    notes: `set ${updated} item(s) → ${parsed.data.is_enabled ? 'enabled' : 'disabled'}`,
    after: { is_enabled: parsed.data.is_enabled, count: updated },
  });

  res.json({ updated, is_enabled: parsed.data.is_enabled });
});

/**
 * Bulk import bucket items from a CSV-style payload. Each row identifies a
 * product by product_name (case-insensitive match against active products).
 * Existing items are updated with the new price; new items are inserted.
 * Rows whose product_name doesn't match any product are reported as errors.
 */
router.post('/:id/items/import', requireStaff, async (req, res) => {
  const importItemSchema = z
    .object({
      product_name: z.string().optional(),
      unit_price: z.any().optional(),
      total_price: z.any().optional(),
      notes: z.string().nullable().optional(),
    })
    .passthrough();
  const importSchema = z.object({
    items: z.array(importItemSchema).min(1).max(5000),
    mode: z.enum(['skip_existing', 'update_existing']).optional().default('update_existing'),
  });
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const bucket = await db('pricing_buckets').where({ id: req.params.id }).first();
  if (!bucket) return res.status(404).json({ error: 'bucket_not_found' });

  // Strip currency formatting (`$1,234.50`, whitespace, stray quotes) before parsing.
  const toNum = (v) => {
    if (v == null) return null;
    const s = String(v).trim().replace(/^["']|["']$/g, '').replace(/[$,\s]/g, '');
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  // Rows without a product name can't be matched; rows without a valid
  // unit price can't produce a bucket item. Both buckets get surfaced.
  const prepared = parsed.data.items.map((item) => ({
    product_name: (item.product_name || '').trim(),
    unit_price: toNum(item.unit_price),
    total_price: toNum(item.total_price),
    notes: item.notes || null,
  }));

  const names = prepared.filter((p) => p.product_name).map((p) => p.product_name.toLowerCase());
  const products = names.length === 0
    ? []
    : await db('products').whereRaw('LOWER(name) = ANY(?)', [names]).select('id', 'name');
  const productByLowerName = new Map(products.map((p) => [p.name.toLowerCase(), p]));

  const existing = await db('bucket_items').where({ bucket_id: req.params.id }).select('id', 'product_id');
  const existingByProduct = new Map(existing.map((e) => [e.product_id, e]));

  const created = [];
  const updated = [];
  const skipped = [];
  const unmatched = [];

  await db.transaction(async (trx) => {
    for (const item of prepared) {
      if (!item.product_name) {
        unmatched.push('(empty)');
        continue;
      }
      const product = productByLowerName.get(item.product_name.toLowerCase());
      if (!product) {
        unmatched.push(item.product_name);
        continue;
      }
      if (item.unit_price == null) {
        skipped.push({ product_name: product.name, reason: 'missing_unit_price' });
        continue;
      }
      const existingItem = existingByProduct.get(product.id);
      const payload = {
        unit_price: item.unit_price,
        total_price: item.total_price,
        notes: item.notes,
      };
      if (existingItem) {
        if (parsed.data.mode === 'update_existing') {
          const [row] = await trx('bucket_items')
            .where({ id: existingItem.id })
            .update({ ...payload, updated_at: trx.fn.now() })
            .returning(['id', 'product_id']);
          updated.push(row);
        } else {
          skipped.push({ product_name: product.name });
        }
      } else {
        const [row] = await trx('bucket_items')
          .insert({ bucket_id: req.params.id, product_id: product.id, ...payload })
          .returning(['id', 'product_id']);
        created.push(row);
      }
    }
  });

  await audit({
    req,
    action: 'bucket_item.bulk_import',
    entityType: 'pricing_bucket',
    entityId: req.params.id,
    notes: `created=${created.length} updated=${updated.length} skipped=${skipped.length} unmatched=${unmatched.length}`,
    after: { created: created.length, updated: updated.length, skipped: skipped.length, unmatched },
  });
  res.status(201).json({ created, updated, skipped, unmatched });
});

module.exports = router;
