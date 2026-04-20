import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch } from '../api';
import CsvImportModal from '../components/CsvImportModal';

const emptyForm = {
  name: '',
  sku: '',
  product_type: '',
  unit_of_measure: '',
  raw_cost: '',
  tariff: '',
  labb_cost: '',
  msrp: '',
  drugs_and_levels: '',
  notes: '',
};

const PRODUCT_CSV_HEADERS = [
  { key: 'name' },
  { key: 'sku', hint: 'optional identifier' },
  { key: 'product_type' },
  { key: 'unit_of_measure', hint: 'each, case, etc.' },
  { key: 'raw_cost', hint: 'decimal, raw cost' },
  { key: 'tariff', hint: 'decimal, tariff amount' },
  { key: 'labb_cost', hint: 'decimal, total Labb cost per unit' },
  { key: 'msrp', hint: 'decimal, suggested retail' },
  { key: 'drugs_and_levels', hint: 'drugs tested + cutoffs' },
  { key: 'notes' },
];

export default function Products() {
  const qc = useQueryClient();
  const [includeInactive, setIncludeInactive] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  // The filter derived values are computed below, after the query resolves.
  const [editing, setEditing] = useState(null); // null | 'new' | product
  const [importing, setImporting] = useState(false);

  const list = useQuery({
    queryKey: ['products', includeInactive],
    queryFn: () => apiGet(`/api/products${includeInactive ? '?include_inactive=true' : ''}`),
  });

  const save = useMutation({
    mutationFn: (payload) =>
      payload.id
        ? apiPatch(`/api/products/${payload.id}`, payload.data)
        : apiPost('/api/products', payload.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      setEditing(null);
    },
  });

  const importCsv = useMutation({
    mutationFn: (products) => apiPost('/api/products/import', { products, mode: 'update_existing' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });

  const toggle = useMutation({
    mutationFn: ({ id, active }) =>
      active ? apiPost(`/api/products/${id}/deactivate`) : apiPost(`/api/products/${id}/activate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });

  return (
    <div className="shell">
      <div className="row-between">
        <h1>Products</h1>
        <div className="row gap">
          <label className="row gap muted">
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            Show inactive
          </label>
          <button className="btn ghost" onClick={() => setImporting(true)}>Import CSV</button>
          <button className="btn primary" onClick={() => setEditing('new')}>+ New product</button>
        </div>
      </div>

      {list.isLoading && <p className="muted">Loading…</p>}
      {list.isError && <p className="error">{String(list.error.message || list.error)}</p>}

      {list.data && <ProductsView
        products={list.data.products}
        typeFilter={typeFilter}
        onTypeFilter={setTypeFilter}
        onEdit={setEditing}
        onToggle={(p) => toggle.mutate({ id: p.id, active: p.is_active })}
      />}

      {editing && (
        <ProductForm
          initial={editing === 'new' ? emptyForm : editing}
          onCancel={() => setEditing(null)}
          onSubmit={(data) => save.mutate({ id: editing !== 'new' ? editing.id : undefined, data })}
          busy={save.isPending}
          error={save.error}
        />
      )}

      {importing && (
        <CsvImportModal
          title="Import products from CSV"
          description="New products are created. Existing products (matched by name, case-insensitive) have their cost and details updated."
          templateHeaders={PRODUCT_CSV_HEADERS}
          templateFilename="products-template.csv"
          parseRow={(r) => ({
            name: r.name || '',
            sku: r.sku || null,
            product_type: r.product_type || null,
            unit_of_measure: r.unit_of_measure || null,
            raw_cost: r.raw_cost ?? '',
            tariff: r.tariff ?? '',
            labb_cost: r.labb_cost ?? '',
            msrp: r.msrp ?? '',
            drugs_and_levels: r.drugs_and_levels || r.description || null,
            notes: r.notes || null,
          })}
          previewColumns={[
            { key: 'name', label: 'Name' },
            { key: 'sku', label: 'SKU' },
            { key: 'labb_cost', label: 'Labb cost' },
            { key: 'msrp', label: 'MSRP' },
            { key: 'drugs_and_levels', label: 'Drugs & levels' },
          ]}
          onCancel={() => { setImporting(false); importCsv.reset(); }}
          onSubmit={(rows) => importCsv.mutate(rows)}
          busy={importCsv.isPending}
          error={importCsv.error}
          result={importCsv.data}
          renderResult={(r) => (
            <p className="muted">
              ✓ Created {r.created.length}, updated {r.updated.length}, skipped {r.skipped.length}.
            </p>
          )}
        />
      )}
    </div>
  );
}

function ProductsView({ products, typeFilter, onTypeFilter, onEdit, onToggle }) {
  const productTypes = Array.from(new Set(products.map((p) => p.product_type).filter(Boolean))).sort();
  const hasUntyped = products.some((p) => !p.product_type);
  const filtered = products.filter((p) => {
    if (typeFilter === '__none__') return !p.product_type;
    if (typeFilter !== 'all') return p.product_type === typeFilter;
    return true;
  });

  return (
    <>
      <div className="card">
        <div className="row gap" style={{ flexWrap: 'wrap' }}>
          <select value={typeFilter} onChange={(e) => onTypeFilter(e.target.value)}>
            <option value="all">All types</option>
            {productTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            {hasUntyped && <option value="__none__">(no type)</option>}
          </select>
          <span className="muted small">{filtered.length} of {products.length} products</span>
        </div>
      </div>
      <div className="card no-pad">
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>SKU</th>
              <th>Type</th>
              <th>UoM</th>
              <th className="num">Raw</th>
              <th className="num">Tariff</th>
              <th className="num">Labb cost</th>
              <th className="num">MSRP</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="muted center">
                {products.length === 0 ? 'No products yet.' : 'No products match this filter.'}
              </td></tr>
            )}
            {filtered.map((p) => (
              <tr key={p.id} className={p.is_active ? '' : 'dim'}>
                <td>
                  <strong>{p.name}</strong>
                  {p.drugs_and_levels && <div className="muted small">{p.drugs_and_levels}</div>}
                </td>
                <td className="small"><code>{p.sku || <span className="muted">—</span>}</code></td>
                <td>{p.product_type || <span className="muted">—</span>}</td>
                <td>{p.unit_of_measure || <span className="muted">—</span>}</td>
                <td className="num muted">{p.raw_cost != null ? `$${Number(p.raw_cost).toFixed(4)}` : '—'}</td>
                <td className="num muted">{p.tariff != null ? `$${Number(p.tariff).toFixed(4)}` : '—'}</td>
                <td className="num">${Number(p.labb_cost).toFixed(4)}</td>
                <td className="num">{p.msrp != null ? `$${Number(p.msrp).toFixed(4)}` : <span className="muted">—</span>}</td>
                <td>
                  <span className={`badge ${p.is_active ? 'ok' : 'err'}`}>
                    {p.is_active ? 'active' : 'inactive'}
                  </span>
                </td>
                <td className="right">
                  <button className="btn ghost" onClick={() => onEdit(p)}>Edit</button>
                  <button className="btn ghost" onClick={() => onToggle(p)}>
                    {p.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ProductForm({ initial, onSubmit, onCancel, busy, error }) {
  const [f, setF] = useState({
    name: initial.name || '',
    sku: initial.sku || '',
    product_type: initial.product_type || '',
    unit_of_measure: initial.unit_of_measure || '',
    raw_cost: initial.raw_cost ?? '',
    tariff: initial.tariff ?? '',
    labb_cost: initial.labb_cost ?? '',
    msrp: initial.msrp ?? '',
    drugs_and_levels: initial.drugs_and_levels || '',
    notes: initial.notes || '',
  });
  const u = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const num = (v) => (v === '' ? null : Number(v));
  const submit = (e) => {
    e.preventDefault();
    onSubmit({
      name: f.name,
      sku: f.sku || null,
      product_type: f.product_type || null,
      unit_of_measure: f.unit_of_measure || null,
      raw_cost: num(f.raw_cost),
      tariff: num(f.tariff),
      labb_cost: Number(f.labb_cost),
      msrp: num(f.msrp),
      drugs_and_levels: f.drugs_and_levels || null,
      notes: f.notes || null,
    });
  };

  return (
    <div className="modal" role="dialog">
      <form className="card modal-card" onSubmit={submit}>
        <h2>{initial.id ? 'Edit product' : 'New product'}</h2>
        <div className="row gap">
          <label className="field grow">
            <span>Name *</span>
            <input value={f.name} onChange={u('name')} required autoFocus />
          </label>
          <label className="field" style={{ width: 180 }}>
            <span>SKU</span>
            <input value={f.sku} onChange={u('sku')} placeholder="e.g. ETC-88" />
          </label>
        </div>
        <div className="row gap">
          <label className="field grow">
            <span>Type</span>
            <input value={f.product_type} onChange={u('product_type')} placeholder="e.g. Test Kit" />
          </label>
          <label className="field grow">
            <span>Unit of measure</span>
            <input value={f.unit_of_measure} onChange={u('unit_of_measure')} placeholder="e.g. each, case" />
          </label>
        </div>
        <div className="row gap">
          <label className="field grow">
            <span>Raw cost</span>
            <input type="number" step="0.0001" min="0" value={f.raw_cost} onChange={u('raw_cost')} placeholder="Pre-tariff cost" />
          </label>
          <label className="field grow">
            <span>Tariff</span>
            <input type="number" step="0.0001" min="0" value={f.tariff} onChange={u('tariff')} placeholder="Tariff amount" />
          </label>
        </div>
        <div className="row gap">
          <label className="field grow">
            <span>Labb cost (total cost of goods) *</span>
            <input type="number" step="0.0001" min="0" value={f.labb_cost} onChange={u('labb_cost')} required />
          </label>
          <label className="field grow">
            <span>MSRP</span>
            <input type="number" step="0.0001" min="0" value={f.msrp} onChange={u('msrp')} placeholder="Suggested retail" />
          </label>
        </div>
        <label className="field">
          <span>Drugs and levels</span>
          <textarea rows={2} value={f.drugs_and_levels} onChange={u('drugs_and_levels')} placeholder="e.g. AMP 1000, COC 300, THC 50, OPI 2000" />
        </label>
        <label className="field">
          <span>Notes (internal)</span>
          <textarea rows={2} value={f.notes} onChange={u('notes')} />
        </label>
        {error && <p className="error">{String(error.message || error)}</p>}
        <div className="row gap end">
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}
