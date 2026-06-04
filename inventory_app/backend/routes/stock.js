const express = require('express');
const { z } = require('zod');
const db = require('../db/knex');
const { applyMovement } = require('../services/inventory');

const router = express.Router();

/**
 * GET /api/stock — full stock matrix (one row per item/warehouse with stock),
 * plus a flag for items at/below their reorder point.
 * Optional filters: ?warehouse_id= , ?low_only=true
 */
router.get('/', async (req, res) => {
  const q = db('stock_levels')
    .join('items', 'items.id', 'stock_levels.item_id')
    .join('warehouses', 'warehouses.id', 'stock_levels.warehouse_id')
    .select(
      'stock_levels.id',
      'items.id as item_id',
      'items.sku',
      'items.name as item_name',
      'items.unit',
      'items.reorder_point',
      'warehouses.id as warehouse_id',
      'warehouses.code as warehouse_code',
      'warehouses.name as warehouse_name',
      'stock_levels.quantity',
    )
    .orderBy(['items.name', 'warehouses.name']);

  if (req.query.warehouse_id) q.where('stock_levels.warehouse_id', req.query.warehouse_id);

  let rows = await q;
  rows = rows.map((r) => ({ ...r, low: r.quantity <= r.reorder_point }));
  if (req.query.low_only === 'true') rows = rows.filter((r) => r.low);

  res.json({ stock: rows });
});

const moveSchema = z.object({
  item_id: z.coerce.number().int().positive(),
  kind: z.enum(['receive', 'ship', 'adjust', 'transfer']),
  from_warehouse_id: z.coerce.number().int().positive().nullable().optional(),
  to_warehouse_id: z.coerce.number().int().positive().nullable().optional(),
  quantity: z.coerce.number().int(),
  note: z.string().max(500).nullable().optional(),
});

/** POST /api/stock/move — record any movement (receive/ship/adjust/transfer). */
router.post('/move', async (req, res) => {
  const parsed = moveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  const movement = await applyMovement(db, parsed.data);
  res.status(201).json({ movement });
});

module.exports = router;
