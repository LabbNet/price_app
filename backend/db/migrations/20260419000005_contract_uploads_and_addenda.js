/**
 * Allow uploading existing PDF contracts (not all contracts are template-
 * generated) and log addenda when active contracts change over time.
 *
 * Changes to `contracts`:
 *   - template_id / rendered_body become nullable (uploaded contracts have no
 *     template and their body lives in the attached PDF)
 *   - new `source` column: 'template' (default) | 'uploaded'
 *   - new `title` column so uploaded contracts can be labeled
 *
 * New table `contract_addenda`:
 *   - Per-contract numbered amendments (title, description, effective_date)
 *   - Either a generated body OR an uploaded PDF (or both)
 *   - Optional pricing_snapshot for pricing-change addenda
 *   - Stores previous_body + previous_pricing_snapshot for audit/compare
 *   - Signer metadata for recording wet or in-app signatures
 */

exports.up = async function up(knex) {
  await knex.schema.alterTable('contracts', (t) => {
    t.string('source').notNullable().defaultTo('template');
    t.string('title');
  });

  await knex.raw('ALTER TABLE contracts ALTER COLUMN template_id DROP NOT NULL');
  await knex.raw('ALTER TABLE contracts ALTER COLUMN rendered_body DROP NOT NULL');
  await knex.raw('ALTER TABLE contracts ALTER COLUMN template_version DROP NOT NULL');

  await knex.schema.createTable('contract_addenda', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('contract_id').notNullable().references('id').inTable('contracts').onDelete('CASCADE');
    t.integer('addendum_number').notNullable();
    t.string('title').notNullable();
    t.text('description');
    t.string('change_type'); // 'pricing_change' | 'scope_change' | 'renewal' | 'termination' | 'other'
    t.date('effective_date');
    t.string('source').notNullable().defaultTo('generated'); // 'generated' | 'uploaded'
    t.text('body');
    t.string('pdf_path');
    t.jsonb('pricing_snapshot');
    t.jsonb('previous_pricing_snapshot');
    t.text('previous_body');
    t.string('signer_name');
    t.string('signer_title');
    t.string('signer_email');
    t.timestamp('signed_at');
    t.string('ip_address');
    t.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
    t.unique(['contract_id', 'addendum_number']);
    t.index(['contract_id']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('contract_addenda');

  await knex.raw("UPDATE contracts SET template_version = 0 WHERE template_version IS NULL");
  await knex.raw("UPDATE contracts SET rendered_body = '' WHERE rendered_body IS NULL");
  await knex.raw('ALTER TABLE contracts ALTER COLUMN template_version SET NOT NULL');
  await knex.raw('ALTER TABLE contracts ALTER COLUMN rendered_body SET NOT NULL');
  // Can't easily re-NOT-NULL template_id if there are uploaded rows; delete uploaded rows first.
  await knex.raw("DELETE FROM contracts WHERE source = 'uploaded'");
  await knex.raw('ALTER TABLE contracts ALTER COLUMN template_id SET NOT NULL');

  await knex.schema.alterTable('contracts', (t) => {
    t.dropColumn('title');
    t.dropColumn('source');
  });
};
