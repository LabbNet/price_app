const express = require('express');
const { z } = require('zod');
const db = require('../db/knex');
const { requireAuth, requireStaff } = require('../middleware/auth');
const { audit } = require('../services/audit');

const router = express.Router();
router.use(requireAuth);

router.get('/', requireStaff, async (req, res) => {
  const status = req.query.status || 'pending_or_skipped';
  const rows = await db('duplicate_review_queue as q')
    .join('clinics as a', 'a.id', 'q.clinic_a_id')
    .join('clinics as b', 'b.id', 'q.clinic_b_id')
    .leftJoin('users as u', 'u.id', 'q.resolved_by')
    .select(
      'q.id',
      'q.match_score',
      'q.status',
      'q.resolved_at',
      'q.resolution_notes',
      'q.created_at',
      'u.email as resolved_by_email',
      'a.id as a_id', 'a.name as a_name', 'a.address_line1 as a_line', 'a.city as a_city', 'a.state as a_state', 'a.postal_code as a_zip', 'a.created_at as a_created',
      'b.id as b_id', 'b.name as b_name', 'b.address_line1 as b_line', 'b.city as b_city', 'b.state as b_state', 'b.postal_code as b_zip', 'b.created_at as b_created',
    )
    .modify((q) => {
      if (status === 'pending_or_skipped') q.whereIn('q.status', ['pending', 'skipped']);
      else if (status && status !== 'all') q.where('q.status', status);
    })
    .orderBy('q.created_at', 'desc')
    .limit(500);
  res.json({ duplicates: rows });
});

// Skip: leave in queue, next staff user sees it again.
router.post('/:id/skip', requireStaff, async (req, res) => {
  const before = await db('duplicate_review_queue').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });
  const [row] = await db('duplicate_review_queue')
    .where({ id: req.params.id })
    .update({ status: 'skipped', updated_at: db.fn.now() })
    .returning('*');
  await audit({ req, action: 'duplicate.skip', entityType: 'duplicate_review_queue', entityId: row.id, before, after: row });
  res.json({ duplicate: row });
});

// Resolve: delete one of the two, keep both, or just mark reviewed.
const resolveSchema = z.object({
  action: z.enum(['delete_a', 'delete_b', 'keep_both']),
  notes: z.string().nullable().optional(),
});

router.post('/:id/resolve', requireStaff, async (req, res) => {
  const parsed = resolveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const before = await db('duplicate_review_queue').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });

  const deletedId = parsed.data.action === 'delete_a' ? before.clinic_a_id
    : parsed.data.action === 'delete_b' ? before.clinic_b_id
      : null;

  await db.transaction(async (trx) => {
    if (deletedId) {
      await trx('clinics').where({ id: deletedId }).del();
    }
    await trx('duplicate_review_queue')
      .where({ id: req.params.id })
      .update({
        status: 'resolved',
        resolved_by: req.user.id,
        resolved_at: trx.fn.now(),
        resolution_notes: parsed.data.notes || null,
        updated_at: trx.fn.now(),
      });
  });

  await audit({
    req,
    action: 'duplicate.resolve',
    entityType: 'duplicate_review_queue',
    entityId: before.id,
    before,
    notes: `action=${parsed.data.action}${deletedId ? ` deleted=${deletedId}` : ''}`,
  });
  res.json({ ok: true, deleted_clinic_id: deletedId });
});

module.exports = router;
