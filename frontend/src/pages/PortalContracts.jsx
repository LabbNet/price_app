import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet, apiDownload } from '../api';

const STATUS_LABEL = {
  draft: 'Draft',
  sent: 'Awaiting your signature',
  viewed: 'Awaiting your signature',
  signed_by_clinic: 'Pending counter-signature',
  counter_signed: 'Counter-signed',
  active: 'Active',
  terminated: 'Terminated',
};

export default function PortalContracts() {
  const { clientId } = useParams();
  const client = useQuery({ queryKey: ['portal-client', clientId], queryFn: () => apiGet(`/api/portal/clients/${clientId}`) });
  const contracts = useQuery({ queryKey: ['portal-contracts', clientId], queryFn: () => apiGet(`/api/portal/clients/${clientId}/contracts`) });

  if (client.isLoading || contracts.isLoading) return <div className="shell"><p className="muted">Loading…</p></div>;
  if (client.isError) return <div className="shell"><p className="error">{String(client.error.message || client.error)}</p></div>;
  if (contracts.isError) return <div className="shell"><p className="error">{String(contracts.error.message || contracts.error)}</p></div>;

  const c = client.data.client;

  const download = (id) =>
    apiDownload(`/api/portal/contracts/${id}/pdf`, `contract-${id}.pdf`)
      .catch((err) => alert(err.message || 'PDF not available'));

  return (
    <div className="shell">
      <p className="muted"><Link to="/portal">← Back</Link></p>
      <h1>{c.name} — Contracts</h1>

      <div className="card no-pad">
        <table className="tbl">
          <thead>
            <tr>
              <th>Title / Template</th>
              <th>Status</th>
              <th>Signed</th>
              <th>PDF</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {contracts.data.contracts.length === 0 && (
              <tr><td colSpan={5} className="muted center">No contracts on file.</td></tr>
            )}
            {contracts.data.contracts.map((ct) => (
              <tr key={ct.id}>
                <td>
                  <strong>{ct.title || ct.template_name || '(untitled)'}</strong>
                  {ct.source === 'uploaded' && <div className="muted small">Uploaded PDF</div>}
                </td>
                <td><span className={`badge ${ct.status === 'active' ? 'ok' : ct.status === 'terminated' ? 'err' : ''}`}>
                  {STATUS_LABEL[ct.status] || ct.status}
                </span></td>
                <td className="small">
                  {ct.counter_signed_at ? new Date(ct.counter_signed_at).toLocaleDateString() :
                    ct.signed_by_clinic_at ? new Date(ct.signed_by_clinic_at).toLocaleDateString() + ' (you)' :
                      <span className="muted">—</span>}
                </td>
                <td>
                  {ct.has_pdf
                    ? <button className="btn ghost" onClick={() => download(ct.id)}>Download</button>
                    : <span className="muted small">—</span>}
                </td>
                <td className="right">
                  <Link to={`/portal/contracts/${ct.id}`} className="btn ghost">Details</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
