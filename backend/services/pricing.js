const db = require('../db/knex');

/**
 * Resolve the currently-effective price for (client, product).
 *
 * Precedence:
 *   1. Active special_pricing that applies NOW (highest-priority row wins):
 *        - condition_type = single_order: active && uses_count < COALESCE(max_uses, 1)
 *        - condition_type = time_limited: active && now in [effective_from, effective_until]
 *        - condition_type = clinic_specific: active, no date/use bounds
 *      Preference order within specials: single_order > time_limited > clinic_specific,
 *      then newest created_at wins if multiple tie.
 *   2. Current bucket assignment's bucket_items row for this product.
 *   3. No price → returns source=none.
 */
async function resolveEffectivePrice({ clientId, productId, trx = db }) {
  const product = await trx('products').where({ id: productId }).first();
  if (!product) return { source: 'none', error: 'product_not_found' };

  const now = trx.fn.now();

  // Find an applicable special pricing row, if any.
  const special = await trx('special_pricing')
    .where({ client_id: clientId, product_id: productId, is_active: true })
    .andWhere((q) =>
      q
        .where((inner) =>
          inner
            .where('condition_type', 'single_order')
            .andWhereRaw('uses_count < COALESCE(max_uses, 1)'),
        )
        .orWhere((inner) =>
          inner
            .where('condition_type', 'time_limited')
            .andWhere((dr) =>
              dr
                .whereNull('effective_from')
                .orWhere('effective_from', '<=', now),
            )
            .andWhere((dr) =>
              dr
                .whereNull('effective_until')
                .orWhere('effective_until', '>=', now),
            ),
        )
        .orWhere({ condition_type: 'clinic_specific' }),
    )
    .orderByRaw(`
      CASE condition_type
        WHEN 'single_order' THEN 1
        WHEN 'time_limited' THEN 2
        WHEN 'clinic_specific' THEN 3
      END
    `)
    .orderBy('created_at', 'desc')
    .first();

  if (special) {
    return {
      source: 'special',
      special_pricing_id: special.id,
      condition_type: special.condition_type,
      unit_price: Number(special.unit_price),
      total_price: special.total_price != null ? Number(special.total_price) : null,
      labb_cost: Number(product.labb_cost),
      effective_from: special.effective_from,
      effective_until: special.effective_until,
      max_uses: special.max_uses,
      uses_count: special.uses_count,
      reason: special.reason,
    };
  }

  // Fall through to the client's currently-assigned bucket.
  const bucketItem = await trx('bucket_items as bi')
    .join('client_bucket_assignments as cba', 'cba.bucket_id', 'bi.bucket_id')
    .where('cba.client_id', clientId)
    .whereNull('cba.unassigned_at')
    .andWhere('bi.product_id', productId)
    .select('bi.unit_price', 'bi.total_price', 'bi.notes', 'cba.bucket_id')
    .first();

  if (bucketItem) {
    return {
      source: 'bucket',
      bucket_id: bucketItem.bucket_id,
      unit_price: Number(bucketItem.unit_price),
      total_price: bucketItem.total_price != null ? Number(bucketItem.total_price) : null,
      labb_cost: Number(product.labb_cost),
      notes: bucketItem.notes,
    };
  }

  return { source: 'none', labb_cost: Number(product.labb_cost) };
}

module.exports = { resolveEffectivePrice };
