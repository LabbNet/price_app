const express = require('express');
const { z } = require('zod');
const db = require('../db/knex');

const router = express.Router();

const itemSchema = z.object({
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  unit: z.string().max(50).optional(),
  reorder_point: z.coerce.number().int().min(0).optional(),
  notes: z.string().max(1000).nullable().optional(),
  is_active: z.boolean().optional(),
});
const itemUpdateSchema = itemSchema.partial();

router.get('/', async (req, res) => {
  const includeInactive = req.query.include_inactive === 'true';
  const q = db('items').orderBy('name', 'asc');
  if (!includeInactive) q.where({ is_active: true });
  const items = await q;

  // Attach total quantity across all warehouses for each item.
  const totals = await db('stock_levels')
    .select('item_id')
    .sum({ total: 'quantity' })
    .groupBy('item_id');
  const totalByItem = new Map(totals.map((t) => [t.item_id, Number(t.total) || 0]));
  for (const it of items) it.total_quantity = totalByItem.get(it.id) || 0;

  res.json({ items });
});

router.get('/:id', async (req, res) => {
  const item = await db('items').where({ id: req.params.id }).first();
  if (!item) return res.status(404).json({ error: 'not_found' });

  const levels = await db('stock_levels')
    .join('warehouses', 'warehouses.id', 'stock_levels.warehouse_id')
    .where('stock_levels.item_id', item.id)
    .select('stock_levels.warehouse_id', 'warehouses.code', 'warehouses.name', 'stock_levels.quantity')
    .orderBy('warehouses.name', 'asc');

  item.total_quantity = levels.reduce((s, l) => s + l.quantity, 0);
  res.json({ item, levels });
});

router.post('/', async (req, res) => {
  const parsed = itemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  const [row] = await db('items').insert(parsed.data).returning('*');
  res.status(201).json({ item: row });
});

router.patch('/:id', async (req, res) => {
  const parsed = itemUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  const exists = await db('items').where({ id: req.params.id }).first();
  if (!exists) return res.status(404).json({ error: 'not_found' });
  const [row] = await db('items')
    .where({ id: req.params.id })
    .update({ ...parsed.data, updated_at: db.fn.now() })
    .returning('*');
  res.json({ item: row });
});

module.exports = router;
