#!/usr/bin/env node
/**
 * One-shot: set every user's password to the shared default and mark
 * them active. Intended to be run from Render Shell while email
 * delivery is offline so admins can log in immediately.
 *
 *   Usage (in Render Shell on price-app-api):
 *     npm run reset:passwords
 *
 *   Or with a custom password:
 *     DEFAULT_PASSWORD='MyNewDefault!' npm run reset:passwords
 *
 *   Exclude a specific user (e.g. skip the superadmin):
 *     EXCLUDE_EMAIL='james@labb.net' npm run reset:passwords
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../db/knex');

(async () => {
  const password = process.env.DEFAULT_PASSWORD || 'Smart1234!';
  const excludeEmail = process.env.EXCLUDE_EMAIL
    ? process.env.EXCLUDE_EMAIL.toLowerCase()
    : null;

  try {
    const password_hash = await bcrypt.hash(password, 12);

    const beforeCount = Number((await db('users').count({ n: '*' }).first()).n);

    const q = db('users').update({
      password_hash,
      is_active: true,
      updated_at: db.fn.now(),
    });
    if (excludeEmail) q.whereRaw('LOWER(email) <> ?', excludeEmail);
    const affected = await q;

    const users = await db('users').select('email', 'role').orderBy('email');

    console.log(`✓ Reset ${affected} of ${beforeCount} user(s) to password: ${password}`);
    if (excludeEmail) console.log(`  (excluded ${excludeEmail})`);
    console.log('');
    console.log('User list:');
    for (const u of users) {
      console.log(`  ${u.email}  (${u.role})`);
    }

    await db.destroy();
    process.exit(0);
  } catch (err) {
    console.error('Failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
