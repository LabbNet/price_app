import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiUrl, getToken } from '../api';

const STATUS_LABEL = {
  draft: 'Draft',
  sent: 'Sent — awaiting clinic signature',
  viewed: 'Viewed — awaiting clinic signature',
  signed_by_clinic: 'Clinic signed — awaiting Labb counter-signature',
  counter_signed: 'Counter-signed',
  active: 'Active',
  terminated: 'Terminated',
};

export default function ContractDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [countersigning, setCountersigning] = useState(false);
  const [terminating, setTerminating] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  const detail = useQuery({ queryKey: ['contract', id], queryFn: () => apiGet(`/api/contracts/${id}`) });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['contract', id] });

  const send = useMutation({
    mutationFn: () => apiPost(`/api/contracts/${id}/send`),
    onSuccess: (r) => { setSendResult(r); invalidate(); },
  });

  const counterSign = useMutation({
    mutationFn: (data) => apiPost(`/api/contracts/${id}/counter-sign`, data),
    onSuccess: () => { invalidate(); setCountersigning(false); },
  });

  const terminate = useMutation({
    mutationFn: (reason) => apiPost(`/api/contracts/${id}/terminate`, { reason }),
    onSuccess: () => { invalidate(); setTerminating(false); },
  });

  const refreshPricing = useMutation({
    mutationFn: () => apiPatch(`/api/contracts/${id}`, { refresh_pricing: true }),
    onSuccess: () => invalidate(),
  });

  if (detail.isLoading) return <div className="shell"><p className="muted">Loading…</p></div>;
  if (detail.isError) return <div className="shell"><p className="error">{String(detail.error.message || detail.error)}</p></div>;

  const { contract, client, clinic, template, bucket, signatures } = detail.data;
  const clinicSig = signatures.find((s) => s.party === 'clinic');
  const labbSig = signatures.find((s) => s.party === 'labb');

  const downloadUrl = `${apiUrl(`/api/contracts/${contract.id}/pdf`)}`;
  const download = async () => {
    const r = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!r.ok) { alert('PDF not available'); return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contract-${contract.id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="shell">
      <p className="muted"><Link to="/contracts">← All contracts</Link></p>

      <div className="row-between">
        <div>
          <h1>{client.name}</h1>
          <p className="muted">
            {clinic.name} · {template?.name} v{contract.template_version}
            {bucket && <> · Bucket: <Link to={`/buckets/${bucket.id}`}>{bucket.name}</Link></>}
          </p>
        </div>
        <div>
          <span className={`badge ${contract.status === 'active' ? 'ok' : contract.status === 'terminated' ? 'err' : ''}`}>
            {STATUS_LABEL[contract.status]}
          </span>
        </div>
      </div>

      <div className="row gap" style={{ flexWrap: 'wrap', marginBottom: '1rem' }}>
        {contract.status === 'draft' && (
          <>
            <button className="btn primary" onClick={() => send.mutate()} disabled={send.isPending}>
              {send.isPending ? 'Sending…' : 'Send for signature'}
            </button>
            <button className="btn ghost" onClick={() => refreshPricing.mutate()} disabled={refreshPricing.isPending}>
              {refreshPricing.isPending ? 'Refreshing…' : 'Refresh pricing snapshot'}
            </button>
          </>
        )}
        {contract.status === 'signed_by_clinic' && (
          <button className="btn primary" onClick={() => setCountersigning(true)}>Counter-sign &amp; activate</button>
        )}
        {contract.status === 'active' && (
          <>
            <button className="btn primary" onClick={download}>Download PDF</button>
            <button className="btn ghost" onClick={() => setTerminating(true)}>Terminate</button>
          </>
        )}
        {contract.status === 'terminated' && (
          <button className="btn ghost" onClick={download}>Download PDF</button>
        )}
      </div>

      {(contract.status === 'sent' || contract.status === 'viewed' || sendResult) && (
        <SigningLinkCard contract={contract} sendResult={sendResult} />
      )}

      {send.error && <p className="error">{String(send.error.message || send.error)}</p>}

      <h2>Rendered contract</h2>
      <div className="card">
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace', fontSize: '0.88rem', margin: 0 }}>
          {contract.rendered_body}
        </pre>
      </div>

      <h2>Pricing snapshot ({(contract.pricing_snapshot || []).length})</h2>
      <div className="card no-pad">
        <table className="tbl">
          <thead>
            <tr>
              <th>Product</th>
              <th>UoM</th>
              <th className="num">Unit price</th>
              <th className="num">Total</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {(contract.pricing_snapshot || []).length === 0 && (
              <tr><td colSpan={5} className="muted center">No pricing in snapshot.</td></tr>
            )}
            {(contract.pricing_snapshot || []).map((r) => (
              <tr key={r.product_id}>
                <td>{r.product_name}</td>
                <td>{r.unit_of_measure || <span className="muted">—</span>}</td>
                <td className="num">${Number(r.unit_price).toFixed(4)}</td>
                <td className="num">{r.total_price != null ? `$${Number(r.total_price).toFixed(4)}` : <span className="muted">—</span>}</td>
                <td><span className="badge">{r.source === 'special' ? 'Special' : 'Bucket'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Signatures</h2>
      <div className="card">
        <SignatureView label="Clinic" sig={clinicSig} />
        <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '1rem 0' }} />
        <SignatureView label="Labb" sig={labbSig} />
      </div>

      {countersigning && (
        <CounterSignForm
          onCancel={() => setCountersigning(false)}
          onSubmit={(data) => counterSign.mutate(data)}
          busy={counterSign.isPending}
          error={counterSign.error}
        />
      )}

      {terminating && (
        <TerminateForm
          onCancel={() => setTerminating(false)}
          onSubmit={(reason) => terminate.mutate(reason)}
          busy={terminate.isPending}
          error={terminate.error}
        />
      )}
    </div>
  );
}

function SigningLinkCard({ contract, sendResult }) {
  const token = sendResult?.signing_token;
  const link = token
    ? `${window.location.origin}/sign/${token}`
    : null;
  const expires = sendResult?.signing_token_expires_at || contract.signing_token_expires_at;

  const copy = () => {
    if (link) navigator.clipboard.writeText(link);
  };

  return (
    <div className="card">
      <h2>Signing link</h2>
      {link ? (
        <>
          <p className="muted small">Send this link to the client signer. It expires {expires ? new Date(expires).toLocaleDateString() : 'in 30 days'}.</p>
          <div className="row gap">
            <input className="search grow" readOnly value={link} onFocus={(e) => e.target.select()} />
            <button className="btn primary" onClick={copy}>Copy</button>
          </div>
        </>
      ) : (
        <p className="muted">The signing link was generated when the contract was sent. Re-issuing link display requires re-sending — contact a dev to add link-refresh.</p>
      )}
    </div>
  );
}

function SignatureView({ label, sig }) {
  return (
    <div>
      <h3 style={{ margin: 0, fontSize: '0.95rem' }}>{label}</h3>
      {!sig ? (
        <p className="muted">(not signed)</p>
      ) : (
        <div className="row gap" style={{ flexWrap: 'wrap', marginTop: '0.3rem' }}>
          <Field label="Name" value={sig.signer_name} />
          <Field label="Title" value={sig.signer_title} />
          <Field label="Email" value={sig.signer_email} />
          <Field label="Signed at" value={new Date(sig.signed_at).toLocaleString()} />
          <Field label="IP" value={sig.ip_address} />
        </div>
      )}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div style={{ minWidth: 140 }}>
      <div className="muted small" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.72rem' }}>{label}</div>
      <div>{value || <span className="muted">—</span>}</div>
    </div>
  );
}

function CounterSignForm({ onSubmit, onCancel, busy, error }) {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const submit = (e) => {
    e.preventDefault();
    onSubmit({ signer_name: name, signer_title: title || null });
  };
  return (
    <div className="modal" role="dialog">
      <form className="card modal-card" onSubmit={submit}>
        <h2>Counter-sign &amp; activate</h2>
        <p className="muted">Your name and title will be recorded in the contract. The contract becomes active immediately and the PDF is generated.</p>
        <label className="field"><span>Your name *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>
        <label className="field"><span>Your title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. CEO, Director of Sales" />
        </label>
        {error && <p className="error">{String(error.message || error)}</p>}
        <div className="row gap end">
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!name || busy}>{busy ? 'Signing…' : 'Counter-sign'}</button>
        </div>
      </form>
    </div>
  );
}

function TerminateForm({ onSubmit, onCancel, busy, error }) {
  const [reason, setReason] = useState('');
  return (
    <div className="modal" role="dialog">
      <form className="card modal-card" onSubmit={(e) => { e.preventDefault(); onSubmit(reason); }}>
        <h2>Terminate contract</h2>
        <p className="muted">This ends the agreement. The PDF remains downloadable.</p>
        <label className="field"><span>Reason *</span>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} required autoFocus />
        </label>
        {error && <p className="error">{String(error.message || error)}</p>}
        <div className="row gap end">
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!reason || busy}>{busy ? 'Terminating…' : 'Terminate'}</button>
        </div>
      </form>
    </div>
  );
}
