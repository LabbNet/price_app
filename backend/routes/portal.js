const express = require('express');
const db = require('../db/knex');
const { requireAuth } = require('../middleware/auth');
const { resolveEffectivePrice } = require('../services/pricing');

const router = express.Router();
router.use(requireAuth);

const PORTAL_ROLES = new Set(['clinic_admin', 'clinic_user', 'client_user']);

router.use((req, res, next) => {
  if (!PORTAL_ROLES.has(req.user.role)) return res.status(403).json({ error: 'not_a_portal_user' });
  next();
});

/**
 * Return the current user plus the entity they belong to (clinic for
 * clinic_admin/clinic_user, client for client_user) + the list of clients
 * they have access to.
 */
router.get('/me', async (req, res) => {
  const { id, email, first_name, last_name, role, clinic_id, client_id } = req.user;

  let clinic = null;
  let clients = [];

  if (role === 'clinic_admin' || role === 'clinic_user') {
    if (clinic_id) {
      clinic = await db('clinics').where({ id: clinic_id }).first();
      clients = await db('clients').where({ clinic_id, is_active: true }).orderBy('name');
    }
  } else if (role === 'client_user') {
    if (client_id) {
      const client = await db('clients').where({ id: client_id }).first();
      if (client) {
        clients = [client];
        clinic = await db('clinics').where({ id: client.clinic_id }).first();
      }
    }
  }

  res.json({
    user: { id, email, first_name, last_name, role, clinic_id, client_id },
    clinic,
    clients,
  });
});

// Authorize a given client_id for the current user
async function assertClientAccess(req, res, clientId) {
  const user = req.user;
  const client = await db('clients').where({ id: clientId }).first();
  if (!client) { res.status(404).json({ error: 'not_found' }); return null; }

  if (user.role === 'client_user') {
    if (client.id !== user.client_id) { res.status(403).json({ error: 'forbidden' }); return null; }
  } else if (user.role === 'clinic_admin' || user.role === 'clinic_user') {
    if (client.clinic_id !== user.clinic_id) { res.status(403).json({ error: 'forbidden' }); return null; }
  } else {
    res.status(403).json({ error: 'forbidden' });
    return null;
  }
  return client;
}

router.get('/clients/:id', async (req, res) => {
  const client = await assertClientAccess(req, res, req.params.id);
  if (!client) return;

  const assignment = await db('client_bucket_assignments as cba')
    .leftJoin('pricing_buckets as pb', 'pb.id', 'cba.bucket_id')
    .where('cba.client_id', client.id)
    .whereNull('cba.unassigned_at')
    .select('cba.bucket_id', 'pb.name as bucket_name', 'cba.assigned_at')
    .first();

  res.json({ client, current_bucket: assignment || null });
});

router.get('/clients/:id/pricing', async (req, res) => {
  const client = await assertClientAccess(req, res, req.params.id);
  if (!client) return;

  const products = await db('products').where({ is_active: true }).orderBy('name');
  const effective = [];
  for (const p of products) {
    const r = await resolveEffectivePrice({ clientId: client.id, productId: p.id });
    if (r.source === 'none') continue;
    // Portal users shouldn't see Labb cost
    const { labb_cost, ...safe } = r;

    // Bucket-sourced items respect is_enabled — disabled means "show product
    // but withhold price; let the client request it". Special pricing is
    // always considered visible since it was created intentionally.
    const visible = r.source === 'special' ? true : r.is_enabled === true;

    if (!visible) {
      effective.push({
        product_id: p.id,
        product_name: p.name,
        sku: p.sku,
        unit_of_measure: p.unit_of_measure,
        drugs_and_levels: p.drugs_and_levels,
        msrp: null,
        source: r.source,
        price_hidden: true,
      });
      continue;
    }

    effective.push({
      product_id: p.id,
      product_name: p.name,
      sku: p.sku,
      unit_of_measure: p.unit_of_measure,
      drugs_and_levels: p.drugs_and_levels,
      msrp: p.msrp != null ? Number(p.msrp) : null,
      ...safe,
    });
  }

  res.json({ client_id: client.id, effective });
});

router.get('/clients/:id/contracts', async (req, res) => {
  const client = await assertClientAccess(req, res, req.params.id);
  if (!client) return;

  const rows = await db('contracts as c')
    .leftJoin('contract_templates as t', 't.id', 'c.template_id')
    .where('c.client_id', client.id)
    .select(
      'c.id',
      'c.status',
      'c.source',
      'c.title',
      'c.rendered_body',
      'c.pricing_snapshot',
      'c.sent_at',
      'c.signed_by_clinic_at',
      'c.counter_signed_at',
      'c.activated_at',
      'c.terminated_at',
      'c.pdf_path',
      'c.created_at',
      't.name as template_name',
    )
    .orderBy('c.created_at', 'desc');

  // Don't leak the raw pdf_path to the client; just flag availability.
  const contracts = rows.map(({ pdf_path, ...r }) => ({ ...r, has_pdf: !!pdf_path }));
  res.json({ contracts });
});

router.get('/contracts/:id', async (req, res) => {
  const contract = await db('contracts').where({ id: req.params.id }).first();
  if (!contract) return res.status(404).json({ error: 'not_found' });
  const client = await assertClientAccess(req, res, contract.client_id);
  if (!client) return;

  const signatures = await db('signatures').where({ contract_id: contract.id }).orderBy('signed_at');
  const template = contract.template_id
    ? await db('contract_templates').where({ id: contract.template_id }).first()
    : null;
  const addenda = await db('contract_addenda')
    .where({ contract_id: contract.id })
    .orderBy('addendum_number', 'desc');

  const { pdf_path, ...safeContract } = contract;
  res.json({
    contract: { ...safeContract, has_pdf: !!pdf_path },
    template,
    signatures,
    addenda: addenda.map(({ pdf_path: p, ...a }) => ({ ...a, has_pdf: !!p })),
  });
});

router.get('/contracts/:id/pdf', async (req, res) => {
  const contract = await db('contracts').where({ id: req.params.id }).first();
  if (!contract) return res.status(404).json({ error: 'not_found' });
  const client = await assertClientAccess(req, res, contract.client_id);
  if (!client) return;
  const fs = require('fs');
  if (!contract.pdf_path || !fs.existsSync(contract.pdf_path)) {
    return res.status(404).json({ error: 'pdf_not_available' });
  }
  res.download(contract.pdf_path, `contract-${contract.id}.pdf`);
});

router.get('/contracts/:id/addenda/:aid/pdf', async (req, res) => {
  const contract = await db('contracts').where({ id: req.params.id }).first();
  if (!contract) return res.status(404).json({ error: 'not_found' });
  const client = await assertClientAccess(req, res, contract.client_id);
  if (!client) return;
  const addendum = await db('contract_addenda').where({ id: req.params.aid, contract_id: contract.id }).first();
  if (!addendum) return res.status(404).json({ error: 'not_found' });
  const fs = require('fs');
  if (!addendum.pdf_path || !fs.existsSync(addendum.pdf_path)) {
    return res.status(404).json({ error: 'pdf_not_available' });
  }
  res.download(addendum.pdf_path, `addendum-${addendum.addendum_number}.pdf`);
});

module.exports = router;
