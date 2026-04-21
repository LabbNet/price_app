const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../db/knex');
const { requireAuth, requireStaff } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { sendEmail } = require('../services/email');
const { inviteEmail } = require('../services/emailTemplates');

const router = express.Router();
router.use(requireAuth);

const ROLES = ['admin', 'sales', 'legal', 'finance', 'clinic_admin', 'clinic_user', 'client_user'];

router.get('/', requireStaff, async (req, res) => {
  const { role, clinic_id, client_id, active } = req.query;
  const rows = await db('users as u')
    .leftJoin('clinics as cn', 'cn.id', 'u.clinic_id')
    .leftJoin('clients as cl', 'cl.id', 'u.client_id')
    .select(
      'u.id', 'u.email', 'u.first_name', 'u.last_name', 'u.role', 'u.is_active',
      'u.last_login_at', 'u.created_at', 'u.clinic_id', 'u.client_id',
      'cn.name as clinic_name', 'cl.name as client_name',
    )
    .modify((q) => {
      if (role) q.where('u.role', role);
      if (clinic_id) q.where('u.clinic_id', clinic_id);
      if (client_id) q.where('u.client_id', client_id);
      if (active === 'true') q.where('u.is_active', true);
      if (active === 'false') q.where('u.is_active', false);
    })
    .orderBy('u.created_at', 'desc');
  res.json({ users: rows });
});

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  role: z.enum(ROLES),
  clinic_id: z.string().uuid().nullable().optional(),
  client_id: z.string().uuid().nullable().optional(),
});

router.post('/', requireStaff, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const email = parsed.data.email.toLowerCase();
  const existing = await db('users').whereRaw('LOWER(email) = ?', email).first();
  if (existing) return res.status(409).json({ error: 'email_in_use' });

  const password_hash = await bcrypt.hash(parsed.data.password, 12);
  const [row] = await db('users')
    .insert({
      email,
      password_hash,
      first_name: parsed.data.first_name || null,
      last_name: parsed.data.last_name || null,
      role: parsed.data.role,
      clinic_id: parsed.data.clinic_id || null,
      client_id: parsed.data.client_id || null,
    })
    .returning(['id', 'email', 'role', 'clinic_id', 'client_id']);

  await audit({ req, action: 'user.create', entityType: 'user', entityId: row.id, after: row });
  res.status(201).json({ user: row });
});

router.post('/:id/deactivate', requireStaff, async (req, res) => {
  const before = await db('users').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });
  const [row] = await db('users').where({ id: req.params.id }).update({ is_active: false, updated_at: db.fn.now() }).returning(['id', 'email', 'role']);
  await audit({ req, action: 'user.deactivate', entityType: 'user', entityId: row.id, before, after: row });
  res.json({ user: row });
});

router.post('/:id/activate', requireStaff, async (req, res) => {
  const before = await db('users').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });
  const [row] = await db('users').where({ id: req.params.id }).update({ is_active: true, updated_at: db.fn.now() }).returning(['id', 'email', 'role']);
  await audit({ req, action: 'user.activate', entityType: 'user', entityId: row.id, before, after: row });
  res.json({ user: row });
});

// --- Invites ---------------------------------------------------------------

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(ROLES),
  clinic_id: z.string().uuid().nullable().optional(),
  client_id: z.string().uuid().nullable().optional(),
});

router.post('/invite', requireStaff, async (req, res) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const email = parsed.data.email.toLowerCase();
  const token = crypto.randomBytes(32).toString('base64url');
  const ttlDays = Number(process.env.INVITE_TTL_DAYS || 14);
  const expires_at = new Date(Date.now() + ttlDays * 86400_000);

  // While email delivery is down, creating an invite also creates the user
  // immediately with a shared default password so the invitee can log in
  // right away. Tell them to change it on first sign-in.
  const DEFAULT_PASSWORD = 'Smart1234!';

  const result = await db.transaction(async (trx) => {
    const [invite] = await trx('email_invites')
      .insert({
        email,
        role: parsed.data.role,
        clinic_id: parsed.data.clinic_id || null,
        client_id: parsed.data.client_id || null,
        token,
        expires_at,
        invited_by: req.user.id,
      })
      .returning('*');

    // If a user already owns this email, just keep the old one (don't
    // reset). Otherwise create with the shared default password.
    const existing = await trx('users').whereRaw('LOWER(email) = ?', email).first();
    let user;
    let passwordSet = false;
    if (existing) {
      user = existing;
    } else {
      const password_hash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
      const [u] = await trx('users')
        .insert({
          email,
          password_hash,
          role: parsed.data.role,
          clinic_id: parsed.data.clinic_id || null,
          client_id: parsed.data.client_id || null,
        })
        .returning(['id', 'email', 'role', 'clinic_id', 'client_id']);
      user = u;
      passwordSet = true;
      await trx('email_invites').where({ id: invite.id }).update({ accepted_at: trx.fn.now() });
    }
    return { invite, user, passwordSet };
  });

  await audit({
    req,
    action: result.passwordSet ? 'user.invite_autocreate' : 'user.invite',
    entityType: 'email_invite',
    entityId: result.invite.id,
    after: result.invite,
    notes: result.passwordSet
      ? `invited ${email} + auto-created with default password`
      : `invited ${email} (user already exists)`,
  });

  res.status(201).json({
    invite: { id: result.invite.id, token, expires_at },
    user: result.user,
    login: result.passwordSet ? { email, password: DEFAULT_PASSWORD } : null,
    user_already_existed: !result.passwordSet,
  });
});

// Bulk-convert every open invite into a ready-to-log-in user with the
// shared default password. Safe to re-run — skips invites whose email
// already has a user.
router.post('/invites/convert-pending', requireStaff, async (req, res) => {
  const DEFAULT_PASSWORD = 'Smart1234!';
  const password_hash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  const pending = await db('email_invites').whereNull('accepted_at');
  const created = [];
  const skipped = [];

  for (const inv of pending) {
    const email = inv.email.toLowerCase();
    const existing = await db('users').whereRaw('LOWER(email) = ?', email).first();
    if (existing) {
      skipped.push({ email, reason: 'user_already_exists' });
      await db('email_invites').where({ id: inv.id }).update({ accepted_at: db.fn.now() });
      continue;
    }
    await db.transaction(async (trx) => {
      const [u] = await trx('users')
        .insert({
          email,
          password_hash,
          role: inv.role,
          clinic_id: inv.clinic_id || null,
          client_id: inv.client_id || null,
        })
        .returning(['id', 'email', 'role']);
      await trx('email_invites').where({ id: inv.id }).update({ accepted_at: trx.fn.now() });
      created.push(u);
    });
  }

  await audit({
    req,
    action: 'user.invite_bulk_convert',
    entityType: 'email_invite',
    notes: `created ${created.length}, skipped ${skipped.length}`,
    after: { created: created.length, skipped: skipped.length },
  });

  res.json({
    created,
    skipped,
    password: DEFAULT_PASSWORD,
  });
});

router.get('/invites', requireStaff, async (req, res) => {
  const rows = await db('email_invites as i')
    .leftJoin('clinics as cn', 'cn.id', 'i.clinic_id')
    .leftJoin('clients as cl', 'cl.id', 'i.client_id')
    .leftJoin('users as u', 'u.id', 'i.invited_by')
    .select(
      'i.id', 'i.email', 'i.role', 'i.clinic_id', 'i.client_id',
      'i.expires_at', 'i.accepted_at', 'i.created_at', 'i.token',
      'cn.name as clinic_name', 'cl.name as client_name',
      'u.email as invited_by_email',
    )
    .orderBy('i.created_at', 'desc')
    .limit(500);
  res.json({ invites: rows });
});

router.delete('/invites/:id', requireStaff, async (req, res) => {
  const before = await db('email_invites').where({ id: req.params.id }).first();
  if (!before) return res.status(404).json({ error: 'not_found' });
  await db('email_invites').where({ id: req.params.id }).del();
  await audit({ req, action: 'user.invite_revoke', entityType: 'email_invite', entityId: before.id, before });
  res.json({ ok: true });
});

module.exports = router;
