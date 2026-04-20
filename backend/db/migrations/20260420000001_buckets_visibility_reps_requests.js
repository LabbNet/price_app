/**
 * Three related changes:
 *
 * 1. bucket_items.is_enabled — per-line visibility to clients. Default OFF,
 *    so products added to a bucket aren't visible in the portal until a
 *    staff user flips them on. Existing rows also set to false so the new
 *    rule is applied uniformly.
 *
 * 2. clinics.sales_rep_id — every clinic has a Labb sales rep (an admin
 *    user). Nullable at the DB level so existing clinics don't fail the
 *    migration; enforced required on create in the API.
 *
 * 3. price_requests — new table capturing "request price" clicks from the
 *    client portal when a product is currently disabled for them. Labb
 *    responds by enabling the product and/or replying with a note.
 */

exports.up = async function up(knex) {
  // 1. bucket_items.is_enabled
  await knex.schema.alterTable('bucket_items', (t) => {
    t.boolean('is_enabled').notNullable().defaultTo(false);
  });
  // Explicitly flip any existing rows off — enforces the new default rule.
  await knex('bucket_items').update({ is_enabled: false });

  // 2. clinics.sales_rep_id
  await knex.schema.alterTable('clinics', (t) => {
    t.uuid('sales_rep_id').references('id').inTable('users').onDelete('SET NULL');
    t.index(['sales_rep_id']);
  });

  // 3. price_requests
  await knex.schema.createTable('price_requests', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE');
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('RESTRICT');
    t.uuid('requested_by').references('id').inTable('users').onDelete('SET NULL');
    t.text('message');
    t.enu('status', ['open', 'responded', 'dismissed'], {
      useNative: true,
      enumName: 'price_request_status',
    }).notNullable().defaultTo('open');
    t.timestamp('responded_at');
    t.uuid('responded_by').references('id').inTable('users').onDelete('SET NULL');
    t.text('response_note');
    t.timestamps(true, true);
    t.index(['client_id', 'status']);
    t.index(['product_id']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('price_requests');
  await knex.raw('DROP TYPE IF EXISTS price_request_status');

  await knex.schema.alterTable('clinics', (t) => {
    t.dropColumn('sales_rep_id');
  });

  await knex.schema.alterTable('bucket_items', (t) => {
    t.dropColumn('is_enabled');
  });
};
