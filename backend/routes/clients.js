const express = require('express');
const { z } = require('zod');
const db = require('../db/knex');
const { requireAuth, requireStaff } = require('../middleware/auth');
const { audit } = require('../services/audit');

const router = express.Router();
router.use(requireAuth);

const clientSchema = z.object({
  clinic_id: z.string().uuid(),
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

const clientUpdateSchema = clientSchema.partial();

function currentAssignmentSubquery() {
  return db('client_bucket_assignments as cba')
    .join('pricing_buckets as pb', 'pb.id', 'cba.bucket_id')
    .whereNull('cba.unassigned_at')
    .select(
      'cba.client_id',
      'cba.bucket_id',
      'pb.name as bucket_name',
      'cba.assigned_at',
    );
}

// Paginated list with search + filters — scales to many thousands of clients.
router.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const search = (req.query.search || '').trim();
  const clinicId = req.query.clinic_id;
  const bucketId = req.query.bucket_id;
  const unassigned = req.query.unassigned === 'true';
  const includeInactive = req.query.include_inactive === 'true';

  const build = (base) => {
    base
      .leftJoin(currentAssignmentSubquery().as('cur'), 'cur.client_id', 'c.id')
      .modify((q) => { if (!includeInactive) q.where('c.is_active', true); })
      .modify((q) => { if (clinicId) q.where('c.clinic_id', clinicId); })
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

  const countRowPromise = build(db('clients as c')).count({ n: 'c.id' }).first();
  const rowsPromise = build(db('clients as c'))
    .join('clinics as cl', 'cl.id', 'c.clinic_id')
    .select(
      'c.id',
      'c.name',
      'c.city',
      'c.state',
      'c.contact_name',
      'c.contact_email',
      'c.is_active',
      'c.clinic_id',
      'cl.name as clinic_name',
      'cur.bucket_id',
      'cur.bucket_name',
      'cur.assigned_at',
    )
    .orderBy('cl.name')
    .orderBy('c.name')
    .limit(limit)
    .offset(offset);

  const [countRow, rows] = await Promise.all([countRowPromise, rowsPromise]);
  res.json({ clients: rows, total: Number(countRow.n), limit, offset });
});

router.get('/:id', async (req, res) => {
  const client = await db('clients as c')
    .join('clinics as cl', 'cl.id', 'c.clinic_id')
    .where('c.id', req.params.id)
    .select('c.*', 'cl.name as clinic_name')
    .first();
  if (!client) return res.status(404).json({ error: 'not_found' });

  const history = await db('client_bucket_assignments as cba')
    .join('pricing_buckets as pb', 'pb.id', 'cba.bucket_id')
    .leftJoin('users as u', 'u.id', 'cba.assigned_by')
    .where('cba.client_id', req.params.id)
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

  res.json({ client, current_assignment: current, assignment_history: history });
});

router.post('/', requireStaff, async (req, res) => {
  const parsed = clientSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const clinic = await db('clinics').where({ id: parsed.data.clinic_id }).first();
  if (!clinic) return res.status(400).json({ error: 'clinic_not_found' });

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

// Assign a bucket to this client (closes prior open assignment)
router.post('/:id/assign-bucket', requireStaff, async (req, res) => {
  const schema = z.object({ bucket_id: z.string().uuid(), notes: z.string().nullable().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const client = await db('clients').where({ id: req.params.id }).first();
  if (!client) return res.status(404).json({ error: 'client_not_found' });

  const bucket = await db('pricing_buckets').where({ id: parsed.data.bucket_id }).first();
  if (!bucket) return res.status(400).json({ error: 'bucket_not_found' });

  const result = await db.transaction(async (trx) => {
    await trx('client_bucket_assignments')
      .where({ client_id: client.id })
      .whereNull('unassigned_at')
      .update({ unassigned_at: trx.fn.now() });

    const [row] = await trx('client_bucket_assignments')
      .insert({
        client_id: client.id,
        bucket_id: bucket.id,
        assigned_by: req.user.id,
        notes: parsed.data.notes || null,
      })
      .returning('*');
    return row;
  });

  await audit({
    req,
    action: 'client.assign_bucket',
    entityType: 'client',
    entityId: client.id,
    after: { bucket_id: bucket.id, assignment_id: result.id },
  });
  res.json({ assignment: result });
});

router.post('/:id/unassign-bucket', requireStaff, async (req, res) => {
  const client = await db('clients').where({ id: req.params.id }).first();
  if (!client) return res.status(404).json({ error: 'not_found' });

  const n = await db('client_bucket_assignments')
    .where({ client_id: client.id })
    .whereNull('unassigned_at')
    .update({ unassigned_at: db.fn.now() });

  await audit({ req, action: 'client.unassign_bucket', entityType: 'client', entityId: client.id, notes: `closed ${n} open assignment(s)` });
  res.json({ unassigned: n });
});

// Bulk import — permissive. All fields optional; blank name becomes "(unnamed)".
router.post('/import', requireStaff, async (req, res) => {
  const importRowSchema = z
    .object({
      name: z.string().optional(),
      legal_name: z.string().nullable().optional(),
      ein: z.string().nullable().optional(),
      contact_name: z.string().nullable().optional(),
      contact_email: z.string().nullable().optional(),
      contact_phone: z.string().nullable().optional(),
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
    clinic_id: z.string().uuid(),
    clients: z.array(importRowSchema).min(1).max(5000),
  });
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const clinic = await db('clinics').where({ id: parsed.data.clinic_id }).first();
  if (!clinic) return res.status(400).json({ error: 'clinic_not_found' });

  const normalize = (v) => (v === '' || v == null ? null : v);
  const rows = parsed.data.clients.map((c) => ({
    clinic_id: clinic.id,
    name: (c.name && c.name.trim()) || '(unnamed)',
    legal_name: normalize(c.legal_name),
    ein: normalize(c.ein),
    contact_name: normalize(c.contact_name),
    contact_email: normalize(c.contact_email),
    contact_phone: normalize(c.contact_phone),
    address_line1: normalize(c.address_line1),
    address_line2: normalize(c.address_line2),
    city: normalize(c.city),
    state: normalize(c.state),
    postal_code: normalize(c.postal_code),
    country: normalize(c.country),
    notes: normalize(c.notes),
  }));
  const inserted = await db.transaction(async (trx) => {
    return trx('clients').insert(rows).returning(['id', 'name']);
  });

  await audit({
    req,
    action: 'client.bulk_import',
    entityType: 'clinic',
    entityId: clinic.id,
    notes: `imported ${inserted.length} clients`,
    after: { count: inserted.length },
  });
  res.status(201).json({ imported: inserted.length, clients: inserted });
});

module.exports = router;
