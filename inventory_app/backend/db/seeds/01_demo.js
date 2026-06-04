/**
 * Demo data — a couple of warehouses, a few items, and some opening stock.
 * Idempotent-ish: clears the tables first so re-running gives a clean slate.
 */
const { applyMovement } = require('../../services/inventory');

exports.seed = async function seed(knex) {
  await knex('stock_movements').del();
  await knex('stock_levels').del();
  await knex('items').del();
  await knex('warehouses').del();

  const warehouses = await knex('warehouses')
    .insert([
      { code: 'MAIN', name: 'Main Warehouse', address: '100 Industrial Way' },
      { code: 'EAST', name: 'East Distribution', address: '55 Harbor Rd' },
    ])
    .returning('id');
  const [main, east] = warehouses.map((w) => (typeof w === 'object' ? w.id : w));

  const items = await knex('items')
    .insert([
      { sku: 'WID-001', name: 'Standard Widget', unit: 'each', reorder_point: 20 },
      { sku: 'GAD-002', name: 'Deluxe Gadget', unit: 'each', reorder_point: 10 },
      { sku: 'BOX-100', name: 'Shipping Box (large)', unit: 'each', reorder_point: 50 },
    ])
    .returning('id');
  const [widget, gadget, box] = items.map((i) => (typeof i === 'object' ? i.id : i));

  // Opening stock via receive movements so the movement log is consistent.
  await applyMovement(knex, { item_id: widget, kind: 'receive', to_warehouse_id: main, quantity: 120, note: 'Opening stock' });
  await applyMovement(knex, { item_id: gadget, kind: 'receive', to_warehouse_id: main, quantity: 8, note: 'Opening stock' });
  await applyMovement(knex, { item_id: box, kind: 'receive', to_warehouse_id: main, quantity: 200, note: 'Opening stock' });
  await applyMovement(knex, { item_id: widget, kind: 'receive', to_warehouse_id: east, quantity: 40, note: 'Opening stock' });
  await applyMovement(knex, { item_id: widget, kind: 'transfer', from_warehouse_id: main, to_warehouse_id: east, quantity: 30, note: 'Rebalance' });
};
