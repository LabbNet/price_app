/**
 * Groundwork for the client portal.
 *
 * - Add 'client_user' enum value so individual clients (not just parent
 *   clinics) can have their own logins. Role semantics going forward:
 *     clinic_admin — parent-org admin, scoped to clinic_id, sees every
 *                    client under that clinic
 *     clinic_user  — general parent-org user (reserved, same scope as admin
 *                    without write access in v1)
 *     client_user  — individual client-location user, scoped to client_id,
 *                    sees only their own location's pricing + contracts
 *
 * - Add clinic_id to email_invites so we can invite a clinic_admin whose
 *   record needs to point at a parent clinic rather than a client.
 */

exports.up = async function up(knex) {
  await knex.raw("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'client_user'");

  await knex.schema.alterTable('email_invites', (t) => {
    t.uuid('clinic_id').references('id').inTable('clinics').onDelete('CASCADE');
    t.index(['clinic_id']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('email_invites', (t) => {
    t.dropColumn('clinic_id');
  });
  // Postgres does not support DROP VALUE on an enum; leave 'client_user'
  // in place on rollback. Re-running `up` is a no-op thanks to IF NOT EXISTS.
};
