/**
 * Adds signing tokens to contracts so clients can sign via an emailed magic
 * link without needing a pre-existing account. Also adds clinic_id to users
 * so future clinic logins can be scoped to a specific clinic.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('contracts', (t) => {
    t.string('signing_token').unique();
    t.timestamp('signing_token_expires_at');
  });

  await knex.schema.alterTable('users', (t) => {
    t.uuid('clinic_id').references('id').inTable('clinics').onDelete('SET NULL');
    t.index(['clinic_id']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('clinic_id');
  });
  await knex.schema.alterTable('contracts', (t) => {
    t.dropColumn('signing_token');
    t.dropColumn('signing_token_expires_at');
  });
};
