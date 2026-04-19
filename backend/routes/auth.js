const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../db/knex');
const { requireAuth } = require('../middleware/auth');
const { audit } = require('../services/audit');

const router = express.Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  const { email, password } = parsed.data;

  const user = await db('users').whereRaw('LOWER(email) = ?', email.toLowerCase()).first();
  if (!user || !user.is_active) return res.status(401).json({ error: 'invalid_credentials' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

  await db('users').where({ id: user.id }).update({ last_login_at: db.fn.now() });

  const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      clinic_id: user.clinic_id,
    },
  });
});

router.get('/me', requireAuth, (req, res) => {
  const { id, email, first_name, last_name, role, clinic_id, client_id } = req.user;
  res.json({ user: { id, email, first_name, last_name, role, clinic_id, client_id } });
});

// Public: look up an invite by token (so the accept-invite page can show
// which email/role is being set up)
router.get('/invite/:token', async (req, res) => {
  const invite = await db('email_invites').where({ token: req.params.token }).first();
  if (!invite) return res.status(404).json({ error: 'invalid_or_expired_token' });
  if (invite.accepted_at) return res.status(410).json({ error: 'already_accepted' });
  if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'expired' });

  const clinic = invite.clinic_id ? await db('clinics').where({ id: invite.clinic_id }).first() : null;
  const client = invite.client_id ? await db('clients').where({ id: invite.client_id }).first() : null;
  res.json({
    invite: {
      email: invite.email,
      role: invite.role,
      expires_at: invite.expires_at,
      clinic_name: clinic?.name || null,
      client_name: client?.name || null,
    },
  });
});

// Public: accept invite and create the user
const acceptSchema = z.object({
  password: z.string().min(12),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
});

router.post('/invite/:token/accept', async (req, res) => {
  const parsed = acceptSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

  const invite = await db('email_invites').where({ token: req.params.token }).first();
  if (!invite) return res.status(404).json({ error: 'invalid_or_expired_token' });
  if (invite.accepted_at) return res.status(410).json({ error: 'already_accepted' });
  if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'expired' });

  const email = invite.email.toLowerCase();
  const existing = await db('users').whereRaw('LOWER(email) = ?', email).first();
  if (existing) return res.status(409).json({ error: 'email_in_use' });

  const password_hash = await bcrypt.hash(parsed.data.password, 12);

  const user = await db.transaction(async (trx) => {
    const [u] = await trx('users')
      .insert({
        email,
        password_hash,
        first_name: parsed.data.first_name || null,
        last_name: parsed.data.last_name || null,
        role: invite.role,
        clinic_id: invite.clinic_id || null,
        client_id: invite.client_id || null,
      })
      .returning(['id', 'email', 'first_name', 'last_name', 'role', 'clinic_id', 'client_id']);
    await trx('email_invites').where({ id: invite.id }).update({ accepted_at: trx.fn.now() });
    return u;
  });

  await audit({
    req,
    action: 'user.accept_invite',
    entityType: 'user',
    entityId: user.id,
    after: user,
    notes: `accepted invite ${invite.id}`,
  });

  const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });

  res.status(201).json({ token, user });
});

module.exports = router;
