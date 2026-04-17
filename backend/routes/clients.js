const express = require('express');
const { z } = require('zod');
const db = require('../db/knex');
const { requireAuth, requireStaff } = require('../middleware/auth');
const { audit } = require('../services/audit');

const router = express.Router();
router.use(requireAuth);

const clientSchema = z.object({
  name: z.string().min(1).max(200),
  legal_name: z.string().nullable().optional(),
  ein: z.string().nullable().optional(),
  primary_contact_name: z.string().nullable().optional(),
  primary_contact_email: z.string().email().nullable().optional().or(z.literal('').transform(() => null)),
  primary_contact_phone: z.string().nullable().optional(),
  address_line1: z.string().nullable().optional(),
  address_line2: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

const clientUpdateSchema = clientSchema.partial();

router.get('/', async (req, res) => {
  const includeInactive = req.query.include_inactive === 'true';
  const rows = await db('clients as c')
    .leftJoin('clinics as cl', (j) => j.on('cl.client_id', 'c.id'))
    .select(
      'c.id',
      'c.name',
      'c.legal_name',
      'c.primary_contact_name',
      'c.primary_contact_email',
      'c.is_active',
      'c.created_at',
      db.raw('COUNT(DISTINCT cl.id) FILTER (WHERE cl.is_active)::int as active_clinic_count'),
      db.raw('COUNT(DISTINCT cl.id)::int as total_clinic_count'),
    )
    .modify((q) => { if (!includeInactive) q.where('c.is_active', true); })
    .groupBy('c.id')
    .orderBy('c.name');
  res.json({ clients: rows });
});

router.get('/:id', async (req, res) => {
  const client = await db('clients').where({ id: req.params.id }).first();
  if (!client) return res.status(404).json({ error: 'not_found' });
  res.json({ client });
});

router.post('/', requireStaff, async (req, res) => {
  const parsed = clientSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  const [row] = await db('clients').insert(parsed.data).returning('*');
  await audit({ req, action: 'client.create', entityType: 'client', entityId: row.id, after: row });
  res.status(201).json({ client: row });
});

router.patch('/:id', requireStaff, async (req, res) => {
  const parsed = clientUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  const before = await db('clients').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });
  const [row] = await db('clients').where({ id: req.params.id }).update({ ...parsed.data, updated_at: db.fn.now() }).returning('*');
  await audit({ req, action: 'client.update', entityType: 'client', entityId: row.id, before, after: row });
  res.json({ client: row });
});

router.post('/:id/deactivate', requireStaff, async (req, res) => {
  const before = await db('clients').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });
  const [row] = await db('clients').where({ id: req.params.id }).update({ is_active: false, updated_at: db.fn.now() }).returning('*');
  await audit({ req, action: 'client.deactivate', entityType: 'client', entityId: row.id, before, after: row });
  res.json({ client: row });
});

router.post('/:id/activate', requireStaff, async (req, res) => {
  const before = await db('clients').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });
  const [row] = await db('clients').where({ id: req.params.id }).update({ is_active: true, updated_at: db.fn.now() }).returning('*');
  await audit({ req, action: 'client.activate', entityType: 'client', entityId: row.id, before, after: row });
  res.json({ client: row });
});

// Bulk-assign a bucket to every active clinic under this client
router.post('/:id/assign-bucket-to-all', requireStaff, async (req, res) => {
  const schema = z.object({ bucket_id: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const client = await db('clients').where({ id: req.params.id }).first();
  if (!client) return res.status(404).json({ error: 'client_not_found' });

  const bucket = await db('pricing_buckets').where({ id: parsed.data.bucket_id }).first();
  if (!bucket) return res.status(400).json({ error: 'bucket_not_found' });

  const result = await db.transaction(async (trx) => {
    const clinics = await trx('clinics').where({ client_id: client.id, is_active: true }).select('id');
    if (clinics.length === 0) return { updated: 0, skipped: 0 };

    const clinicIds = clinics.map((c) => c.id);
    // Close any open assignments
    await trx('clinic_bucket_assignments')
      .whereIn('clinic_id', clinicIds)
      .whereNull('unassigned_at')
      .update({ unassigned_at: trx.fn.now() });

    await trx('clinic_bucket_assignments').insert(
      clinicIds.map((cid) => ({
        clinic_id: cid,
        bucket_id: bucket.id,
        assigned_by: req.user.id,
      })),
    );

    return { updated: clinicIds.length, skipped: 0 };
  });

  await audit({
    req,
    action: 'client.bulk_assign_bucket',
    entityType: 'client',
    entityId: client.id,
    notes: `bucket=${bucket.id} clinics=${result.updated}`,
    after: { bucket_id: bucket.id, clinics_updated: result.updated },
  });
  res.json(result);
});

module.exports = router;
