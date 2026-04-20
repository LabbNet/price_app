import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../api';

export default function PortalPricing() {
  const { clientId } = useParams();
  const qc = useQueryClient();
  const client = useQuery({ queryKey: ['portal-client', clientId], queryFn: () => apiGet(`/api/portal/clients/${clientId}`) });
  const pricing = useQuery({ queryKey: ['portal-pricing', clientId], queryFn: () => apiGet(`/api/portal/clients/${clientId}/pricing`) });

  const [requesting, setRequesting] = useState(null); // product row
  const [requested, setRequested] = useState(new Set()); // product_ids already submitted this session

  const submitRequest = useMutation({
    mutationFn: (data) => apiPost('/api/price-requests', data),
    onSuccess: (_r, vars) => {
      setRequested((s) => new Set([...s, vars.product_id]));
      setRequesting(null);
      qc.invalidateQueries({ queryKey: ['portal-pricing', clientId] });
    },
  });

  if (client.isLoading || pricing.isLoading) return <div className="shell"><p className="muted">Loading…</p></div>;
  if (client.isError) return <div className="shell"><p className="error">{String(client.error.message || client.error)}</p></div>;
  if (pricing.isError) return <div className="shell"><p className="error">{String(pricing.error.message || pricing.error)}</p></div>;

  const c = client.data.client;
  const bucket = client.data.current_bucket;

  return (
    <div className="shell">
      <p className="muted"><Link to="/portal">← Back</Link></p>
      <h1>{c.name} — Pricing</h1>
      {bucket && <p className="muted">Price list: <strong>{bucket.bucket_name}</strong> (assigned {new Date(bucket.assigned_at).toLocaleDateString()})</p>}

      <div className="card no-pad">
        <table className="tbl">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>UoM</th>
              <th>Drugs &amp; levels</th>
              <th className="num">Unit price</th>
              <th className="num">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pricing.data.effective.length === 0 && (
              <tr><td colSpan={7} className="muted center">No products available yet. Contact your Labb sales rep.</td></tr>
            )}
            {pricing.data.effective.map((r) => {
              const isRequested = requested.has(r.product_id);
              if (r.price_hidden) {
                return (
                  <tr key={r.product_id} className="dim">
                    <td><strong>{r.product_name}</strong></td>
                    <td className="small"><code>{r.sku || <span className="muted">—</span>}</code></td>
                    <td className="small">{r.unit_of_measure || <span className="muted">—</span>}</td>
                    <td className="small">{r.drugs_and_levels || <span className="muted">—</span>}</td>
                    <td className="num muted" colSpan={2}>Price not set</td>
                    <td className="right">
                      {isRequested ? (
                        <span className="badge ok">Requested</span>
                      ) : (
                        <button className="btn primary" onClick={() => setRequesting(r)}>Request price</button>
                      )}
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={r.product_id}>
                  <td><strong>{r.product_name}</strong></td>
                  <td className="small"><code>{r.sku || <span className="muted">—</span>}</code></td>
                  <td className="small">{r.unit_of_measure || <span className="muted">—</span>}</td>
                  <td className="small">{r.drugs_and_levels || <span className="muted">—</span>}</td>
                  <td className="num">${Number(r.unit_price).toFixed(4)}</td>
                  <td className="num">{r.total_price != null ? `$${Number(r.total_price).toFixed(4)}` : <span className="muted">—</span>}</td>
                  <td>
                    <span className="badge">{r.source === 'special' ? 'Special' : 'Standard'}</span>
                    {r.reason && <div className="muted small">{r.reason}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="muted small">Questions about your pricing? Contact your Labb sales rep.</p>

      {requesting && (
        <RequestPriceModal
          product={requesting}
          onCancel={() => setRequesting(null)}
          onSubmit={(message) => submitRequest.mutate({
            client_id: clientId,
            product_id: requesting.product_id,
            message,
          })}
          busy={submitRequest.isPending}
          error={submitRequest.error}
        />
      )}
    </div>
  );
}

function RequestPriceModal({ product, onSubmit, onCancel, busy, error }) {
  const [message, setMessage] = useState('');
  return (
    <div className="modal" role="dialog">
      <form className="card modal-card" onSubmit={(e) => { e.preventDefault(); onSubmit(message || null); }}>
        <h2>Request pricing</h2>
        <p className="muted">
          We'll notify your Labb sales rep to send pricing for <strong>{product.product_name}</strong>.
          Add a note if you need it by a specific date or for a specific quantity.
        </p>
        <label className="field"><span>Note (optional)</span>
          <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Needed for October orders, 500 units expected." />
        </label>
        {error && <p className="error">{String(error.message || error)}</p>}
        <div className="row gap end">
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
        </div>
      </form>
    </div>
  );
}
