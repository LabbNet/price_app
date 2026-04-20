const express = require('express');
const { z } = require('zod');
const db = require('../db/knex');
const { requireAuth, requireStaff } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { sendEmail } = require('../services/email');
const { priceRequestEmail } = require('../services/emailTemplates');

const router = express.Router();
router.use(requireAuth);

const STAFF_ROLES = new Set(['admin', 'sales', 'legal', 'finance']);
const PORTAL_ROLES = new Set(['clinic_admin', 'clinic_user', 'client_user']);

// Helper: confirm a portal user is allowed to touch a given client.
async function portalCanAccessClient(user, clientId) {
  if (!PORTAL_ROLES.has(user.role)) return false;
  const client = await db('clients').where({ id: clientId }).first();
  if (!client) return false;
  if (user.role === 'client_user') return client.id === user.client_id;
  return client.clinic_id === user.clinic_id;
}

// Portal users submit: POST /api/price-requests
router.post('/', async (req, res) => {
  const schema = z.object({
    client_id: z.string().uuid(),
    product_id: z.string().uuid(),
    message: z.string().nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  if (!PORTAL_ROLES.has(req.user.role)) {
    return res.status(403).json({ error: 'only_portal_users_can_request' });
  }
  const ok = await portalCanAccessClient(req.user, parsed.data.client_id);
  if (!ok) return res.status(403).json({ error: 'forbidden' });

  const product = await db('products').where({ id: parsed.data.product_id }).first();
  if (!product) return res.status(400).json({ error: 'product_not_found' });

  const [row] = await db('price_requests')
    .insert({
      client_id: parsed.data.client_id,
      product_id: parsed.data.product_id,
      requested_by: req.user.id,
      message: parsed.data.message || null,
    })
    .returning('*');

  await audit({
    req,
    action: 'price_request.create',
    entityType: 'price_request',
    entityId: row.id,
    after: row,
    notes: `client=${parsed.data.client_id} product=${product.name}`,
  });

  // Notify the clinic's sales rep (or any admin if no rep assigned).
  const client = await db('clients').where({ id: row.client_id }).first();
  const clinic = client ? await db('clinics').where({ id: client.clinic_id }).first() : null;

  let recipient = null;
  if (clinic?.sales_rep_id) {
    recipient = await db('users').where({ id: clinic.sales_rep_id, is_active: true }).first();
  }
  if (!recipient) {
    recipient = await db('users').where({ role: 'admin', is_active: true }).orderBy('created_at').first();
  }

  let emailResult = { sent: false, reason: 'no_recipient' };
  if (recipient) {
    const msg = priceRequestEmail({
      request: row,
      client,
      clinic,
      product,
      requester: req.user,
    });
    emailResult = await sendEmail({
      to: recipient.email,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
  }

  res.status(201).json({ request: row, email: { ...emailResult, to: recipient?.email || null } });
});

// Staff: list price requests with joined context
router.get('/', requireStaff, async (req, res) => {
  const status = req.query.status || 'open';
  const { client_id, clinic_id } = req.query;

  const q = db('price_requests as pr')
    .join('clients as cl', 'cl.id', 'pr.client_id')
    .join('clinics as cn', 'cn.id', 'cl.clinic_id')
    .join('products as p', 'p.id', 'pr.product_id')
    .leftJoin('users as ru', 'ru.id', 'pr.requested_by')
    .leftJoin('users as rsp', 'rsp.id', 'pr.responded_by')
    .select(
      'pr.*',
      'cl.name as client_name',
      'cn.id as clinic_id',
      'cn.name as clinic_name',
      'p.name as product_name',
      'p.sku as product_sku',
      'p.msrp as product_msrp',
      'p.labb_cost as product_labb_cost',
      'ru.email as requested_by_email',
      'rsp.email as responded_by_email',
    )
    .orderBy('pr.created_at', 'desc')
    .limit(500);

  if (status && status !== 'all') q.where('pr.status', status);
  if (client_id) q.where('pr.client_id', client_id);
  if (clinic_id) q.where('cn.id', clinic_id);

  const rows = await q;
  res.json({ requests: rows });
});

// Staff: respond — either just add a note, or also enable the bucket item
// for the requesting client's bucket in one shot.
router.post('/:id/respond', requireStaff, async (req, res) => {
  const schema = z.object({
    response_note: z.string().nullable().optional(),
    enable_in_bucket: z.boolean().optional().default(false),
    unit_price: z.coerce.number().min(0).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const before = await db('price_requests').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });
  if (before.status !== 'open') return res.status(409).json({ error: 'already_handled', status: before.status });

  const result = await db.transaction(async (trx) => {
    let bucketUpdate = null;

    if (parsed.data.enable_in_bucket) {
      const assignment = await trx('client_bucket_assignments')
        .where({ client_id: before.client_id })
        .whereNull('unassigned_at')
        .first();

      if (assignment) {
        const item = await trx('bucket_items')
          .where({ bucket_id: assignment.bucket_id, product_id: before.product_id })
          .first();
        if (item) {
          const patch = { is_enabled: true, updated_at: trx.fn.now() };
          if (parsed.data.unit_price != null) patch.unit_price = parsed.data.unit_price;
          await trx('bucket_items').where({ id: item.id }).update(patch);
          bucketUpdate = { bucket_id: assignment.bucket_id, bucket_item_id: item.id };
        }
      }
    }

    const [row] = await trx('price_requests')
      .where({ id: req.params.id })
      .update({
        status: 'responded',
        responded_at: trx.fn.now(),
        responded_by: req.user.id,
        response_note: parsed.data.response_note || null,
        updated_at: trx.fn.now(),
      })
      .returning('*');
    return { request: row, bucketUpdate };
  });

  await audit({
    req,
    action: 'price_request.respond',
    entityType: 'price_request',
    entityId: result.request.id,
    before,
    after: result.request,
    notes: result.bucketUpdate
      ? `enabled in bucket ${result.bucketUpdate.bucket_id}`
      : 'responded without bucket change',
  });
  res.json(result);
});

router.post('/:id/dismiss', requireStaff, async (req, res) => {
  const before = await db('price_requests').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });
  if (before.status !== 'open') return res.status(409).json({ error: 'already_handled' });

  const [row] = await db('price_requests')
    .where({ id: req.params.id })
    .update({
      status: 'dismissed',
      responded_at: db.fn.now(),
      responded_by: req.user.id,
      updated_at: db.fn.now(),
    })
    .returning('*');

  await audit({ req, action: 'price_request.dismiss', entityType: 'price_request', entityId: row.id, before, after: row });
  res.json({ request: row });
});

module.exports = router;
