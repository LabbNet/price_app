const express = require('express');
const { z } = require('zod');
const db = require('../db/knex');
const { requireAuth, requireStaff } = require('../middleware/auth');
const { audit } = require('../services/audit');

const router = express.Router();
router.use(requireAuth);

const clinicSchema = z.object({
  client_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  legal_name: z.string().nullable().optional(),
  ein: z.string().nullable().optional(),
  contact_name: z.string().nullable().optional(),
  contact_email: z.string().email().nullable().optional().or(z.literal('').transform(() => null)),
  contact_phone: z.string().nullable().optional(),
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

function currentAssignmentSubquery() {
  return db('clinic_bucket_assignments as cba')
    .join('pricing_buckets as pb', 'pb.id', 'cba.bucket_id')
    .whereNull('cba.unassigned_at')
    .select(
      'cba.clinic_id',
      'cba.bucket_id',
      'pb.name as bucket_name',
      'cba.assigned_at',
    );
}

// Paginated list with search + filters — scales to many thousands of clinics.
router.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const search = (req.query.search || '').trim();
  const clientId = req.query.client_id;
  const bucketId = req.query.bucket_id;
  const unassigned = req.query.unassigned === 'true';
  const includeInactive = req.query.include_inactive === 'true';

  const build = (base) => {
    base
      .leftJoin(currentAssignmentSubquery().as('cur'), 'cur.clinic_id', 'c.id')
      .modify((q) => { if (!includeInactive) q.where('c.is_active', true); })
      .modify((q) => { if (clientId) q.where('c.client_id', clientId); })
      .modify((q) => { if (bucketId) q.where('cur.bucket_id', bucketId); })
      .modify((q) => { if (unassigned) q.whereNull('cur.bucket_id'); })
      .modify((q) => {
        if (search) {
          const pat = `%${search.toLowerCase()}%`;
          q.where((w) => w
            .whereRaw('LOWER(c.name) LIKE ?', pat)
            .orWhereRaw('LOWER(COALESCE(c.city, \'\')) LIKE ?', pat)
            .orWhereRaw('LOWER(COALESCE(c.state, \'\')) LIKE ?', pat)
            .orWhereRaw('LOWER(COALESCE(c.contact_email, \'\')) LIKE ?', pat));
        }
      });
    return base;
  };

  const countRowPromise = build(db('clinics as c')).count({ n: 'c.id' }).first();
  const rowsPromise = build(db('clinics as c'))
    .join('clients as cl', 'cl.id', 'c.client_id')
    .select(
      'c.id',
      'c.name',
      'c.city',
      'c.state',
      'c.contact_name',
      'c.contact_email',
      'c.is_active',
      'c.client_id',
      'cl.name as client_name',
      'cur.bucket_id',
      'cur.bucket_name',
      'cur.assigned_at',
    )
    .orderBy('cl.name')
    .orderBy('c.name')
    .limit(limit)
    .offset(offset);

  const [countRow, rows] = await Promise.all([countRowPromise, rowsPromise]);
  res.json({ clinics: rows, total: Number(countRow.n), limit, offset });
});

router.get('/:id', async (req, res) => {
  const clinic = await db('clinics as c')
    .join('clients as cl', 'cl.id', 'c.client_id')
    .where('c.id', req.params.id)
    .select('c.*', 'cl.name as client_name')
    .first();
  if (!clinic) return res.status(404).json({ error: 'not_found' });

  const history = await db('clinic_bucket_assignments as cba')
    .join('pricing_buckets as pb', 'pb.id', 'cba.bucket_id')
    .leftJoin('users as u', 'u.id', 'cba.assigned_by')
    .where('cba.clinic_id', req.params.id)
    .select(
      'cba.id',
      'cba.bucket_id',
      'pb.name as bucket_name',
      'cba.assigned_at',
      'cba.unassigned_at',
      'cba.notes',
      'u.email as assigned_by_email',
    )
    .orderBy('cba.assigned_at', 'desc');

  const current = history.find((h) => !h.unassigned_at) || null;

  res.json({ clinic, current_assignment: current, assignment_history: history });
});

router.post('/', requireStaff, async (req, res) => {
  const parsed = clinicSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const client = await db('clients').where({ id: parsed.data.client_id }).first();
  if (!client) return res.status(400).json({ error: 'client_not_found' });

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

// Assign a bucket to this clinic (closes prior open assignment)
router.post('/:id/assign-bucket', requireStaff, async (req, res) => {
  const schema = z.object({ bucket_id: z.string().uuid(), notes: z.string().nullable().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const clinic = await db('clinics').where({ id: req.params.id }).first();
  if (!clinic) return res.status(404).json({ error: 'clinic_not_found' });

  const bucket = await db('pricing_buckets').where({ id: parsed.data.bucket_id }).first();
  if (!bucket) return res.status(400).json({ error: 'bucket_not_found' });

  const result = await db.transaction(async (trx) => {
    await trx('clinic_bucket_assignments')
      .where({ clinic_id: clinic.id })
      .whereNull('unassigned_at')
      .update({ unassigned_at: trx.fn.now() });

    const [row] = await trx('clinic_bucket_assignments')
      .insert({
        clinic_id: clinic.id,
        bucket_id: bucket.id,
        assigned_by: req.user.id,
        notes: parsed.data.notes || null,
      })
      .returning('*');
    return row;
  });

  await audit({
    req,
    action: 'clinic.assign_bucket',
    entityType: 'clinic',
    entityId: clinic.id,
    after: { bucket_id: bucket.id, assignment_id: result.id },
  });
  res.json({ assignment: result });
});

router.post('/:id/unassign-bucket', requireStaff, async (req, res) => {
  const clinic = await db('clinics').where({ id: req.params.id }).first();
  if (!clinic) return res.status(404).json({ error: 'not_found' });

  const n = await db('clinic_bucket_assignments')
    .where({ clinic_id: clinic.id })
    .whereNull('unassigned_at')
    .update({ unassigned_at: db.fn.now() });

  await audit({ req, action: 'clinic.unassign_bucket', entityType: 'clinic', entityId: clinic.id, notes: `closed ${n} open assignment(s)` });
  res.json({ unassigned: n });
});

// Bulk import — accepts an array of clinic rows. All-or-nothing transaction.
router.post('/import', requireStaff, async (req, res) => {
  const importSchema = z.object({
    client_id: z.string().uuid(),
    clinics: z.array(clinicSchema.omit({ client_id: true })).min(1).max(5000),
  });
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const client = await db('clients').where({ id: parsed.data.client_id }).first();
  if (!client) return res.status(400).json({ error: 'client_not_found' });

  const rows = parsed.data.clinics.map((c) => ({ ...c, client_id: client.id }));
  const inserted = await db.transaction(async (trx) => {
    return trx('clinics').insert(rows).returning(['id', 'name']);
  });

  await audit({
    req,
    action: 'clinic.bulk_import',
    entityType: 'client',
    entityId: client.id,
    notes: `imported ${inserted.length} clinics`,
    after: { count: inserted.length },
  });
  res.status(201).json({ imported: inserted.length, clinics: inserted });
});

module.exports = router;
