import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api';

/**
 * Reusable modal for creating or editing a special_pricing row.
 * Props:
 *   mode: 'create' | 'edit'
 *   initial: existing row (edit mode) — includes product/client context
 *   client: { id, name } — lock client in create mode
 *   onSubmit(data), onCancel, busy, error
 */
export default function SpecialPricingForm({ mode, initial, client, onSubmit, onCancel, busy, error }) {
  const productsQ = useQuery({
    queryKey: ['products', false],
    queryFn: () => apiGet('/api/products'),
    enabled: mode === 'create',
  });

  const [f, setF] = useState({
    product_id: initial?.product_id || '',
    unit_price: initial?.unit_price ?? '',
    total_price: initial?.total_price ?? '',
    condition_type: initial?.condition_type || 'time_limited',
    effective_from: initial?.effective_from ? toLocalInput(initial.effective_from) : '',
    effective_until: initial?.effective_until ? toLocalInput(initial.effective_until) : '',
    max_uses: initial?.max_uses ?? '',
    reason: initial?.reason || '',
    notes: initial?.notes || '',
  });
  const u = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    const base = {
      unit_price: Number(f.unit_price),
      total_price: f.total_price === '' ? null : Number(f.total_price),
      condition_type: f.condition_type,
      effective_from: f.condition_type === 'time_limited' && f.effective_from ? new Date(f.effective_from).toISOString() : null,
      effective_until: f.condition_type === 'time_limited' && f.effective_until ? new Date(f.effective_until).toISOString() : null,
      max_uses: f.condition_type === 'single_order' ? (f.max_uses === '' ? 1 : Number(f.max_uses)) : null,
      reason: f.reason,
      notes: f.notes || null,
    };
    if (mode === 'create') {
      onSubmit({ client_id: client.id, product_id: f.product_id, ...base });
    } else {
      onSubmit(base);
    }
  };

  const products = productsQ.data?.products || [];

  return (
    <div className="modal" role="dialog">
      <form className="card modal-card" onSubmit={submit}>
        <h2>{mode === 'create' ? 'Add special pricing' : 'Edit special pricing'}</h2>
        {client && <p className="muted">For client: <strong>{client.name}</strong></p>}

        {mode === 'create' ? (
          <label className="field"><span>Product *</span>
            <select value={f.product_id} onChange={u('product_id')} required>
              <option value="">Select a product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.unit_of_measure ? `(${p.unit_of_measure})` : ''} — Labb cost ${Number(p.labb_cost).toFixed(2)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="muted">Product: <strong>{initial.product_name}</strong></p>
        )}

        <label className="field"><span>Condition *</span>
          <select value={f.condition_type} onChange={u('condition_type')} required>
            <option value="time_limited">Time-limited — active between dates</option>
            <option value="single_order">Single-order — active until used up</option>
            <option value="clinic_specific">Clinic-specific — active until deactivated</option>
          </select>
        </label>

        {f.condition_type === 'time_limited' && (
          <div className="row gap">
            <label className="field grow"><span>Effective from</span>
              <input type="datetime-local" value={f.effective_from} onChange={u('effective_from')} />
            </label>
            <label className="field grow"><span>Effective until</span>
              <input type="datetime-local" value={f.effective_until} onChange={u('effective_until')} />
            </label>
          </div>
        )}

        {f.condition_type === 'single_order' && (
          <label className="field"><span>Max uses</span>
            <input type="number" min="1" step="1" value={f.max_uses} onChange={u('max_uses')} placeholder="Default: 1" />
          </label>
        )}

        <div className="row gap">
          <label className="field grow"><span>Unit price *</span>
            <input type="number" step="0.01" min="0" value={f.unit_price} onChange={u('unit_price')} required />
          </label>
          <label className="field grow"><span>Total price (optional)</span>
            <input type="number" step="0.01" min="0" value={f.total_price} onChange={u('total_price')} />
          </label>
        </div>

        <label className="field"><span>Reason * <span className="muted small">— shown in audit + price resolver</span></span>
          <input value={f.reason} onChange={u('reason')} required placeholder="e.g. Q2 pilot discount, supply shortage, one-time promo" />
        </label>

        <label className="field"><span>Notes (internal)</span>
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

function toLocalInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
