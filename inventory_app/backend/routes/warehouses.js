const express = require('express');
const { z } = require('zod');
const db = require('../db/knex');

const router = express.Router();

const warehouseSchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(200),
  address: z.string().max(500).nullable().optional(),
  is_active: z.boolean().optional(),
});
const warehouseUpdateSchema = warehouseSchema.partial();

router.get('/', async (req, res) => {
  const includeInactive = req.query.include_inactive === 'true';
  const q = db('warehouses').orderBy('name', 'asc');
  if (!includeInactive) q.where({ is_active: true });
  res.json({ warehouses: await q });
});

router.get('/:id', async (req, res) => {
  const row = await db('warehouses').where({ id: req.params.id }).first();
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({ warehouse: row });
});

router.post('/', async (req, res) => {
  const parsed = warehouseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  const [row] = await db('warehouses').insert(parsed.data).returning('*');
  res.status(201).json({ warehouse: row });
});

router.patch('/:id', async (req, res) => {
  const parsed = warehouseUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  const exists = await db('warehouses').where({ id: req.params.id }).first();
  if (!exists) return res.status(404).json({ error: 'not_found' });
  const [row] = await db('warehouses')
    .where({ id: req.params.id })
    .update({ ...parsed.data, updated_at: db.fn.now() })
    .returning('*');
  res.json({ warehouse: row });
});

module.exports = router;
