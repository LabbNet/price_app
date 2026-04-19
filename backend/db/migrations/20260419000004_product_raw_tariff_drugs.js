/**
 * Add raw_cost + tariff to products, and rename the description column
 * to drugs_and_levels (products only — the buckets.description column
 * stays as it is).
 */

exports.up = async function up(knex) {
  await knex.schema.alterTable('products', (t) => {
    t.decimal('raw_cost', 12, 4);
    t.decimal('tariff', 12, 4);
  });
  await knex.raw('ALTER TABLE products RENAME COLUMN description TO drugs_and_levels');
};

exports.down = async function down(knex) {
  await knex.raw('ALTER TABLE products RENAME COLUMN drugs_and_levels TO description');
  await knex.schema.alterTable('products', (t) => {
    t.dropColumn('tariff');
    t.dropColumn('raw_cost');
  });
};
