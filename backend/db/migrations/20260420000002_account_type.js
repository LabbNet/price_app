/**
 * Every "clinic" row is now an Account that's either PRO or Standard.
 *   PRO      — has one or more clients underneath (current model)
 *   Standard — is the end-user directly; no clients underneath
 *
 * DB table names stay as-is (clinics, clients) to avoid another rename;
 * the UI labels this entity as "Account". Account type can be toggled
 * freely — it's enforced in the UI, not at the DB level.
 */

exports.up = async function up(knex) {
  await knex.raw(`
    CREATE TYPE account_type AS ENUM ('pro', 'standard');
  `);
  await knex.schema.alterTable('clinics', (t) => {
    t.specificType('account_type', 'account_type').notNullable().defaultTo('pro');
    t.index(['account_type']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('clinics', (t) => {
    t.dropColumn('account_type');
  });
  await knex.raw(`DROP TYPE IF EXISTS account_type`);
};
