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

const CHANGE_TYPE_LABEL = {
  pricing_change: 'Pricing change',
  scope_change: 'Scope change',
  renewal: 'Renewal',
  termination: 'Termination',
  other: 'Other',
};

export default function PortalContractDetail() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['portal-contract', id], queryFn: () => apiGet(`/api/portal/contracts/${id}`) });

  if (q.isLoading) return <div className="shell"><p className="muted">Loading…</p></div>;
  if (q.isError) return <div className="shell"><p className="error">{String(q.error.message || q.error)}</p></div>;

  const { contract, template, signatures, addenda } = q.data;

  const download = () =>
    apiDownload(`/api/portal/contracts/${contract.id}/pdf`, `contract-${contract.id}.pdf`)
      .catch((err) => alert(err.message || 'PDF not available'));

  const downloadAddendum = (aid, number) =>
    apiDownload(`/api/portal/contracts/${contract.id}/addenda/${aid}/pdf`, `contract-${contract.id}-addendum-${number}.pdf`)
      .catch((err) => alert(err.message || 'PDF not available'));

  const clinicSig = signatures.find((s) => s.party === 'clinic');
  const labbSig = signatures.find((s) => s.party === 'labb');

  return (
    <div className="shell">
      <p className="muted"><Link to="/portal">← Back</Link></p>
      <div className="row-between">
        <div>
          <h1>{contract.title || template?.name || '(untitled)'}</h1>
          <p className="muted">
            {contract.source === 'uploaded' && <span className="badge">Uploaded PDF</span>}
            {' '}
            <span className={`badge ${contract.status === 'active' ? 'ok' : contract.status === 'terminated' ? 'err' : ''}`}>
              {STATUS_LABEL[contract.status] || contract.status}
            </span>
          </p>
        </div>
        {contract.has_pdf && <button className="btn primary" onClick={download}>Download PDF</button>}
      </div>

      {contract.source !== 'uploaded' && contract.rendered_body && (
        <>
          <h2>Agreement</h2>
          <div className="card">
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace', fontSize: '0.9rem', margin: 0 }}>
              {contract.rendered_body}
            </pre>
          </div>
        </>
      )}

      {Array.isArray(contract.pricing_snapshot) && contract.pricing_snapshot.length > 0 && (
        <>
          <h2>Pricing at signing</h2>
          <div className="card no-pad">
            <table className="tbl">
              <thead>
                <tr><th>Product</th><th>UoM</th><th className="num">Unit price</th><th className="num">Total</th></tr>
              </thead>
              <tbody>
                {contract.pricing_snapshot.map((r) => (
                  <tr key={r.product_id}>
                    <td>{r.product_name}</td>
                    <td>{r.unit_of_measure || <span className="muted">—</span>}</td>
                    <td className="num">${Number(r.unit_price).toFixed(2)}</td>
                    <td className="num">{r.total_price != null ? `$${Number(r.total_price).toFixed(2)}` : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>Signatures</h2>
      <div className="card">
        <Signature label="You (client)" sig={clinicSig} />
        <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '1rem 0' }} />
        <Signature label="Labb" sig={labbSig} />
      </div>

      {addenda.length > 0 && (
        <>
          <h2>Addenda ({addenda.length})</h2>
          <div className="card no-pad">
            <table className="tbl">
              <thead>
                <tr><th>#</th><th>Title</th><th>Type</th><th>Effective</th><th></th></tr>
              </thead>
              <tbody>
                {addenda.map((a) => (
                  <tr key={a.id}>
                    <td className="num">{a.addendum_number}</td>
                    <td><strong>{a.title}</strong>{a.description && <div className="muted small">{a.description}</div>}</td>
                    <td><span className="badge">{CHANGE_TYPE_LABEL[a.change_type] || a.change_type || '—'}</span></td>
                    <td className="small">{a.effective_date ? new Date(a.effective_date).toLocaleDateString() : <span className="muted">—</span>}</td>
                    <td className="right">
                      {a.has_pdf && <button className="btn ghost" onClick={() => downloadAddendum(a.id, a.addendum_number)}>Download</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Signature({ label, sig }) {
  return (
    <div>
      <h3 style={{ margin: 0, fontSize: '0.95rem' }}>{label}</h3>
      {!sig ? <p className="muted">(not signed)</p> : (
        <p className="muted small">
          {sig.signer_name}{sig.signer_title && <>, {sig.signer_title}</>} ·
          {' '}{new Date(sig.signed_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}
