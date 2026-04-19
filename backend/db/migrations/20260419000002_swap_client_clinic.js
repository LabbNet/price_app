/**
 * Swaps the "client" and "clinic" terminology throughout the schema.
 *
 * Semantic change:
 *   parent entity: was `clients`, now `clinics`
 *   child entity:  was `clinics`, now `clients`
 *
 * All FK columns are renamed accordingly, plus the role enum values
 * (client_admin → clinic_admin, client_user → clinic_user).
 *
 * PostgreSQL auto-updates FKs when tables are renamed, so FK integrity
 * survives the rename.
 */

exports.up = async function up(knex) {
  // 1) Rename parent/child tables — needs a temp name to avoid collision.
  await knex.raw('ALTER TABLE clients RENAME TO __swap_parents');
  await knex.raw('ALTER TABLE clinics RENAME TO clients');
  await knex.raw('ALTER TABLE __swap_parents RENAME TO clinics');

  // 2) Rename FK column in the (new) clients table: was `client_id` → `clinic_id`
  await knex.raw('ALTER TABLE clients RENAME COLUMN client_id TO clinic_id');

  // 3) Rename FK columns in other tables that pointed to the old `clinics` (child),
  //    which is now `clients`. Column should be `client_id`.
  await knex.raw('ALTER TABLE contracts RENAME COLUMN clinic_id TO client_id');
  await knex.raw('ALTER TABLE special_pricing RENAME COLUMN clinic_id TO client_id');

  // 4) Rename the clinic_bucket_assignments table + its FK column.
  await knex.raw('ALTER TABLE clinic_bucket_assignments RENAME COLUMN clinic_id TO client_id');
  await knex.raw('ALTER TABLE clinic_bucket_assignments RENAME TO client_bucket_assignments');

  // 5) Swap users.client_id and users.clinic_id.
  //    Old: users.client_id FK → old clients (parent, now clinics)  → should become users.clinic_id
  //    Old: users.clinic_id FK → old clinics (child, now clients)   → should become users.client_id
  //    Use a temp column name to perform the swap.
  await knex.raw('ALTER TABLE users RENAME COLUMN client_id TO __swap_cid');
  await knex.raw('ALTER TABLE users RENAME COLUMN clinic_id TO client_id');
  await knex.raw('ALTER TABLE users RENAME COLUMN __swap_cid TO clinic_id');

  // 6) Rename role enum values to match the new vocabulary.
  await knex.raw("ALTER TYPE user_role RENAME VALUE 'client_admin' TO '__swap_ca'");
  await knex.raw("ALTER TYPE user_role RENAME VALUE 'client_user' TO 'clinic_user'");
  await knex.raw("ALTER TYPE user_role RENAME VALUE '__swap_ca' TO 'clinic_admin'");
};

exports.down = async function down(knex) {
  // Reverse order.
  await knex.raw("ALTER TYPE user_role RENAME VALUE 'clinic_admin' TO '__swap_ca'");
  await knex.raw("ALTER TYPE user_role RENAME VALUE 'clinic_user' TO 'client_user'");
  await knex.raw("ALTER TYPE user_role RENAME VALUE '__swap_ca' TO 'client_admin'");

  await knex.raw('ALTER TABLE users RENAME COLUMN client_id TO __swap_cid');
  await knex.raw('ALTER TABLE users RENAME COLUMN clinic_id TO client_id');
  await knex.raw('ALTER TABLE users RENAME COLUMN __swap_cid TO clinic_id');

  await knex.raw('ALTER TABLE client_bucket_assignments RENAME TO clinic_bucket_assignments');
  await knex.raw('ALTER TABLE clinic_bucket_assignments RENAME COLUMN client_id TO clinic_id');

  await knex.raw('ALTER TABLE special_pricing RENAME COLUMN client_id TO clinic_id');
  await knex.raw('ALTER TABLE contracts RENAME COLUMN client_id TO clinic_id');

  await knex.raw('ALTER TABLE clients RENAME COLUMN clinic_id TO client_id');

  await knex.raw('ALTER TABLE clients RENAME TO __swap_parents');
  await knex.raw('ALTER TABLE clinics RENAME TO clients');
  await knex.raw('ALTER TABLE __swap_parents RENAME TO clinics');
};
