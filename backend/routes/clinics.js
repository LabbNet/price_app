const express = require('express');
const { z } = require('zod');
const db = require('../db/knex');
const { requireAuth, requireStaff } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { findDuplicates, processNewOrUpdated } = require('../services/dedup');

// Non-fatal wrapper: if dedup blows up for any reason (missing migration,
// query error, whatever), log it and return an empty result so the
// create/update/import operation still succeeds.
async function safeDedup(clinicId, ctx) {
  try {
    return await processNewOrUpdated(clinicId, ctx);
  } catch (err) {
    console.error('[dedup] non-fatal failure on clinic', clinicId, err.message, err.stack);
    return { deleted: [], queued: [], error: err.message };
  }
}

async function safeFindDuplicates(args) {
  try {
    return await findDuplicates(args);
  } catch (err) {
    console.error('[dedup] check-duplicate failed', err.message);
    return [];
  }
}

const router = express.Router();
router.use(requireAuth);

const clinicSchema = z.object({
  name: z.string().min(1).max(200),
  legal_name: z.string().nullable().optional(),
  ein: z.string().nullable().optional(),
  account_type: z.enum(['pro', 'standard']).optional(),
  category: z.string().nullable().optional(),
  subcategory: z.string().nullable().optional(),
  sales_rep_id: z.string().uuid({ message: 'sales rep is required' }),
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

// Updates are partial — but sales_rep_id must not be cleared to null.
const clinicUpdateSchema = clinicSchema.partial().refine(
  (data) => !('sales_rep_id' in data) || !!data.sales_rep_id,
  { message: 'sales rep cannot be cleared', path: ['sales_rep_id'] },
);

router.get('/', async (req, res) => {
  const includeInactive = req.query.include_inactive === 'true';
  const accountType = req.query.account_type;
  const rows = await db('clinics as c')
    .leftJoin('clients as cl', (j) => j.on('cl.clinic_id', 'c.id'))
    .leftJoin('users as sr', 'sr.id', 'c.sales_rep_id')
    .select(
      'c.id',
      'c.name',
      'c.legal_name',
      'c.account_type',
      'c.category',
      'c.subcategory',
      'c.primary_contact_name',
      'c.primary_contact_email',
      'c.is_active',
      'c.created_at',
      'c.sales_rep_id',
      'sr.email as sales_rep_email',
      'sr.first_name as sales_rep_first_name',
      'sr.last_name as sales_rep_last_name',
      db.raw('COUNT(DISTINCT cl.id) FILTER (WHERE cl.is_active)::int as active_client_count'),
      db.raw('COUNT(DISTINCT cl.id)::int as total_client_count'),
    )
    .modify((q) => { if (!includeInactive) q.where('c.is_active', true); })
    .modify((q) => { if (accountType) q.where('c.account_type', accountType); })
    .groupBy('c.id', 'sr.id')
    .orderBy('c.name');
  res.json({ clinics: rows });
});

// Pre-submit duplicate check — the UI calls this before showing the warning
// modal so staff can decide whether to proceed. Not persisted.
//
// IMPORTANT: must be registered BEFORE GET /:id, otherwise Express matches
// "/check-duplicate" against the :id pattern and tries to query that as a
// UUID — which Postgres rejects, taking down the whole route handler.
router.get('/check-duplicate', requireStaff, async (req, res) => {
  const matches = await safeFindDuplicates({
    address_line1: req.query.address_line1,
    city: req.query.city,
    state: req.query.state,
    postal_code: req.query.postal_code,
    excludeId: req.query.exclude_id || null,
  });
  res.json({
    matches: matches.map((m) => ({
      id: m.clinic.id,
      name: m.clinic.name,
      address_line1: m.clinic.address_line1,
      city: m.clinic.city,
      state: m.clinic.state,
      postal_code: m.clinic.postal_code,
      created_at: m.clinic.created_at,
      match_score: m.score,
    })),
  });
});

router.get('/:id', async (req, res) => {
  const clinic = await db('clinics as c')
    .leftJoin('users as sr', 'sr.id', 'c.sales_rep_id')
    .where('c.id', req.params.id)
    .select(
      'c.*',
      'sr.email as sales_rep_email',
      'sr.first_name as sales_rep_first_name',
      'sr.last_name as sales_rep_last_name',
    )
    .first();
  if (!clinic) return res.status(404).json({ error: 'not_found' });
  res.json({ clinic });
});

router.post('/', requireStaff, async (req, res) => {
  const parsed = clinicSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const result = await db.transaction(async (trx) => {
    const [row] = await trx('clinics').insert(parsed.data).returning('*');
    const dedup = await safeDedup(row.id, { trx, actorId: req.user.id });
    return { row, dedup };
  });

  // If the dedup auto-delete removed the just-inserted row, surface that.
  const wasDeleted = result.dedup.deleted.includes(result.row.id);
  await audit({
    req,
    action: wasDeleted ? 'clinic.create_duplicate_auto_deleted' : 'clinic.create',
    entityType: 'clinic',
    entityId: result.row.id,
    after: result.row,
    notes: wasDeleted ? 'Exact duplicate — auto-deleted' : null,
  });

  res.status(201).json({
    clinic: result.row,
    auto_deleted: wasDeleted,
    queued_for_review: result.dedup.queued,
  });
});

router.patch('/:id', requireStaff, async (req, res) => {
  const parsed = clinicUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  const before = await db('clinics').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });

  const result = await db.transaction(async (trx) => {
    const [row] = await trx('clinics').where({ id: req.params.id }).update({ ...parsed.data, updated_at: trx.fn.now() }).returning('*');
    const addressChanged = ['address_line1', 'city', 'state', 'postal_code']
      .some((f) => parsed.data[f] !== undefined && parsed.data[f] !== before[f]);
    const dedup = addressChanged
      ? await safeDedup(row.id, { trx, actorId: req.user.id })
      : { deleted: [], queued: [] };
    return { row, dedup };
  });

  await audit({ req, action: 'clinic.update', entityType: 'clinic', entityId: result.row.id, before, after: result.row });
  res.json({
    clinic: result.row,
    auto_deleted: result.dedup.deleted.includes(result.row.id),
    queued_for_review: result.dedup.queued,
  });
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
    sales_rep_id: z.string().uuid({ message: 'sales rep is required' }),
    clinics: z.array(importRowSchema).min(1).max(5000),
  });
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const normalize = (v) => (v === '' || v == null ? null : v);
  const rows = parsed.data.clinics.map((r) => ({
    name: (r.name && r.name.trim()) || '(unnamed)',
    legal_name: normalize(r.legal_name),
    ein: normalize(r.ein),
    sales_rep_id: parsed.data.sales_rep_id,
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

  const { inserted, deleted, queued } = await db.transaction(async (trx) => {
    const ins = await trx('clinics').insert(rows).returning(['id', 'name']);
    const del = [];
    const que = [];
    for (const r of ins) {
      const result = await safeDedup(r.id, { trx, actorId: req.user.id });
      if (result.deleted.length) del.push(...result.deleted);
      if (result.queued.length) que.push(...result.queued);
    }
    return { inserted: ins, deleted: del, queued: que };
  });

  await audit({
    req,
    action: 'clinic.bulk_import',
    entityType: 'clinic',
    notes: `imported ${inserted.length - deleted.length} (auto-deleted ${deleted.length} duplicates; ${queued.length} queued for review)`,
    after: { count: inserted.length, auto_deleted: deleted.length, queued: queued.length },
  });
  res.status(201).json({
    imported: inserted.length - deleted.length,
    auto_deleted: deleted.length,
    queued_for_review: queued.length,
    clinics: inserted.filter((c) => !deleted.includes(c.id)),
  });
});

module.exports = router;
