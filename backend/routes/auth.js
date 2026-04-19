const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../db/knex');
const { requireAuth } = require('../middleware/auth');

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
  const { id, email, first_name, last_name, role, clinic_id } = req.user;
  res.json({ user: { id, email, first_name, last_name, role, clinic_id } });
});

module.exports = router;
