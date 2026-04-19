import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiUpload, apiDownload } from '../api';

const CHANGE_TYPE_LABEL = {
  pricing_change: 'Pricing change',
  scope_change: 'Scope change',
  renewal: 'Renewal',
  termination: 'Termination',
  other: 'Other',
};

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
  const [addingAddendum, setAddingAddendum] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  const detail = useQuery({ queryKey: ['contract', id], queryFn: () => apiGet(`/api/contracts/${id}`) });
  const addendaQ = useQuery({
    queryKey: ['contract-addenda', id],
    queryFn: () => apiGet(`/api/contracts/${id}/addenda`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['contract', id] });
    qc.invalidateQueries({ queryKey: ['contract-addenda', id] });
  };

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

  const addAddendum = useMutation({
    mutationFn: (fields) => apiUpload(`/api/contracts/${id}/addenda`, fields),
    onSuccess: () => { invalidate(); setAddingAddendum(false); },
  });

  if (detail.isLoading) return <div className="shell"><p className="muted">Loading…</p></div>;
  if (detail.isError) return <div className="shell"><p className="error">{String(detail.error.message || detail.error)}</p></div>;

  const { contract, client, clinic, template, bucket, signatures } = detail.data;
  const clinicSig = signatures.find((s) => s.party === 'clinic');
  const labbSig = signatures.find((s) => s.party === 'labb');

  const download = () =>
    apiDownload(`/api/contracts/${contract.id}/pdf`, `contract-${contract.id}.pdf`)
      .catch((err) => alert(err.message || 'PDF not available'));

  const downloadAddendumPdf = (aid, number) =>
    apiDownload(`/api/contracts/${contract.id}/addenda/${aid}/pdf`, `contract-${contract.id}-addendum-${number}.pdf`)
      .catch((err) => alert(err.message || 'PDF not available'));

  return (
    <div className="shell">
      <p className="muted"><Link to="/contracts">← All contracts</Link></p>

      <div className="row-between">
        <div>
          <h1>{client.name}</h1>
          {contract.source === 'uploaded' ? (
            <p className="muted">
              <span className="badge">Uploaded PDF</span> · {clinic.name}
              {bucket && <> · Bucket: <Link to={`/buckets/${bucket.id}`}>{bucket.name}</Link></>}
            </p>
          ) : (
            <p className="muted">
              {clinic.name} · {template?.name} v{contract.template_version}
              {bucket && <> · Bucket: <Link to={`/buckets/${bucket.id}`}>{bucket.name}</Link></>}
            </p>
          )}
          {contract.title && <p>{contract.title}</p>}
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

      {contract.source === 'uploaded' ? (
        <>
          <h2>Document</h2>
          <div className="card">
            <p className="muted">This contract was uploaded as a PDF. Download the file to view its contents.</p>
            <button className="btn primary" onClick={download}>Download PDF</button>
          </div>
        </>
      ) : (
        <>
          <h2>Rendered contract</h2>
          <div className="card">
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace', fontSize: '0.88rem', margin: 0 }}>
              {contract.rendered_body}
            </pre>
          </div>
        </>
      )}

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

      <div className="row-between" style={{ marginTop: '1.5rem' }}>
        <h2>Addenda ({addendaQ.data?.addenda?.length || 0})</h2>
        <button
          className="btn primary"
          onClick={() => setAddingAddendum(true)}
          disabled={contract.status !== 'active' && contract.status !== 'terminated'}
          title={contract.status !== 'active' && contract.status !== 'terminated' ? 'Addenda can be added after a contract is active' : undefined}
        >+ Add addendum</button>
      </div>
      <p className="muted">Every change after signing is logged here with title, reason, effective date, and optional attached PDF. Previous pricing is preserved for audit.</p>

      <div className="card no-pad">
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>Title</th>
              <th>Type</th>
              <th>Effective</th>
              <th>Added</th>
              <th>PDF</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {addendaQ.isLoading && <tr><td colSpan={7} className="muted center">Loading…</td></tr>}
            {addendaQ.data && addendaQ.data.addenda.length === 0 && (
              <tr><td colSpan={7} className="muted center">No addenda yet.</td></tr>
            )}
            {addendaQ.data && addendaQ.data.addenda.map((a) => (
              <tr key={a.id}>
                <td className="num">{a.addendum_number}</td>
                <td>
                  <strong>{a.title}</strong>
                  {a.description && <div className="muted small">{a.description}</div>}
                </td>
                <td><span className="badge">{CHANGE_TYPE_LABEL[a.change_type] || a.change_type || '—'}</span></td>
                <td className="small">{a.effective_date ? new Date(a.effective_date).toLocaleDateString() : <span className="muted">—</span>}</td>
                <td className="small muted">
                  {new Date(a.created_at).toLocaleDateString()}
                  {a.created_by_email && <div>{a.created_by_email}</div>}
                </td>
                <td>
                  {a.pdf_path
                    ? <button className="btn ghost" onClick={() => downloadAddendumPdf(a.id, a.addendum_number)}>Download</button>
                    : <span className="muted small">—</span>}
                </td>
                <td>
                  {a.pricing_snapshot && <span className="badge" title="Includes new pricing snapshot">$</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {addingAddendum && (
        <AddAddendumForm
          contract={contract}
          onCancel={() => { setAddingAddendum(false); addAddendum.reset(); }}
          onSubmit={(fields) => addAddendum.mutate(fields)}
          busy={addAddendum.isPending}
          error={addAddendum.error}
        />
      )}

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
  const emailInfo = sendResult?.email;

  const copy = () => {
    if (link) navigator.clipboard.writeText(link);
  };

  return (
    <div className="card">
      <h2>Signing link</h2>
      {emailInfo && emailInfo.sent && (
        <p>✉️ Email sent to <strong>{emailInfo.to}</strong>.</p>
      )}
      {emailInfo && !emailInfo.sent && emailInfo.logged && (
        <p className="muted">Email service isn't configured — the link was logged to the API console. Send it manually below.</p>
      )}
      {emailInfo && !emailInfo.sent && !emailInfo.logged && (
        <p className="muted">
          {emailInfo.reason === 'no_recipient'
            ? 'No email on file for this client — copy the link below and send it manually.'
            : `Email failed (${emailInfo.error || 'unknown'}). Copy the link below and send it manually.`}
        </p>
      )}
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

function AddAddendumForm({ contract, onSubmit, onCancel, busy, error }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [changeType, setChangeType] = useState('pricing_change');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [refreshPricing, setRefreshPricing] = useState(true);
  const [signerName, setSignerName] = useState('');
  const [signerTitle, setSignerTitle] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [signedAt, setSignedAt] = useState('');
  const [body, setBody] = useState('');
  const [file, setFile] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    onSubmit({
      title,
      description: description || null,
      change_type: changeType,
      effective_date: effectiveDate || null,
      body: body || null,
      refresh_pricing: refreshPricing ? 'true' : 'false',
      signer_name: signerName || null,
      signer_title: signerTitle || null,
      signer_email: signerEmail || null,
      signed_at: signedAt ? new Date(signedAt).toISOString() : null,
      pdf: file,
    });
  };

  return (
    <div className="modal" role="dialog">
      <form className="card modal-card" onSubmit={submit} style={{ maxWidth: 640 }}>
        <h2>Add addendum</h2>
        <p className="muted">
          Log a change to contract <strong>{contract.title || contract.id.slice(0, 8)}</strong>.
          Previous body and pricing are snapshotted automatically for audit.
        </p>

        <label className="field"><span>Title *</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus placeholder="e.g. Q1 2027 pricing adjustment" />
        </label>

        <div className="row gap">
          <label className="field grow"><span>Change type</span>
            <select value={changeType} onChange={(e) => setChangeType(e.target.value)}>
              {Object.entries(CHANGE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="field grow"><span>Effective date</span>
            <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          </label>
        </div>

        <label className="field"><span>Description / reason</span>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Why is this changing?" />
        </label>

        {changeType === 'pricing_change' && (
          <label className="row gap" style={{ margin: '0.5rem 0' }}>
            <input type="checkbox" checked={refreshPricing} onChange={(e) => setRefreshPricing(e.target.checked)} />
            <span>Snapshot the clinic's current effective pricing into this addendum and update the contract's current pricing to match</span>
          </label>
        )}

        <label className="field"><span>Body (optional, for in-app generated addenda)</span>
          <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Plain text of the addendum…" />
        </label>

        <label className="field"><span>Upload PDF (optional, for a signed amendment)</span>
          <input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>

        <div className="row gap">
          <label className="field grow"><span>Signer name</span>
            <input value={signerName} onChange={(e) => setSignerName(e.target.value)} />
          </label>
          <label className="field grow"><span>Signer title</span>
            <input value={signerTitle} onChange={(e) => setSignerTitle(e.target.value)} />
          </label>
        </div>
        <div className="row gap">
          <label className="field grow"><span>Signer email</span>
            <input type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} />
          </label>
          <label className="field grow"><span>Signed at</span>
            <input type="date" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} />
          </label>
        </div>

        {error && <p className="error">{String(error.message || error)}</p>}
        <div className="row gap end">
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!title || busy}>{busy ? 'Saving…' : 'Add addendum'}</button>
        </div>
      </form>
    </div>
  );
}
