/**
 * Add SKU and MSRP to products. Both are optional — SKU is a free-form
 * identifier (no uniqueness constraint), MSRP is the suggested retail
 * alongside the existing labb_cost (cost of goods).
 */

exports.up = async function up(knex) {
  await knex.schema.alterTable('products', (t) => {
    t.string('sku', 64);
    t.decimal('msrp', 12, 4);
    t.index(['sku']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('products', (t) => {
    t.dropIndex(['sku']);
    t.dropColumn('msrp');
    t.dropColumn('sku');
  });
};
