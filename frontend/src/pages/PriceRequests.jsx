import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../api';

const STATUS_LABEL = {
  open: 'Open',
  responded: 'Responded',
  dismissed: 'Dismissed',
};

export default function PriceRequests() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('open');
  const [responding, setResponding] = useState(null);

  const list = useQuery({
    queryKey: ['price-requests', statusFilter],
    queryFn: () => apiGet(`/api/price-requests?status=${statusFilter}`),
  });

  const respond = useMutation({
    mutationFn: ({ id, data }) => apiPost(`/api/price-requests/${id}/respond`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['price-requests'] }); setResponding(null); },
  });

  const dismiss = useMutation({
    mutationFn: (id) => apiPost(`/api/price-requests/${id}/dismiss`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['price-requests'] }),
  });

  return (
    <div className="shell">
      <div className="row-between">
        <h1>Price requests</h1>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          {['open', 'responded', 'dismissed', 'all'].map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s] || s[0].toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      <p className="muted">Clients tap "Request price" in their portal when a product is disabled. Respond by enabling the product in their bucket (and optionally overriding the unit price) or dismiss if it doesn't apply.</p>

      {list.isLoading && <p className="muted">Loading…</p>}
      {list.isError && <p className="error">{String(list.error.message || list.error)}</p>}

      {list.data && (
        <div className="card no-pad">
          <table className="tbl">
            <thead>
              <tr>
                <th>Requested</th>
                <th>Clinic / Client</th>
                <th>Product</th>
                <th className="num">MSRP</th>
                <th className="num">Labb cost</th>
                <th>Message</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.data.requests.length === 0 && (
                <tr><td colSpan={8} className="muted center">No requests matching this filter.</td></tr>
              )}
              {list.data.requests.map((r) => (
                <tr key={r.id}>
                  <td className="small muted">
                    {new Date(r.created_at).toLocaleDateString()}
                    {r.requested_by_email && <div>{r.requested_by_email}</div>}
                  </td>
                  <td className="small">
                    <Link to={`/clinics/${r.clinic_id}`}>{r.clinic_name}</Link>
                    <div className="muted"><Link to={`/clients/${r.client_id}`}>{r.client_name}</Link></div>
                  </td>
                  <td><strong>{r.product_name}</strong>{r.product_sku && <div className="muted small"><code>{r.product_sku}</code></div>}</td>
                  <td className="num muted">{r.product_msrp != null ? `$${Number(r.product_msrp).toFixed(4)}` : '—'}</td>
                  <td className="num muted">${Number(r.product_labb_cost).toFixed(4)}</td>
                  <td className="small">{r.message || <span className="muted">—</span>}</td>
                  <td>
                    <span className={`badge ${r.status === 'responded' ? 'ok' : r.status === 'dismissed' ? 'err' : ''}`}>
                      {STATUS_LABEL[r.status] || r.status}
                    </span>
                    {r.response_note && <div className="muted small">{r.response_note}</div>}
                  </td>
                  <td className="right">
                    {r.status === 'open' && (
                      <>
                        <button className="btn primary" onClick={() => setResponding(r)}>Respond</button>
                        <button className="btn ghost" onClick={() => { if (confirm('Dismiss this request?')) dismiss.mutate(r.id); }}>Dismiss</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {responding && (
        <RespondForm
          request={responding}
          onCancel={() => { setResponding(null); respond.reset(); }}
          onSubmit={(data) => respond.mutate({ id: responding.id, data })}
          busy={respond.isPending}
          error={respond.error}
        />
      )}
    </div>
  );
}

function RespondForm({ request, onSubmit, onCancel, busy, error }) {
  const [enableInBucket, setEnableInBucket] = useState(true);
  const [unitPrice, setUnitPrice] = useState(
    request.product_msrp != null ? String(Number(request.product_msrp).toFixed(4)) : '',
  );
  const [note, setNote] = useState('');

  const submit = (e) => {
    e.preventDefault();
    onSubmit({
      enable_in_bucket: enableInBucket,
      unit_price: enableInBucket && unitPrice !== '' ? Number(unitPrice) : undefined,
      response_note: note || null,
    });
  };

  return (
    <div className="modal" role="dialog">
      <form className="card modal-card" onSubmit={submit}>
        <h2>Respond to {request.client_name}</h2>
        <p className="muted">Product: <strong>{request.product_name}</strong></p>
        <label className="row gap" style={{ margin: '0.5rem 0' }}>
          <input type="checkbox" checked={enableInBucket} onChange={(e) => setEnableInBucket(e.target.checked)} />
          <span>Enable this product in the client's current bucket so it becomes visible in their portal</span>
        </label>
        {enableInBucket && (
          <label className="field"><span>Unit price for this client</span>
            <input type="number" step="0.0001" min="0" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="Leave blank to keep existing bucket price" />
          </label>
        )}
        <label className="field"><span>Response note (optional)</span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && <p className="error">{String(error.message || error)}</p>}
        <div className="row gap end">
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Send response'}</button>
        </div>
      </form>
    </div>
  );
}
