const express = require('express');
const { z } = require('zod');
const db = require('../db/knex');
const { requireAuth, requireStaff } = require('../middleware/auth');
const { audit } = require('../services/audit');

const router = express.Router();
router.use(requireAuth);

const clinicSchema = z.object({
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

const clinicUpdateSchema = clinicSchema.partial();

router.get('/', async (req, res) => {
  const includeInactive = req.query.include_inactive === 'true';
  const rows = await db('clinics as c')
    .leftJoin('clients as cl', (j) => j.on('cl.clinic_id', 'c.id'))
    .select(
      'c.id',
      'c.name',
      'c.legal_name',
      'c.primary_contact_name',
      'c.primary_contact_email',
      'c.is_active',
      'c.created_at',
      db.raw('COUNT(DISTINCT cl.id) FILTER (WHERE cl.is_active)::int as active_client_count'),
      db.raw('COUNT(DISTINCT cl.id)::int as total_client_count'),
    )
    .modify((q) => { if (!includeInactive) q.where('c.is_active', true); })
    .groupBy('c.id')
    .orderBy('c.name');
  res.json({ clinics: rows });
});

router.get('/:id', async (req, res) => {
  const clinic = await db('clinics').where({ id: req.params.id }).first();
  if (!clinic) return res.status(404).json({ error: 'not_found' });
  res.json({ clinic });
});

router.post('/', requireStaff, async (req, res) => {
  const parsed = clinicSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  const [row] = await db('clinics').insert(parsed.data).returning('*');
  await audit({ req, action: 'clinic.create', entityType: 'clinic', entityId: row.id, after: row });
  res.status(201).json({ clinic: row });
});

router.patch('/:id', requireStaff, async (req, res) => {
  const parsed = clinicUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  const before = await db('clinics').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });
  const [row] = await db('clinics').where({ id: req.params.id }).update({ ...parsed.data, updated_at: db.fn.now() }).returning('*');
  await audit({ req, action: 'clinic.update', entityType: 'clinic', entityId: row.id, before, after: row });
  res.json({ clinic: row });
});

router.post('/:id/deactivate', requireStaff, async (req, res) => {
  const before = await db('clinics').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });
  const [row] = await db('clinics').where({ id: req.params.id }).update({ is_active: false, updated_at: db.fn.now() }).returning('*');
  await audit({ req, action: 'clinic.deactivate', entityType: 'clinic', entityId: row.id, before, after: row });
  res.json({ clinic: row });
});

router.post('/:id/activate', requireStaff, async (req, res) => {
  const before = await db('clinics').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });
  const [row] = await db('clinics').where({ id: req.params.id }).update({ is_active: true, updated_at: db.fn.now() }).returning('*');
  await audit({ req, action: 'clinic.activate', entityType: 'clinic', entityId: row.id, before, after: row });
  res.json({ clinic: row });
});

// Bulk-assign a bucket to every active client under this clinic
router.post('/:id/assign-bucket-to-all', requireStaff, async (req, res) => {
  const schema = z.object({ bucket_id: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const clinic = await db('clinics').where({ id: req.params.id }).first();
  if (!clinic) return res.status(404).json({ error: 'clinic_not_found' });

  const bucket = await db('pricing_buckets').where({ id: parsed.data.bucket_id }).first();
  if (!bucket) return res.status(400).json({ error: 'bucket_not_found' });

  const result = await db.transaction(async (trx) => {
    const clients = await trx('clients').where({ clinic_id: clinic.id, is_active: true }).select('id');
    if (clients.length === 0) return { updated: 0, skipped: 0 };

    const clientIds = clients.map((c) => c.id);
    // Close any open assignments
    await trx('client_bucket_assignments')
      .whereIn('client_id', clientIds)
      .whereNull('unassigned_at')
      .update({ unassigned_at: trx.fn.now() });

    await trx('client_bucket_assignments').insert(
      clientIds.map((cid) => ({
        client_id: cid,
        bucket_id: bucket.id,
        assigned_by: req.user.id,
      })),
    );

    return { updated: clientIds.length, skipped: 0 };
  });

  await audit({
    req,
    action: 'clinic.bulk_assign_bucket',
    entityType: 'clinic',
    entityId: clinic.id,
    notes: `bucket=${bucket.id} clients=${result.updated}`,
    after: { bucket_id: bucket.id, clients_updated: result.updated },
  });
  res.json(result);
});

// Bulk import — permissive. All fields optional; empty strings become null.
// Missing/blank name defaults to "(unnamed)" so the row can still land.
router.post('/import', requireStaff, async (req, res) => {
  const importRowSchema = z
    .object({
      name: z.string().optional(),
      legal_name: z.string().nullable().optional(),
      ein: z.string().nullable().optional(),
      primary_contact_name: z.string().nullable().optional(),
      primary_contact_email: z.string().nullable().optional(),
      primary_contact_phone: z.string().nullable().optional(),
      address_line1: z.string().nullable().optional(),
      address_line2: z.string().nullable().optional(),
      city: z.string().nullable().optional(),
      state: z.string().nullable().optional(),
      postal_code: z.string().nullable().optional(),
      country: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    })
    .passthrough();

  const importSchema = z.object({
    clinics: z.array(importRowSchema).min(1).max(5000),
  });
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const normalize = (v) => (v === '' || v == null ? null : v);
  const rows = parsed.data.clinics.map((r) => ({
    name: (r.name && r.name.trim()) || '(unnamed)',
    legal_name: normalize(r.legal_name),
    ein: normalize(r.ein),
    primary_contact_name: normalize(r.primary_contact_name),
    primary_contact_email: normalize(r.primary_contact_email),
    primary_contact_phone: normalize(r.primary_contact_phone),
    address_line1: normalize(r.address_line1),
    address_line2: normalize(r.address_line2),
    city: normalize(r.city),
    state: normalize(r.state),
    postal_code: normalize(r.postal_code),
    country: normalize(r.country),
    notes: normalize(r.notes),
  }));

  const inserted = await db.transaction(async (trx) => {
    return trx('clinics').insert(rows).returning(['id', 'name']);
  });

  await audit({
    req,
    action: 'clinic.bulk_import',
    entityType: 'clinic',
    notes: `imported ${inserted.length} clinics`,
    after: { count: inserted.length },
  });
  res.status(201).json({ imported: inserted.length, clinics: inserted });
});

module.exports = router;
