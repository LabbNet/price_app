import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete } from '../api';
import CsvImportModal from '../components/CsvImportModal';

const BUCKET_ITEMS_CSV_HEADERS = [
  { key: 'product_name', required: true, hint: 'matched against product catalog' },
  { key: 'unit_price', required: true },
  { key: 'total_price', hint: 'optional' },
  { key: 'notes', hint: 'optional' },
];

export default function BucketDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const nav = useNavigate();

  const [editingMeta, setEditingMeta] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [copying, setCopying] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [importing, setImporting] = useState(false);

  const detail = useQuery({
    queryKey: ['bucket', id],
    queryFn: () => apiGet(`/api/buckets/${id}`),
  });

  const products = useQuery({
    queryKey: ['products', false],
    queryFn: () => apiGet('/api/products'),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['bucket', id] });
    qc.invalidateQueries({ queryKey: ['buckets'] });
  };

  const updateMeta = useMutation({
    mutationFn: (data) => apiPatch(`/api/buckets/${id}`, data),
    onSuccess: () => { invalidate(); setEditingMeta(false); },
  });

  const copy = useMutation({
    mutationFn: (data) => apiPost(`/api/buckets/${id}/copy`, data),
    onSuccess: ({ bucket }) => {
      qc.invalidateQueries({ queryKey: ['buckets'] });
      setCopying(false);
      nav(`/buckets/${bucket.id}`);
    },
  });

  const addItem = useMutation({
    mutationFn: (data) => apiPost(`/api/buckets/${id}/items`, data),
    onSuccess: () => { invalidate(); setAddingItem(false); },
  });

  const updateItem = useMutation({
    mutationFn: ({ itemId, data }) => apiPatch(`/api/buckets/${id}/items/${itemId}`, data),
    onSuccess: () => { invalidate(); setEditingItemId(null); },
  });

  const deleteItem = useMutation({
    mutationFn: (itemId) => apiDelete(`/api/buckets/${id}/items/${itemId}`),
    onSuccess: () => invalidate(),
  });

  const importItems = useMutation({
    mutationFn: (items) => apiPost(`/api/buckets/${id}/items/import`, { items, mode: 'update_existing' }),
    onSuccess: () => invalidate(),
  });

  if (detail.isLoading) return <div className="shell"><p className="muted">Loading…</p></div>;
  if (detail.isError) return <div className="shell"><p className="error">{String(detail.error.message || detail.error)}</p></div>;

  const { bucket, items } = detail.data;
  const usedProductIds = new Set(items.map((i) => i.product_id));
  const availableProducts = (products.data?.products || []).filter((p) => !usedProductIds.has(p.id));
  const editingItem = items.find((i) => i.id === editingItemId);

  return (
    <div className="shell">
      <p className="muted"><Link to="/buckets">← All buckets</Link></p>

      <div className="row-between">
        <div>
          <h1>{bucket.name}</h1>
          {bucket.description && <p className="muted">{bucket.description}</p>}
          {!bucket.is_active && <span className="badge err">inactive</span>}
        </div>
        <div className="row gap">
          <button className="btn ghost" onClick={() => setCopying(true)}>Copy</button>
          <button className="btn ghost" onClick={() => setEditingMeta(true)}>Edit details</button>
        </div>
      </div>

      {bucket.notes && (
        <div className="card">
          <h2>Notes</h2>
          <p>{bucket.notes}</p>
        </div>
      )}

      <div className="row-between" style={{ marginTop: '1.5rem' }}>
        <h2>Items ({items.length})</h2>
        <div className="row gap">
          <button className="btn ghost" onClick={() => setImporting(true)}>Import CSV</button>
          <button
            className="btn primary"
            onClick={() => setAddingItem(true)}
            disabled={availableProducts.length === 0}
            title={availableProducts.length === 0 ? 'All active products are already in this bucket' : undefined}
          >+ Add item</button>
        </div>
      </div>

      <div className="card no-pad">
        <table className="tbl">
          <thead>
            <tr>
              <th>Product</th>
              <th>UoM</th>
              <th className="num">Unit price</th>
              <th className="num">Total price</th>
              <th className="num">Labb cost</th>
              <th className="num">Margin</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={8} className="muted center">No items yet. Add one to start building the price list.</td></tr>
            )}
            {items.map((i) => {
              const unit = Number(i.unit_price);
              const cost = Number(i.labb_cost);
              const margin = unit - cost;
              const marginPct = unit > 0 ? (margin / unit) * 100 : 0;
              const marginClass = margin < 0 ? 'err' : margin === 0 ? '' : 'ok';
              return (
                <tr key={i.id}>
                  <td>
                    <strong>{i.product_name}</strong>
                    {i.product_type && <div className="muted small">{i.product_type}</div>}
                  </td>
                  <td>{i.unit_of_measure || <span className="muted">—</span>}</td>
                  <td className="num">${unit.toFixed(4)}</td>
                  <td className="num">{i.total_price != null ? `$${Number(i.total_price).toFixed(4)}` : <span className="muted">—</span>}</td>
                  <td className="num muted">${cost.toFixed(4)}</td>
                  <td className="num">
                    <span className={`badge ${marginClass}`}>{marginPct.toFixed(1)}%</span>
                    <div className="muted small">${margin.toFixed(4)}</div>
                  </td>
                  <td className="small">{i.notes || <span className="muted">—</span>}</td>
                  <td className="right">
                    <button className="btn ghost" onClick={() => setEditingItemId(i.id)}>Edit</button>
                    <button
                      className="btn ghost"
                      onClick={() => { if (confirm(`Remove ${i.product_name} from this bucket?`)) deleteItem.mutate(i.id); }}
                    >Remove</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editingMeta && (
        <BucketMetaForm
          initial={bucket}
          onCancel={() => setEditingMeta(false)}
          onSubmit={(data) => updateMeta.mutate(data)}
          busy={updateMeta.isPending}
          error={updateMeta.error}
        />
      )}

      {copying && (
        <CopyBucketForm
          source={bucket}
          onCancel={() => setCopying(false)}
          onSubmit={(data) => copy.mutate(data)}
          busy={copy.isPending}
          error={copy.error}
        />
      )}

      {addingItem && (
        <ItemForm
          mode="add"
          products={availableProducts}
          onCancel={() => setAddingItem(false)}
          onSubmit={(data) => addItem.mutate(data)}
          busy={addItem.isPending}
          error={addItem.error}
        />
      )}

      {editingItem && (
        <ItemForm
          mode="edit"
          item={editingItem}
          onCancel={() => setEditingItemId(null)}
          onSubmit={(data) => updateItem.mutate({ itemId: editingItem.id, data })}
          busy={updateItem.isPending}
          error={updateItem.error}
        />
      )}

      {importing && (
        <CsvImportModal
          title="Import bucket items from CSV"
          description="Each row is matched to a product by name (case-insensitive). Existing items on this bucket are updated with the new price; missing products are skipped and reported."
          templateHeaders={BUCKET_ITEMS_CSV_HEADERS}
          templateFilename={`${bucket.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-items.csv`}
          parseRow={(r) => ({
            product_name: r.product_name || '',
            unit_price: r.unit_price ?? '',
            total_price: r.total_price ?? '',
            notes: r.notes || null,
          })}
          previewColumns={[
            { key: 'product_name', label: 'Product' },
            { key: 'unit_price', label: 'Unit price' },
            { key: 'total_price', label: 'Total' },
            { key: 'notes', label: 'Notes' },
          ]}
          onCancel={() => { setImporting(false); importItems.reset(); }}
          onSubmit={(rows) => importItems.mutate(rows)}
          busy={importItems.isPending}
          error={importItems.error}
          result={importItems.data}
          renderResult={(r) => (
            <div>
              <p className="muted">
                ✓ Created {r.created.length}, updated {r.updated.length}, skipped {r.skipped.length}.
              </p>
              {r.unmatched && r.unmatched.length > 0 && (
                <p className="error">
                  Unmatched products (no entry in catalog): {r.unmatched.join(', ')}
                </p>
              )}
            </div>
          )}
        />
      )}
    </div>
  );
}

function BucketMetaForm({ initial, onSubmit, onCancel, busy, error }) {
  const [f, setF] = useState({
    name: initial.name,
    description: initial.description || '',
    notes: initial.notes || '',
  });
  const u = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    onSubmit({
      name: f.name,
      description: f.description || null,
      notes: f.notes || null,
    });
  };
  return (
    <div className="modal" role="dialog">
      <form className="card modal-card" onSubmit={submit}>
        <h2>Edit bucket</h2>
        <label className="field"><span>Name *</span>
          <input value={f.name} onChange={u('name')} required autoFocus />
        </label>
        <label className="field"><span>Description</span>
          <input value={f.description} onChange={u('description')} />
        </label>
        <label className="field"><span>Notes (internal)</span>
          <textarea rows={4} value={f.notes} onChange={u('notes')} />
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

function CopyBucketForm({ source, onSubmit, onCancel, busy, error }) {
  const [name, setName] = useState(`${source.name} (copy)`);
  const [description, setDescription] = useState(source.description || '');
  const submit = (e) => {
    e.preventDefault();
    onSubmit({ name, description: description || null });
  };
  return (
    <div className="modal" role="dialog">
      <form className="card modal-card" onSubmit={submit}>
        <h2>Copy bucket</h2>
        <p className="muted">Duplicates “{source.name}” and all its items. You can edit prices after.</p>
        <label className="field"><span>New name *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>
        <label className="field"><span>Description</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        {error && <p className="error">{String(error.message || error)}</p>}
        <div className="row gap end">
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Copying…' : 'Copy'}</button>
        </div>
      </form>
    </div>
  );
}

function ItemForm({ mode, products = [], item, onSubmit, onCancel, busy, error }) {
  const [f, setF] = useState({
    product_id: item?.product_id || (products[0]?.id || ''),
    unit_price: item?.unit_price ?? '',
    total_price: item?.total_price ?? '',
    notes: item?.notes || '',
  });
  const u = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    if (mode === 'add') {
      onSubmit({
        product_id: f.product_id,
        unit_price: Number(f.unit_price),
        total_price: f.total_price === '' ? null : Number(f.total_price),
        notes: f.notes || null,
      });
    } else {
      onSubmit({
        unit_price: Number(f.unit_price),
        total_price: f.total_price === '' ? null : Number(f.total_price),
        notes: f.notes || null,
      });
    }
  };

  return (
    <div className="modal" role="dialog">
      <form className="card modal-card" onSubmit={submit}>
        <h2>{mode === 'add' ? 'Add item' : `Edit ${item.product_name}`}</h2>
        {mode === 'add' ? (
          <label className="field">
            <span>Product *</span>
            <select value={f.product_id} onChange={u('product_id')} required>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.unit_of_measure ? `(${p.unit_of_measure})` : ''} — Labb cost ${Number(p.labb_cost).toFixed(4)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="muted">Labb cost: ${Number(item.labb_cost).toFixed(4)}</p>
        )}
        <div className="row gap">
          <label className="field grow">
            <span>Unit price *</span>
            <input type="number" step="0.0001" min="0" value={f.unit_price} onChange={u('unit_price')} required />
          </label>
          <label className="field grow">
            <span>Total price (optional)</span>
            <input type="number" step="0.0001" min="0" value={f.total_price} onChange={u('total_price')} />
          </label>
        </div>
        <label className="field"><span>Notes</span>
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
