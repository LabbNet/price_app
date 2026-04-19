const express = require('express');
const { z } = require('zod');
const db = require('../db/knex');
const { requireAuth, requireStaff } = require('../middleware/auth');
const { audit } = require('../services/audit');

const router = express.Router();
router.use(requireAuth);

const mergeFieldSchema = z.object({
  key: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'snake_case'),
  label: z.string(),
  description: z.string().optional(),
});

const templateSchema = z.object({
  name: z.string().min(1).max(200),
  body: z.string().min(1),
  merge_fields: z.array(mergeFieldSchema).optional().default([]),
  is_active: z.boolean().optional(),
});

const updateSchema = templateSchema.partial();

router.get('/', async (req, res) => {
  const includeInactive = req.query.include_inactive === 'true';
  const rows = await db('contract_templates')
    .modify((q) => { if (!includeInactive) q.where('is_active', true); })
    .orderBy('name');
  res.json({ templates: rows });
});

router.get('/:id', async (req, res) => {
  const row = await db('contract_templates').where({ id: req.params.id }).first();
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({ template: row });
});

router.post('/', requireStaff, async (req, res) => {
  const parsed = templateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const [row] = await db('contract_templates')
    .insert({
      name: parsed.data.name,
      body: parsed.data.body,
      merge_fields: JSON.stringify(parsed.data.merge_fields || []),
      version: 1,
      created_by: req.user.id,
    })
    .returning('*');

  await audit({ req, action: 'contract_template.create', entityType: 'contract_template', entityId: row.id, after: row });
  res.status(201).json({ template: row });
});

router.patch('/:id', requireStaff, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const before = await db('contract_templates').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });

  const patch = { updated_at: db.fn.now() };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.is_active !== undefined) patch.is_active = parsed.data.is_active;
  // Bump version when body or merge_fields change
  const bodyChanged = parsed.data.body !== undefined && parsed.data.body !== before.body;
  const fieldsChanged = parsed.data.merge_fields !== undefined;
  if (bodyChanged) patch.body = parsed.data.body;
  if (fieldsChanged) patch.merge_fields = JSON.stringify(parsed.data.merge_fields);
  if (bodyChanged || fieldsChanged) patch.version = before.version + 1;

  const [row] = await db('contract_templates').where({ id: req.params.id }).update(patch).returning('*');
  await audit({ req, action: 'contract_template.update', entityType: 'contract_template', entityId: row.id, before, after: row });
  res.json({ template: row });
});

router.post('/:id/activate', requireStaff, async (req, res) => {
  const before = await db('contract_templates').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });
  const [row] = await db('contract_templates').where({ id: req.params.id }).update({ is_active: true, updated_at: db.fn.now() }).returning('*');
  await audit({ req, action: 'contract_template.activate', entityType: 'contract_template', entityId: row.id, before, after: row });
  res.json({ template: row });
});

router.post('/:id/deactivate', requireStaff, async (req, res) => {
  const before = await db('contract_templates').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });
  const [row] = await db('contract_templates').where({ id: req.params.id }).update({ is_active: false, updated_at: db.fn.now() }).returning('*');
  await audit({ req, action: 'contract_template.deactivate', entityType: 'contract_template', entityId: row.id, before, after: row });
  res.json({ template: row });
});

module.exports = router;
