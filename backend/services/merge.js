const db = require('./../db/knex');
const { resolveEffectivePrice } = require('./pricing');

/**
 * Merge-field engine for contract templates.
 *
 * Syntax: {{field_name}}
 *
 * Standard fields (auto-populated from client/clinic/bucket):
 *   {{clinic_name}}          {{clinic_legal_name}}   {{clinic_ein}}
 *   {{clinic_address}}
 *   {{client_name}}          {{client_legal_name}}   {{client_ein}}
 *   {{client_address}}       {{client_contact_name}} {{client_contact_email}}
 *   {{bucket_name}}
 *   {{today}}                {{effective_date}}
 *
 * Special tokens (expanded to rendered blocks):
 *   {{pricing_table}}        — effective pricing table for this client
 *   {{signer_name}}          — left as placeholder, filled at sign time
 *   {{signer_title}}
 *   {{signer_email}}
 *   {{labb_signer_name}}     — filled at counter-sign time
 *   {{labb_signer_title}}
 *
 * Callers pass `extra` for any additional custom fields declared on the
 * template (template.merge_fields is an array of { key, label } objects).
 */

async function buildContext({ client, clinic, bucketId = null, extra = {} }) {
  const today = new Date();
  const todayStr = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const ctx = {
    clinic_name: clinic?.name || '',
    clinic_legal_name: clinic?.legal_name || clinic?.name || '',
    clinic_ein: clinic?.ein || '',
    clinic_address: formatAddress(clinic),
    client_name: client?.name || '',
    client_legal_name: client?.legal_name || client?.name || '',
    client_ein: client?.ein || '',
    client_address: formatAddress(client, { client: true }),
    client_contact_name: client?.contact_name || '',
    client_contact_email: client?.contact_email || '',
    today: todayStr,
    effective_date: todayStr,
    signer_name: '__SIGNER_NAME__',
    signer_title: '__SIGNER_TITLE__',
    signer_email: '__SIGNER_EMAIL__',
    labb_signer_name: '__LABB_SIGNER_NAME__',
    labb_signer_title: '__LABB_SIGNER_TITLE__',
    bucket_name: '',
    ...(extra || {}),
  };

  if (bucketId) {
    const bucket = await db('pricing_buckets').where({ id: bucketId }).first();
    ctx.bucket_name = bucket?.name || '';
  }

  return ctx;
}

function formatAddress(e, { client = false } = {}) {
  if (!e) return '';
  const line1 = client ? e.address_line1 : e.address_line1;
  const line2 = e.address_line2 || '';
  const cityLine = [e.city, e.state].filter(Boolean).join(', ');
  const full = [line1, line2, [cityLine, e.postal_code].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return full;
}

/**
 * Resolve the effective price list for a client, returning a structured
 * snapshot that can be frozen into contracts.pricing_snapshot and rendered
 * both as HTML (for display) and as plain text (for PDF).
 */
async function buildPricingSnapshot({ clientId }) {
  const products = await db('products').where({ is_active: true }).orderBy('name');
  const rows = [];
  for (const p of products) {
    const r = await resolveEffectivePrice({ clientId, productId: p.id });
    if (r.source === 'none') continue;
    rows.push({
      product_id: p.id,
      product_name: p.name,
      unit_of_measure: p.unit_of_measure,
      source: r.source,
      condition_type: r.condition_type || null,
      unit_price: r.unit_price,
      total_price: r.total_price,
      labb_cost: r.labb_cost,
      reason: r.reason || null,
    });
  }
  return rows;
}

function pricingTableToText(rows) {
  if (!rows || rows.length === 0) return 'No pricing in effect.';
  const headers = ['Product', 'UoM', 'Unit Price', 'Total'];
  const data = rows.map((r) => [
    r.product_name,
    r.unit_of_measure || '',
    `$${Number(r.unit_price).toFixed(4)}`,
    r.total_price != null ? `$${Number(r.total_price).toFixed(4)}` : '',
  ]);
  const widths = headers.map((h, i) => Math.max(h.length, ...data.map((d) => d[i].length)));
  const pad = (s, w) => s + ' '.repeat(Math.max(0, w - s.length));
  const line = (cells) => cells.map((c, i) => pad(c, widths[i])).join('  ');
  const sep = widths.map((w) => '-'.repeat(w)).join('  ');
  return [line(headers), sep, ...data.map(line)].join('\n');
}

function pricingTableToHtml(rows) {
  if (!rows || rows.length === 0) return '<p><em>No pricing in effect.</em></p>';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const head = '<tr><th>Product</th><th>UoM</th><th>Unit Price</th><th>Total</th></tr>';
  const body = rows.map((r) => `<tr>
    <td>${esc(r.product_name)}</td>
    <td>${esc(r.unit_of_measure || '')}</td>
    <td>$${Number(r.unit_price).toFixed(4)}</td>
    <td>${r.total_price != null ? '$' + Number(r.total_price).toFixed(4) : ''}</td>
  </tr>`).join('');
  return `<table class="pricing-table">${head}${body}</table>`;
}

/**
 * Render a template body with a context, expanding {{pricing_table}} specially.
 * Returns { text, pricingRows }.
 */
function renderTemplate({ body, context, pricingRows = null }) {
  let out = String(body || '');

  out = out.replace(/\{\{\s*pricing_table\s*\}\}/g, () =>
    pricingRows ? pricingTableToText(pricingRows) : '{{pricing_table}}',
  );

  out = out.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(context, key)) {
      return String(context[key] ?? '');
    }
    return match;
  });

  return out;
}

module.exports = {
  buildContext,
  buildPricingSnapshot,
  pricingTableToText,
  pricingTableToHtml,
  renderTemplate,
};
