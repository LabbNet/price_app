const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const { z } = require('zod');
const db = require('../db/knex');
const { requireAuth, requireStaff } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { buildContext, buildPricingSnapshot, renderTemplate } = require('../services/merge');
const { renderContractPdf, pdfPathFor } = require('../services/pdf');

const router = express.Router();

// Public signing endpoints first (no auth). Mounted before requireAuth below.
const publicRouter = express.Router();

publicRouter.get('/sign/:token', async (req, res) => {
  const contract = await loadContractByToken(req.params.token);
  if (!contract) return res.status(404).json({ error: 'invalid_or_expired_token' });
  res.json(publicContractView(contract));
});

const clinicSignSchema = z.object({
  signer_name: z.string().min(1),
  signer_title: z.string().nullable().optional(),
  signer_email: z.string().email(),
  acknowledged: z.literal(true),
});

publicRouter.post('/sign/:token', async (req, res) => {
  const parsed = clinicSignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const contract = await loadContractByToken(req.params.token);
  if (!contract) return res.status(404).json({ error: 'invalid_or_expired_token' });

  if (contract.status === 'signed_by_clinic' || contract.status === 'counter_signed' || contract.status === 'active') {
    return res.status(409).json({ error: 'already_signed' });
  }
  if (contract.status !== 'sent' && contract.status !== 'viewed') {
    return res.status(409).json({ error: 'not_ready_for_signing', status: contract.status });
  }

  const ip = req.ip;
  const ua = req.headers['user-agent'] || null;

  await db.transaction(async (trx) => {
    await trx('signatures').insert({
      contract_id: contract.id,
      party: 'clinic',
      signer_name: parsed.data.signer_name,
      signer_title: parsed.data.signer_title || null,
      signer_email: parsed.data.signer_email,
      ip_address: ip,
      user_agent: ua,
    });
    await trx('contracts')
      .where({ id: contract.id })
      .update({
        status: 'signed_by_clinic',
        signed_by_clinic_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });
  });

  await audit({
    req,
    action: 'contract.sign_clinic',
    entityType: 'contract',
    entityId: contract.id,
    notes: `signer=${parsed.data.signer_email}`,
  });

  res.json({ ok: true });
});

// "I saw the contract" tracking — harmless if called multiple times.
publicRouter.post('/view/:token', async (req, res) => {
  const contract = await loadContractByToken(req.params.token);
  if (!contract) return res.status(404).json({ error: 'invalid_or_expired_token' });
  if (!contract.first_viewed_at && contract.status === 'sent') {
    await db('contracts')
      .where({ id: contract.id })
      .update({
        status: 'viewed',
        first_viewed_at: db.fn.now(),
        updated_at: db.fn.now(),
      });
  }
  res.json({ ok: true });
});

router.use('/', publicRouter);

// --- Authenticated (staff/clinic) routes below ---
router.use(requireAuth);

// List
router.get('/', async (req, res) => {
  const { client_id, clinic_id, status, template_id } = req.query;
  const rows = await db('contracts as c')
    .join('clients as cl', 'cl.id', 'c.client_id')
    .join('clinics as clinic', 'clinic.id', 'cl.clinic_id')
    .leftJoin('contract_templates as t', 't.id', 'c.template_id')
    .select(
      'c.id',
      'c.status',
      'c.template_version',
      'c.sent_at',
      'c.signed_by_clinic_at',
      'c.counter_signed_at',
      'c.activated_at',
      'c.terminated_at',
      'c.created_at',
      'c.bucket_id',
      'cl.id as client_id',
      'cl.name as client_name',
      'clinic.id as clinic_id',
      'clinic.name as clinic_name',
      't.name as template_name',
    )
    .modify((q) => {
      if (client_id) q.where('c.client_id', client_id);
      if (clinic_id) q.where('cl.clinic_id', clinic_id);
      if (status) q.where('c.status', status);
      if (template_id) q.where('c.template_id', template_id);
    })
    .orderBy('c.created_at', 'desc')
    .limit(500);
  res.json({ contracts: rows });
});

router.get('/:id', async (req, res) => {
  const contract = await db('contracts').where({ id: req.params.id }).first();
  if (!contract) return res.status(404).json({ error: 'not_found' });

  const client = await db('clients').where({ id: contract.client_id }).first();
  const clinic = await db('clinics').where({ id: client.clinic_id }).first();
  const template = await db('contract_templates').where({ id: contract.template_id }).first();
  const bucket = contract.bucket_id ? await db('pricing_buckets').where({ id: contract.bucket_id }).first() : null;
  const signatures = await db('signatures').where({ contract_id: contract.id }).orderBy('signed_at');

  res.json({ contract, client, clinic, template, bucket, signatures });
});

const createSchema = z.object({
  client_id: z.string().uuid(),
  template_id: z.string().uuid(),
  bucket_id: z.string().uuid().nullable().optional(),
  merge_values: z.record(z.string(), z.string()).optional().default({}),
});

router.post('/', requireStaff, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const client = await db('clients').where({ id: parsed.data.client_id }).first();
  if (!client) return res.status(400).json({ error: 'client_not_found' });

  const clinic = await db('clinics').where({ id: client.clinic_id }).first();
  const template = await db('contract_templates').where({ id: parsed.data.template_id }).first();
  if (!template) return res.status(400).json({ error: 'template_not_found' });

  let bucketId = parsed.data.bucket_id;
  if (!bucketId) {
    const current = await db('client_bucket_assignments')
      .where({ client_id: client.id })
      .whereNull('unassigned_at')
      .first();
    bucketId = current?.bucket_id || null;
  }

  const context = await buildContext({ client, clinic, bucketId, extra: parsed.data.merge_values });
  const pricingRows = await buildPricingSnapshot({ clientId: client.id });
  const rendered = renderTemplate({ body: template.body, context, pricingRows });

  const [row] = await db('contracts')
    .insert({
      client_id: client.id,
      template_id: template.id,
      bucket_id: bucketId,
      template_version: template.version,
      rendered_body: rendered,
      merge_values: JSON.stringify(parsed.data.merge_values || {}),
      pricing_snapshot: JSON.stringify(pricingRows),
      status: 'draft',
      created_by: req.user.id,
    })
    .returning('*');

  await audit({ req, action: 'contract.create', entityType: 'contract', entityId: row.id, after: row });
  res.status(201).json({ contract: row });
});

// Update a draft — re-renders the body with the new merge values and refreshes
// the pricing snapshot. Only allowed in 'draft' status.
const patchSchema = z.object({
  merge_values: z.record(z.string(), z.string()).optional(),
  refresh_pricing: z.boolean().optional(),
  bucket_id: z.string().uuid().nullable().optional(),
});

router.patch('/:id', requireStaff, async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const before = await db('contracts').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });
  if (before.status !== 'draft') return res.status(409).json({ error: 'not_draft' });

  const client = await db('clients').where({ id: before.client_id }).first();
  const clinic = await db('clinics').where({ id: client.clinic_id }).first();
  const template = await db('contract_templates').where({ id: before.template_id }).first();

  const mergeValues = parsed.data.merge_values ?? before.merge_values ?? {};
  const bucketId = parsed.data.bucket_id !== undefined ? parsed.data.bucket_id : before.bucket_id;

  const context = await buildContext({ client, clinic, bucketId, extra: mergeValues });
  const pricingRows = parsed.data.refresh_pricing
    ? await buildPricingSnapshot({ clientId: client.id })
    : (before.pricing_snapshot || []);
  const rendered = renderTemplate({ body: template.body, context, pricingRows });

  const [row] = await db('contracts')
    .where({ id: req.params.id })
    .update({
      rendered_body: rendered,
      merge_values: JSON.stringify(mergeValues),
      pricing_snapshot: JSON.stringify(pricingRows),
      bucket_id: bucketId,
      updated_at: db.fn.now(),
    })
    .returning('*');

  await audit({ req, action: 'contract.update', entityType: 'contract', entityId: row.id, before, after: row });
  res.json({ contract: row });
});

// Send — draft → sent. Generates a signing token (valid 30 days by default).
router.post('/:id/send', requireStaff, async (req, res) => {
  const before = await db('contracts').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });
  if (before.status !== 'draft') return res.status(409).json({ error: 'not_draft' });

  const token = crypto.randomBytes(32).toString('base64url');
  const ttlDays = Number(process.env.CONTRACT_SIGN_TOKEN_DAYS || 30);
  const expires = new Date(Date.now() + ttlDays * 86400_000);

  const [row] = await db('contracts')
    .where({ id: req.params.id })
    .update({
      status: 'sent',
      sent_at: db.fn.now(),
      signing_token: token,
      signing_token_expires_at: expires,
      updated_at: db.fn.now(),
    })
    .returning('*');

  await audit({ req, action: 'contract.send', entityType: 'contract', entityId: row.id, before, after: row });
  res.json({ contract: row, signing_token: token, signing_token_expires_at: expires });
});

// Counter-sign (Labb). Must be after clinic has signed. Locks to 'active' and
// generates the final PDF snapshot.
const counterSignSchema = z.object({
  signer_name: z.string().min(1),
  signer_title: z.string().nullable().optional(),
});

router.post('/:id/counter-sign', requireStaff, async (req, res) => {
  const parsed = counterSignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const before = await db('contracts').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });
  if (before.status !== 'signed_by_clinic') {
    return res.status(409).json({ error: 'not_ready_for_counter_sign', status: before.status });
  }

  const client = await db('clients').where({ id: before.client_id }).first();
  const clinic = await db('clinics').where({ id: client.clinic_id }).first();
  const bucket = before.bucket_id ? await db('pricing_buckets').where({ id: before.bucket_id }).first() : null;

  const clinicSig = await db('signatures').where({ contract_id: before.id, party: 'clinic' }).first();
  if (!clinicSig) return res.status(409).json({ error: 'clinic_signature_missing' });

  const labbSigRow = await db.transaction(async (trx) => {
    const [sig] = await trx('signatures').insert({
      contract_id: before.id,
      party: 'labb',
      signed_by_user_id: req.user.id,
      signer_name: parsed.data.signer_name,
      signer_title: parsed.data.signer_title || null,
      signer_email: req.user.email,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'] || null,
    }).returning('*');
    return sig;
  });

  // Generate and write the final PDF
  const pdfPath = await renderContractPdf({
    contract: before,
    client,
    clinic,
    bucket,
    clinicSignature: clinicSig,
    labbSignature: labbSigRow,
  });

  const [row] = await db('contracts')
    .where({ id: before.id })
    .update({
      status: 'active',
      counter_signed_at: db.fn.now(),
      activated_at: db.fn.now(),
      pdf_path: pdfPath,
      signing_token: null, // invalidate
      updated_at: db.fn.now(),
    })
    .returning('*');

  await audit({ req, action: 'contract.counter_sign', entityType: 'contract', entityId: row.id, before, after: row });
  res.json({ contract: row });
});

const terminateSchema = z.object({ reason: z.string().min(1) });

router.post('/:id/terminate', requireStaff, async (req, res) => {
  const parsed = terminateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const before = await db('contracts').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });
  if (before.status !== 'active') return res.status(409).json({ error: 'not_active' });

  const [row] = await db('contracts')
    .where({ id: req.params.id })
    .update({
      status: 'terminated',
      terminated_at: db.fn.now(),
      termination_reason: parsed.data.reason,
      updated_at: db.fn.now(),
    })
    .returning('*');

  await audit({ req, action: 'contract.terminate', entityType: 'contract', entityId: row.id, before, after: row });
  res.json({ contract: row });
});

router.get('/:id/pdf', async (req, res) => {
  const contract = await db('contracts').where({ id: req.params.id }).first();
  if (!contract) return res.status(404).json({ error: 'not_found' });
  if (!contract.pdf_path || !fs.existsSync(contract.pdf_path)) {
    return res.status(404).json({ error: 'pdf_not_generated' });
  }
  res.download(contract.pdf_path, `contract-${contract.id}.pdf`);
});

async function loadContractByToken(token) {
  if (!token) return null;
  const contract = await db('contracts').where({ signing_token: token }).first();
  if (!contract) return null;
  if (contract.signing_token_expires_at && new Date(contract.signing_token_expires_at) < new Date()) {
    return null;
  }
  return contract;
}

function publicContractView(contract) {
  return {
    id: contract.id,
    status: contract.status,
    rendered_body: contract.rendered_body,
    pricing_snapshot: contract.pricing_snapshot,
    sent_at: contract.sent_at,
    signed_by_clinic_at: contract.signed_by_clinic_at,
    signing_token_expires_at: contract.signing_token_expires_at,
  };
}

module.exports = router;
