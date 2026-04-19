import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api';

export default function PortalPricing() {
  const { clientId } = useParams();
  const client = useQuery({ queryKey: ['portal-client', clientId], queryFn: () => apiGet(`/api/portal/clients/${clientId}`) });
  const pricing = useQuery({ queryKey: ['portal-pricing', clientId], queryFn: () => apiGet(`/api/portal/clients/${clientId}/pricing`) });

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
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {pricing.data.effective.length === 0 && (
              <tr><td colSpan={7} className="muted center">No pricing in effect.</td></tr>
            )}
            {pricing.data.effective.map((r) => (
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
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted small">Questions about your pricing? Contact your Labb representative.</p>
    </div>
  );
}
