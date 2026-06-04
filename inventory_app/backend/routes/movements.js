const express = require('express');
const db = require('../db/knex');

const router = express.Router();

/**
 * GET /api/movements — the movement log, newest first.
 * Optional filters: ?item_id= , ?limit= (default 100, max 500)
 */
router.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);

  const fromW = db.ref('from_w.code');
  const toW = db.ref('to_w.code');

  const q = db('stock_movements as m')
    .join('items', 'items.id', 'm.item_id')
    .leftJoin('warehouses as from_w', 'from_w.id', 'm.from_warehouse_id')
    .leftJoin('warehouses as to_w', 'to_w.id', 'm.to_warehouse_id')
    .select(
      'm.id',
      'm.kind',
      'm.quantity',
      'm.note',
      'm.created_at',
      'items.sku',
      'items.name as item_name',
      'm.from_warehouse_id',
      'm.to_warehouse_id',
      { from_code: fromW },
      { to_code: toW },
    )
    .orderBy('m.created_at', 'desc')
    .orderBy('m.id', 'desc')
    .limit(limit);

  if (req.query.item_id) q.where('m.item_id', req.query.item_id);

  res.json({ movements: await q });
});

module.exports = router;
