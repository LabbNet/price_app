#!/usr/bin/env node
/**
 * Create or reset the first Labb admin user.
 *
 * Usage (interactive, in Render Shell or local):
 *   node scripts/create-admin.js
 *
 * Usage (non-interactive, via env vars — useful for CI):
 *   SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... \
 *   SEED_ADMIN_FIRST=... SEED_ADMIN_LAST=... \
 *   node scripts/create-admin.js
 *
 * If a user with that email already exists, their password is reset and their
 * role is set to 'admin'. Safe to re-run.
 */

require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcryptjs');
const db = require('../db/knex');

function prompt(question, { mask = false } = {}) {
  return new Promise((resolve) => {
    if (!mask) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
      return;
    }
    // Masked password input: raw-mode stdin, print '*' per keystroke.
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let buf = '';
    stdin.on('data', function onData(ch) {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(buf);
      } else if (ch === '\u0003') {
        process.stdout.write('\n');
        process.exit(130);
      } else if (ch === '\u007f' || ch === '\b') {
        if (buf.length > 0) {
          buf = buf.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        buf += ch;
        process.stdout.write('*');
      }
    });
  });
}

(async () => {
  try {
    const envEmail = process.env.SEED_ADMIN_EMAIL;
    const envPassword = process.env.SEED_ADMIN_PASSWORD;

    const email = (envEmail || (await prompt('Email: '))).trim().toLowerCase();
    if (!email || !email.includes('@')) {
      console.error('Invalid email.');
      process.exit(1);
    }

    const first = (process.env.SEED_ADMIN_FIRST || (await prompt('First name: '))).trim();
    const last = (process.env.SEED_ADMIN_LAST || (await prompt('Last name: '))).trim();

    const password = envPassword || (await prompt('Password (min 12 chars): ', { mask: true }));
    if (password.length < 12) {
      console.error('Password must be at least 12 characters.');
      process.exit(1);
    }

    const password_hash = await bcrypt.hash(password, 12);

    const existing = await db('users').whereRaw('LOWER(email) = ?', email).first();
    if (existing) {
      await db('users').where({ id: existing.id }).update({
        password_hash,
        role: 'admin',
        is_active: true,
        first_name: first || existing.first_name,
        last_name: last || existing.last_name,
        updated_at: db.fn.now(),
      });
      console.log(`Updated existing user → admin: ${email} (${existing.id})`);
    } else {
      const [row] = await db('users')
        .insert({ email, password_hash, role: 'admin', first_name: first, last_name: last })
        .returning(['id', 'email']);
      console.log(`Created admin: ${row.email} (${row.id})`);
    }

    await db.destroy();
    process.exit(0);
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  }
})();
