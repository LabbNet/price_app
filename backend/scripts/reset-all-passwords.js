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

    // 1. Convert every open invite → user row (or update existing).
    const pending = await db('email_invites').whereNull('accepted_at');
    let convertedCreated = 0;
    let convertedUpdated = 0;

    for (const inv of pending) {
      const email = inv.email.toLowerCase();
      await db.transaction(async (trx) => {
        const existing = await trx('users').whereRaw('LOWER(email) = ?', email).first();
        if (existing) {
          await trx('users')
            .where({ id: existing.id })
            .update({
              password_hash,
              role: inv.role,
              clinic_id: inv.clinic_id || null,
              client_id: inv.client_id || null,
              is_active: true,
              updated_at: trx.fn.now(),
            });
          convertedUpdated++;
        } else {
          await trx('users').insert({
            email,
            password_hash,
            role: inv.role,
            clinic_id: inv.clinic_id || null,
            client_id: inv.client_id || null,
          });
          convertedCreated++;
        }
        await trx('email_invites').where({ id: inv.id }).update({ accepted_at: trx.fn.now() });
      });
    }

    // 2. Reset every remaining user's password (so users created before
    //    the invite system also get the default). Respect EXCLUDE_EMAIL.
    const resetQuery = db('users').update({
      password_hash,
      is_active: true,
      updated_at: db.fn.now(),
    });
    if (excludeEmail) resetQuery.whereRaw('LOWER(email) <> ?', excludeEmail);
    const resetCount = await resetQuery;

    const users = await db('users').select('email', 'role').orderBy('email');
    const totalUsers = users.length;

    console.log('');
    console.log(`  Converted ${convertedCreated} invite(s) → new users`);
    console.log(`  Converted ${convertedUpdated} invite(s) → updated existing users`);
    console.log(`  Reset ${resetCount} of ${totalUsers} total users to password: ${password}`);
    if (excludeEmail) console.log(`  (excluded ${excludeEmail} from the reset pass)`);
    console.log('');
    console.log('Full user list:');
    for (const u of users) {
      console.log(`  ${u.email}  (${u.role})`);
    }
    console.log('');
    console.log(`✓ Done. Everyone${excludeEmail ? ` except ${excludeEmail}` : ''} can log in with password: ${password}`);

    await db.destroy();
    process.exit(0);
  } catch (err) {
    console.error('Failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
