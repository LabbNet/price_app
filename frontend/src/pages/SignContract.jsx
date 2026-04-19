import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../api';

export default function SignContract() {
  const { token } = useParams();
  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signerTitle, setSignerTitle] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [ack, setAck] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGet(`/api/contracts/sign/${token}`);
        if (cancelled) return;
        setContract(data);
        // Fire-and-forget view tracking
        apiPost(`/api/contracts/view/${token}`).catch(() => {});
      } catch (err) {
        if (!cancelled) setError(err.message === 'invalid_or_expired_token' ? 'This signing link has expired or is invalid.' : err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await apiPost(`/api/contracts/sign/${token}`, {
        signer_name: signerName,
        signer_title: signerTitle || null,
        signer_email: signerEmail,
        acknowledged: true,
      });
      setDone(true);
    } catch (err) {
      setError(err.message === 'already_signed' ? 'This contract has already been signed.' : err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="shell"><p className="muted">Loading…</p></div>;
  if (error) return (
    <div className="shell">
      <div className="card">
        <h1>Unable to open contract</h1>
        <p className="error">{error}</p>
        <p className="muted">Contact your Labb representative to receive a new signing link.</p>
      </div>
    </div>
  );
  if (!contract) return null;

  if (done || contract.status === 'signed_by_client' || contract.status === 'active' || contract.status === 'counter_signed') {
    return (
      <div className="shell">
        <div className="card">
          <h1>Thank you</h1>
          <p>Your signature has been recorded. Labb will counter-sign and provide a final copy of the agreement.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <h1>Review and sign</h1>
      <p className="muted">
        Please read the agreement carefully. By typing your name and submitting, you acknowledge that this constitutes your legal signature.
      </p>

      <div className="card">
        <h2>Agreement</h2>
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace', fontSize: '0.9rem', margin: 0 }}>
          {contract.rendered_body}
        </pre>
      </div>

      {contract.pricing_snapshot && contract.pricing_snapshot.length > 0 && (
        <>
          <h2>Pricing</h2>
          <div className="card no-pad">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>UoM</th>
                  <th className="num">Unit price</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {contract.pricing_snapshot.map((r) => (
                  <tr key={r.product_id}>
                    <td>{r.product_name}</td>
                    <td>{r.unit_of_measure || <span className="muted">—</span>}</td>
                    <td className="num">${Number(r.unit_price).toFixed(4)}</td>
                    <td className="num">{r.total_price != null ? `$${Number(r.total_price).toFixed(4)}` : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>Sign</h2>
      <form className="card" onSubmit={submit}>
        <label className="field"><span>Full legal name *</span>
          <input value={signerName} onChange={(e) => setSignerName(e.target.value)} required />
        </label>
        <label className="field"><span>Title</span>
          <input value={signerTitle} onChange={(e) => setSignerTitle(e.target.value)} placeholder="e.g. Owner, Medical Director" />
        </label>
        <label className="field"><span>Email *</span>
          <input type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} required />
        </label>
        <label className="row gap" style={{ margin: '0.5rem 0 1rem' }}>
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span>I have read and agree to the terms of this agreement, and my typed name above constitutes my legal signature.</span>
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row gap end">
          <button type="submit" className="btn primary" disabled={!signerName || !signerEmail || !ack || submitting}>
            {submitting ? 'Signing…' : 'Sign and submit'}
          </button>
        </div>
      </form>
    </div>
  );
}
