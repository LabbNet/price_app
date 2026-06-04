/**
 * Initial inventory schema.
 *
 *   warehouses      — stock locations
 *   items           — the catalog of things stocked
 *   stock_levels    — quantity on hand per (item, warehouse)
 *   stock_movements — immutable log of every stock change
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('warehouses', (t) => {
    t.increments('id').primary();
    t.string('code', 32).notNullable().unique();
    t.string('name', 200).notNullable();
    t.string('address', 500);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('items', (t) => {
    t.increments('id').primary();
    t.string('sku', 64).notNullable().unique();
    t.string('name', 200).notNullable();
    t.string('unit', 50).notNullable().defaultTo('each');
    t.integer('reorder_point').notNullable().defaultTo(0);
    t.string('notes', 1000);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('stock_levels', (t) => {
    t.increments('id').primary();
    t.integer('item_id').notNullable().references('id').inTable('items').onDelete('CASCADE');
    t.integer('warehouse_id').notNullable().references('id').inTable('warehouses').onDelete('CASCADE');
    t.integer('quantity').notNullable().defaultTo(0);
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['item_id', 'warehouse_id']);
  });

  await knex.schema.createTable('stock_movements', (t) => {
    t.increments('id').primary();
    t.integer('item_id').notNullable().references('id').inTable('items').onDelete('CASCADE');
    // receive | ship | adjust | transfer
    t.string('kind', 20).notNullable();
    t.integer('from_warehouse_id').references('id').inTable('warehouses').onDelete('SET NULL');
    t.integer('to_warehouse_id').references('id').inTable('warehouses').onDelete('SET NULL');
    // Signed quantity actually applied (e.g. adjust can be negative).
    t.integer('quantity').notNullable();
    t.string('note', 500);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['item_id']);
    t.index(['created_at']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('stock_movements');
  await knex.schema.dropTableIfExists('stock_levels');
  await knex.schema.dropTableIfExists('items');
  await knex.schema.dropTableIfExists('warehouses');
};
