/**
 * Flip bucket_items.is_enabled DEFAULT to true and turn on every existing
 * row, so pricing is visible to the portal without the per-row toggling
 * step. Buckets remain optional — a clinic / client without a bucket
 * assignment now falls back to product MSRP in the pricing resolver
 * (that fallback lives in services/pricing.js, not the DB).
 */

exports.up = async function up(knex) {
  await knex.raw('ALTER TABLE bucket_items ALTER COLUMN is_enabled SET DEFAULT true');
  await knex('bucket_items').update({ is_enabled: true });
};

exports.down = async function down(knex) {
  await knex.raw('ALTER TABLE bucket_items ALTER COLUMN is_enabled SET DEFAULT false');
  // Don't flip the rows back — that'd clobber manual user state.
};
