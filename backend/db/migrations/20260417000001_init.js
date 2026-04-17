/**
 * Initial schema for Labb Pricing App.
 *
 * Core concepts:
 *   - users: Labb staff (admin/sales/legal/finance) and client logins (client_admin/client_user)
 *   - clients: parent organizations (e.g. the 250-clinic client)
 *   - clinics: individual clinic locations under a client, each signs its own contract
 *   - products: catalog with Labb cost-of-goods for margin tracking
 *   - pricing_buckets + bucket_items: reusable price lists, copyable between clients
 *   - clinic_bucket_assignments: which bucket each clinic is on
 *   - special_pricing: conditional per-product overrides (limited time / single order / client-specific)
 *   - contract_templates: editable legal templates with merge fields
 *   - contracts: per-clinic signed instance with immutable PDF snapshot
 *   - signatures: client and Labb counter-signatures with IP + timestamp
 *   - email_invites: password-set magic links for onboarding clinic users
 *   - audit_log: append-only history of every pricing / contract / user change
 */

exports.up = async function up(knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('email').notNullable().unique();
    t.string('password_hash').notNullable();
    t.string('first_name');
    t.string('last_name');
    t.enu('role', ['admin', 'sales', 'legal', 'finance', 'client_admin', 'client_user'], {
      useNative: true,
      enumName: 'user_role',
    }).notNullable();
    t.uuid('client_id').nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('last_login_at');
    t.timestamps(true, true);
    t.index(['client_id']);
  });

  await knex.schema.createTable('clients', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name').notNullable();
    t.string('legal_name');
    t.string('ein');
    t.string('primary_contact_name');
    t.string('primary_contact_email');
    t.string('primary_contact_phone');
    t.text('address_line1');
    t.text('address_line2');
    t.string('city');
    t.string('state');
    t.string('postal_code');
    t.string('country').defaultTo('US');
    t.text('notes');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.schema.alterTable('users', (t) => {
    t.foreign('client_id').references('id').inTable('clients').onDelete('SET NULL');
  });

  await knex.schema.createTable('clinics', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE');
    t.string('name').notNullable();
    t.string('legal_name');
    t.string('ein');
    t.string('contact_name');
    t.string('contact_email');
    t.string('contact_phone');
    t.text('address_line1');
    t.text('address_line2');
    t.string('city');
    t.string('state');
    t.string('postal_code');
    t.string('country').defaultTo('US');
    t.text('notes');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.index(['client_id']);
  });

  await knex.schema.createTable('products', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name').notNullable();
    t.string('product_type');
    t.string('unit_of_measure');
    t.decimal('labb_cost', 12, 4).notNullable().defaultTo(0);
    t.text('description');
    t.text('notes');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('pricing_buckets', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name').notNullable();
    t.text('description');
    t.text('notes');
    t.uuid('copied_from_bucket_id').references('id').inTable('pricing_buckets').onDelete('SET NULL');
    t.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('bucket_items', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('bucket_id').notNullable().references('id').inTable('pricing_buckets').onDelete('CASCADE');
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('RESTRICT');
    t.decimal('unit_price', 12, 4).notNullable();
    t.decimal('total_price', 12, 4);
    t.text('notes');
    t.timestamps(true, true);
    t.unique(['bucket_id', 'product_id']);
    t.index(['bucket_id']);
  });

  await knex.schema.createTable('clinic_bucket_assignments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('clinic_id').notNullable().references('id').inTable('clinics').onDelete('CASCADE');
    t.uuid('bucket_id').notNullable().references('id').inTable('pricing_buckets').onDelete('RESTRICT');
    t.timestamp('assigned_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('unassigned_at');
    t.uuid('assigned_by').references('id').inTable('users').onDelete('SET NULL');
    t.text('notes');
    t.index(['clinic_id', 'unassigned_at']);
  });

  await knex.schema.createTable('special_pricing', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('clinic_id').notNullable().references('id').inTable('clinics').onDelete('CASCADE');
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('RESTRICT');
    t.decimal('unit_price', 12, 4).notNullable();
    t.decimal('total_price', 12, 4);
    t.enu('condition_type', ['time_limited', 'single_order', 'client_specific'], {
      useNative: true,
      enumName: 'special_pricing_condition',
    }).notNullable();
    t.timestamp('effective_from');
    t.timestamp('effective_until');
    t.integer('max_uses');
    t.integer('uses_count').notNullable().defaultTo(0);
    t.text('reason').notNullable();
    t.text('notes');
    t.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.index(['clinic_id', 'product_id', 'is_active']);
  });

  await knex.schema.createTable('contract_templates', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name').notNullable();
    t.integer('version').notNullable().defaultTo(1);
    t.text('body').notNullable();
    t.jsonb('merge_fields').notNullable().defaultTo('[]');
    t.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('contracts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('clinic_id').notNullable().references('id').inTable('clinics').onDelete('CASCADE');
    t.uuid('template_id').notNullable().references('id').inTable('contract_templates').onDelete('RESTRICT');
    t.uuid('bucket_id').references('id').inTable('pricing_buckets').onDelete('SET NULL');
    t.integer('template_version').notNullable();
    t.text('rendered_body').notNullable();
    t.jsonb('merge_values').notNullable().defaultTo('{}');
    t.jsonb('pricing_snapshot').notNullable().defaultTo('[]');
    t.enu('status', ['draft', 'sent', 'viewed', 'signed_by_client', 'counter_signed', 'active', 'terminated'], {
      useNative: true,
      enumName: 'contract_status',
    }).notNullable().defaultTo('draft');
    t.timestamp('sent_at');
    t.timestamp('first_viewed_at');
    t.timestamp('signed_by_client_at');
    t.timestamp('counter_signed_at');
    t.timestamp('activated_at');
    t.timestamp('terminated_at');
    t.text('termination_reason');
    t.string('pdf_path');
    t.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
    t.index(['clinic_id', 'status']);
  });

  await knex.schema.createTable('signatures', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('contract_id').notNullable().references('id').inTable('contracts').onDelete('CASCADE');
    t.enu('party', ['client', 'labb'], { useNative: true, enumName: 'signature_party' }).notNullable();
    t.uuid('signed_by_user_id').references('id').inTable('users').onDelete('SET NULL');
    t.string('signer_name').notNullable();
    t.string('signer_title');
    t.string('signer_email').notNullable();
    t.timestamp('signed_at').notNullable().defaultTo(knex.fn.now());
    t.string('ip_address');
    t.text('user_agent');
    t.index(['contract_id', 'party']);
  });

  await knex.schema.createTable('email_invites', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('email').notNullable();
    t.enu('role', ['admin', 'sales', 'legal', 'finance', 'client_admin', 'client_user'], {
      useNative: true,
      existingType: true,
      enumName: 'user_role',
    }).notNullable();
    t.uuid('client_id').references('id').inTable('clients').onDelete('CASCADE');
    t.string('token').notNullable().unique();
    t.timestamp('expires_at').notNullable();
    t.timestamp('accepted_at');
    t.uuid('invited_by').references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
    t.index(['token']);
  });

  await knex.schema.createTable('audit_log', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('actor_id').references('id').inTable('users').onDelete('SET NULL');
    t.string('actor_email');
    t.string('action').notNullable();
    t.string('entity_type').notNullable();
    t.uuid('entity_id');
    t.jsonb('before_state');
    t.jsonb('after_state');
    t.string('ip_address');
    t.text('notes');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['entity_type', 'entity_id']);
    t.index(['actor_id', 'created_at']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('audit_log');
  await knex.schema.dropTableIfExists('email_invites');
  await knex.schema.dropTableIfExists('signatures');
  await knex.schema.dropTableIfExists('contracts');
  await knex.schema.dropTableIfExists('contract_templates');
  await knex.schema.dropTableIfExists('special_pricing');
  await knex.schema.dropTableIfExists('clinic_bucket_assignments');
  await knex.schema.dropTableIfExists('bucket_items');
  await knex.schema.dropTableIfExists('pricing_buckets');
  await knex.schema.dropTableIfExists('products');
  await knex.schema.dropTableIfExists('clinics');
  await knex.schema.alterTable('users', (t) => t.dropForeign('client_id'));
  await knex.schema.dropTableIfExists('clients');
  await knex.schema.dropTableIfExists('users');
  await knex.raw('DROP TYPE IF EXISTS contract_status');
  await knex.raw('DROP TYPE IF EXISTS signature_party');
  await knex.raw('DROP TYPE IF EXISTS special_pricing_condition');
  await knex.raw('DROP TYPE IF EXISTS user_role');
};
