/**
 * Inventory movement engine.
 *
 * Every change to stock goes through `applyMovement`, which (atomically):
 *   1. validates the movement for its kind,
 *   2. updates the affected `stock_levels` rows,
 *   3. writes an immutable `stock_movements` record.
 *
 * `stock_levels` is therefore always the running total of the movement log.
 */

/** Build an Error carrying an HTTP status + machine code for the error middleware. */
function badRequest(code, message) {
  const err = new Error(message || code);
  err.status = 400;
  err.code = code;
  return err;
}

const KINDS = ['receive', 'ship', 'adjust', 'transfer'];

/**
 * Add `delta` (may be negative) to one (item, warehouse) stock row.
 * Refuses to let stock go negative. Returns the resulting quantity.
 */
async function adjustStock(trx, itemId, warehouseId, delta) {
  const existing = await trx('stock_levels')
    .where({ item_id: itemId, warehouse_id: warehouseId })
    .first();

  const current = existing ? existing.quantity : 0;
  const next = current + delta;
  if (next < 0) {
    throw badRequest(
      'insufficient_stock',
      `Not enough stock: have ${current}, need ${-delta}`,
    );
  }

  if (existing) {
    await trx('stock_levels')
      .where({ id: existing.id })
      .update({ quantity: next, updated_at: trx.fn.now() });
  } else {
    await trx('stock_levels').insert({
      item_id: itemId,
      warehouse_id: warehouseId,
      quantity: next,
    });
  }
  return next;
}

/**
 * Apply a single movement.
 *
 * @param {import('knex').Knex|import('knex').Knex.Transaction} db
 * @param {object} mv
 * @param {number} mv.item_id
 * @param {'receive'|'ship'|'adjust'|'transfer'} mv.kind
 * @param {number} [mv.from_warehouse_id]
 * @param {number} [mv.to_warehouse_id]
 * @param {number} mv.quantity  positive for receive/ship/transfer; signed for adjust
 * @param {string} [mv.note]
 * @returns {Promise<object>} the inserted stock_movements row
 */
async function applyMovement(db, mv) {
  const run = (trx) => applyMovementInTrx(trx, mv);
  return db.isTransaction ? run(db) : db.transaction(run);
}

async function applyMovementInTrx(trx, mv) {
  const { item_id, kind, from_warehouse_id, to_warehouse_id, quantity, note } = mv;

  if (!KINDS.includes(kind)) throw badRequest('invalid_kind', `Unknown kind: ${kind}`);

  const item = await trx('items').where({ id: item_id }).first();
  if (!item) throw badRequest('item_not_found', 'Item does not exist');

  // Validate referenced warehouses exist.
  const checkWarehouse = async (id, label) => {
    if (id == null) return;
    const w = await trx('warehouses').where({ id }).first();
    if (!w) throw badRequest('warehouse_not_found', `${label} warehouse does not exist`);
  };
  await checkWarehouse(from_warehouse_id, 'Source');
  await checkWarehouse(to_warehouse_id, 'Destination');

  let signedQty; // stored on the movement record
  switch (kind) {
    case 'receive': {
      if (!to_warehouse_id) throw badRequest('missing_destination', 'receive needs a destination warehouse');
      if (!(quantity > 0)) throw badRequest('invalid_quantity', 'receive quantity must be positive');
      await adjustStock(trx, item_id, to_warehouse_id, quantity);
      signedQty = quantity;
      break;
    }
    case 'ship': {
      if (!from_warehouse_id) throw badRequest('missing_source', 'ship needs a source warehouse');
      if (!(quantity > 0)) throw badRequest('invalid_quantity', 'ship quantity must be positive');
      await adjustStock(trx, item_id, from_warehouse_id, -quantity);
      signedQty = -quantity;
      break;
    }
    case 'adjust': {
      if (!to_warehouse_id) throw badRequest('missing_destination', 'adjust needs a warehouse');
      if (!Number.isInteger(quantity) || quantity === 0) {
        throw badRequest('invalid_quantity', 'adjust quantity must be a non-zero integer (+/-)');
      }
      await adjustStock(trx, item_id, to_warehouse_id, quantity);
      signedQty = quantity;
      break;
    }
    case 'transfer': {
      if (!from_warehouse_id || !to_warehouse_id) {
        throw badRequest('missing_warehouse', 'transfer needs both source and destination');
      }
      if (from_warehouse_id === to_warehouse_id) {
        throw badRequest('same_warehouse', 'transfer source and destination must differ');
      }
      if (!(quantity > 0)) throw badRequest('invalid_quantity', 'transfer quantity must be positive');
      await adjustStock(trx, item_id, from_warehouse_id, -quantity);
      await adjustStock(trx, item_id, to_warehouse_id, quantity);
      signedQty = quantity;
      break;
    }
    default:
      throw badRequest('invalid_kind', `Unknown kind: ${kind}`);
  }

  const [row] = await trx('stock_movements')
    .insert({
      item_id,
      kind,
      from_warehouse_id: from_warehouse_id ?? null,
      to_warehouse_id: to_warehouse_id ?? null,
      quantity: signedQty,
      note: note ?? null,
    })
    .returning('*');
  return row;
}

module.exports = { applyMovement, adjustStock, badRequest, KINDS };
