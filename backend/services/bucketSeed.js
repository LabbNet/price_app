const db = require('../db/knex');

/**
 * Fill a bucket with every active product at MSRP (0 if no MSRP is set).
 * Products already present in the bucket are left alone — callers can
 * use this both at bucket creation and later to top-up a bucket after
 * new products are added to the catalog.
 *
 * All items are inserted with is_enabled = true so pricing is visible
 * in the portal immediately — staff can flip individual items off if
 * they need to hide a specific product from a bucket.
 *
 * Returns the number of items actually inserted.
 */
async function seedBucketWithAllProducts(bucketId, { trx = db } = {}) {
  const products = await trx('products').where({ is_active: true }).select('id', 'msrp');
  if (products.length === 0) return 0;

  const existing = await trx('bucket_items').where({ bucket_id: bucketId }).select('product_id');
  const existingIds = new Set(existing.map((e) => e.product_id));

  const toInsert = products
    .filter((p) => !existingIds.has(p.id))
    .map((p) => ({
      bucket_id: bucketId,
      product_id: p.id,
      unit_price: p.msrp != null ? Number(p.msrp) : 0,
      total_price: null,
      notes: null,
      is_enabled: true,
    }));

  if (toInsert.length === 0) return 0;
  await trx('bucket_items').insert(toInsert);
  return toInsert.length;
}

/**
 * Add a single product to every active bucket at its MSRP (or 0). Used
 * when a new product is added to the catalog so buckets stay complete.
 */
async function addProductToAllBuckets(productId, { trx = db } = {}) {
  const product = await trx('products').where({ id: productId }).first();
  if (!product) return 0;

  const buckets = await trx('pricing_buckets').where({ is_active: true }).select('id');
  if (buckets.length === 0) return 0;

  const existing = await trx('bucket_items')
    .whereIn('bucket_id', buckets.map((b) => b.id))
    .andWhere({ product_id: productId })
    .select('bucket_id');
  const existingBucketIds = new Set(existing.map((e) => e.bucket_id));

  const toInsert = buckets
    .filter((b) => !existingBucketIds.has(b.id))
    .map((b) => ({
      bucket_id: b.id,
      product_id: productId,
      unit_price: product.msrp != null ? Number(product.msrp) : 0,
      total_price: null,
      notes: null,
      is_enabled: true,
    }));

  if (toInsert.length === 0) return 0;
  await trx('bucket_items').insert(toInsert);
  return toInsert.length;
}

module.exports = { seedBucketWithAllProducts, addProductToAllBuckets };
