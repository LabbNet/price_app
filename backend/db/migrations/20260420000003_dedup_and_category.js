/**
 * Account dedup + Standard-account category/subcategory.
 *
 * 1. `duplicate_review_queue` — pairs of clinics with a partial (3/4)
 *    address match that a staff user needs to review. Status flows
 *    pending → (skipped | resolved). "Skipped" just means the next
 *    staff user who opens the queue will see it again.
 *
 * 2. clinics.category + clinics.subcategory (strings, nullable) —
 *    used only for Standard accounts. Category is one of Employment,
 *    Corrections, Treatment, Education. Subcategory is only populated
 *    when category = Employment.
 */

exports.up = async function up(knex) {
  await knex.schema.alterTable('clinics', (t) => {
    t.string('category');
    t.string('subcategory');
    t.index(['category']);
  });

  await knex.schema.createTable('duplicate_review_queue', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    // clinic_a = older (kept by default), clinic_b = newer (candidate to delete)
    t.uuid('clinic_a_id').notNullable().references('id').inTable('clinics').onDelete('CASCADE');
    t.uuid('clinic_b_id').notNullable().references('id').inTable('clinics').onDelete('CASCADE');
    t.integer('match_score').notNullable(); // out of 4 address fields
    t.string('status').notNullable().defaultTo('pending'); // pending | resolved | skipped
    t.uuid('resolved_by').references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('resolved_at');
    t.text('resolution_notes');
    t.timestamps(true, true);
    t.index(['status']);
    t.unique(['clinic_a_id', 'clinic_b_id']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('duplicate_review_queue');
  await knex.schema.alterTable('clinics', (t) => {
    t.dropColumn('subcategory');
    t.dropColumn('category');
  });
};
