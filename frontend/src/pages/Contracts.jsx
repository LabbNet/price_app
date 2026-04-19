import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiUpload } from '../api';

const STATUS_LABEL = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Viewed',
  signed_by_clinic: 'Signed (clinic)',
  counter_signed: 'Counter-signed',
  active: 'Active',
  terminated: 'Terminated',
};

const STATUS_BADGE = {
  draft: '',
  sent: '',
  viewed: '',
  signed_by_clinic: '',
  counter_signed: 'ok',
  active: 'ok',
  terminated: 'err',
};

export default function Contracts() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [clinicFilter, setClinicFilter] = useState('');

  const clinicsQ = useQuery({ queryKey: ['clinics', false], queryFn: () => apiGet('/api/clinics') });
  const list = useQuery({
    queryKey: ['contracts', { statusFilter, clinicFilter }],
    queryFn: () => {
      const q = new URLSearchParams();
      if (statusFilter) q.set('status', statusFilter);
      if (clinicFilter) q.set('clinic_id', clinicFilter);
      return apiGet(`/api/contracts?${q.toString()}`);
    },
  });

  const create = useMutation({
    mutationFn: (data) => apiPost('/api/contracts', data),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['contracts'] });
      setCreating(false);
      window.location.href = `/contracts/${r.contract.id}`;
    },
  });

  const uploadContract = useMutation({
    mutationFn: (fields) => apiUpload('/api/contracts/upload', fields),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['contracts'] });
      setUploading(false);
      window.location.href = `/contracts/${r.contract.id}`;
    },
  });

  return (
    <div className="shell">
      <div className="row-between">
        <h1>Contracts</h1>
        <div className="row gap">
          <button className="btn ghost" onClick={() => setUploading(true)}>Upload existing PDF</button>
          <button className="btn primary" onClick={() => setCreating(true)}>+ New from template</button>
        </div>
      </div>

      <div className="card">
        <div className="row gap" style={{ flexWrap: 'wrap' }}>
          <select value={clinicFilter} onChange={(e) => setClinicFilter(e.target.value)}>
            <option value="">All clinics</option>
            {(clinicsQ.data?.clinics || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {list.isLoading && <p className="muted">Loading…</p>}
      {list.isError && <p className="error">{String(list.error.message || list.error)}</p>}

      {list.data && (
        <div className="card no-pad">
          <table className="tbl">
            <thead>
              <tr>
                <th>Client</th>
                <th>Clinic</th>
                <th>Template</th>
                <th>Status</th>
                <th>Sent</th>
                <th>Signed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.data.contracts.length === 0 && (
                <tr><td colSpan={7} className="muted center">No contracts match these filters.</td></tr>
              )}
              {list.data.contracts.map((c) => (
                <tr key={c.id}>
                  <td><Link to={`/contracts/${c.id}`}><strong>{c.client_name}</strong></Link></td>
                  <td className="small"><Link to={`/clinics/${c.clinic_id}`} className="muted">{c.clinic_name}</Link></td>
                  <td className="small">{c.template_name || <span className="muted">—</span>} <span className="muted">v{c.template_version}</span></td>
                  <td><span className={`badge ${STATUS_BADGE[c.status]}`}>{STATUS_LABEL[c.status]}</span></td>
                  <td className="small">{c.sent_at ? new Date(c.sent_at).toLocaleDateString() : <span className="muted">—</span>}</td>
                  <td className="small">{c.counter_signed_at ? new Date(c.counter_signed_at).toLocaleDateString() : c.signed_by_clinic_at ? new Date(c.signed_by_clinic_at).toLocaleDateString() + ' (clinic)' : <span className="muted">—</span>}</td>
                  <td className="right"><Link className="btn ghost" to={`/contracts/${c.id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <NewContractForm
          onCancel={() => setCreating(false)}
          onSubmit={(data) => create.mutate(data)}
          busy={create.isPending}
          error={create.error}
        />
      )}

      {uploading && (
        <UploadContractForm
          onCancel={() => { setUploading(false); uploadContract.reset(); }}
          onSubmit={(fields) => uploadContract.mutate(fields)}
          busy={uploadContract.isPending}
          error={uploadContract.error}
        />
      )}
    </div>
  );
}

export function UploadContractForm({ initial = {}, onCancel, onSubmit, busy, error }) {
  const [clinicId, setClinicId] = useState(initial.clinic_id || '');
  const [clientId, setClientId] = useState(initial.client_id || '');
  const [title, setTitle] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signerTitle, setSignerTitle] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [signedOn, setSignedOn] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState(null);

  const clinicsQ = useQuery({ queryKey: ['clinics', false], queryFn: () => apiGet('/api/clinics') });
  const clientsQ = useQuery({
    queryKey: ['clients-for-upload', clinicId],
    queryFn: () => apiGet(`/api/clients?clinic_id=${clinicId}&limit=500`),
    enabled: !!clinicId,
  });

  const submit = (e) => {
    e.preventDefault();
    onSubmit({
      client_id: clientId,
      title,
      signer_name: signerName || null,
      signer_title: signerTitle || null,
      signer_email: signerEmail || null,
      signed_on: signedOn ? new Date(signedOn).toISOString() : null,
      notes: notes || null,
      pdf: file,
    });
  };

  return (
    <div className="modal" role="dialog">
      <form className="card modal-card" onSubmit={submit}>
        <h2>Upload existing contract</h2>
        <p className="muted">Attach a PDF of a contract that was signed outside the app. Saved as an active contract linked to the client.</p>

        {!initial.client_id && (
          <>
            <label className="field"><span>Clinic *</span>
              <select value={clinicId} onChange={(e) => { setClinicId(e.target.value); setClientId(''); }} required>
                <option value="">Select clinic…</option>
                {(clinicsQ.data?.clinics || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="field"><span>Client *</span>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} required disabled={!clinicId}>
                <option value="">{clinicId ? 'Select client…' : 'Select a clinic first'}</option>
                {(clientsQ.data?.clients || []).map((cl) => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
              </select>
            </label>
          </>
        )}
        {initial.client_id && initial.client_name && (
          <p className="muted">Client: <strong>{initial.client_name}</strong></p>
        )}

        <label className="field"><span>Title *</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Pricing Agreement – Signed 2025-11-12" />
        </label>

        <label className="field"><span>PDF file *</span>
          <input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
        </label>

        <div className="row gap">
          <label className="field grow"><span>Signer name</span>
            <input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Who signed on paper" />
          </label>
          <label className="field grow"><span>Signer title</span>
            <input value={signerTitle} onChange={(e) => setSignerTitle(e.target.value)} />
          </label>
        </div>
        <div className="row gap">
          <label className="field grow"><span>Signer email</span>
            <input type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} />
          </label>
          <label className="field grow"><span>Signed on</span>
            <input type="date" value={signedOn} onChange={(e) => setSignedOn(e.target.value)} />
          </label>
        </div>

        <label className="field"><span>Notes (internal)</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {error && <p className="error">{String(error.message || error)}</p>}

        <div className="row gap end">
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!clientId || !title || !file || busy}>
            {busy ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function NewContractForm({ initial = {}, onSubmit, onCancel, busy, error }) {
  const [clinicId, setClinicId] = useState(initial.clinic_id || '');
  const [clientId, setClientId] = useState(initial.client_id || '');
  const [templateId, setTemplateId] = useState('');

  const clinicsQ = useQuery({ queryKey: ['clinics', false], queryFn: () => apiGet('/api/clinics') });
  const clientsQ = useQuery({
    queryKey: ['clients-for-contract', clinicId],
    queryFn: () => apiGet(`/api/clients?clinic_id=${clinicId}&limit=500`),
    enabled: !!clinicId,
  });
  const templatesQ = useQuery({ queryKey: ['contract-templates', false], queryFn: () => apiGet('/api/contract-templates') });

  const submit = (e) => {
    e.preventDefault();
    onSubmit({ client_id: clientId, template_id: templateId });
  };

  return (
    <div className="modal" role="dialog">
      <form className="card modal-card" onSubmit={submit}>
        <h2>New contract</h2>
        <p className="muted">A draft contract will be created with the client's current bucket and effective pricing frozen as a snapshot.</p>

        {!initial.client_id && (
          <>
            <label className="field"><span>Clinic *</span>
              <select value={clinicId} onChange={(e) => { setClinicId(e.target.value); setClientId(''); }} required>
                <option value="">Select clinic…</option>
                {(clinicsQ.data?.clinics || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="field"><span>Client *</span>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} required disabled={!clinicId}>
                <option value="">{clinicId ? 'Select client…' : 'Select a clinic first'}</option>
                {(clientsQ.data?.clients || []).map((cl) => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
              </select>
            </label>
          </>
        )}
        {initial.client_id && initial.client_name && (
          <p className="muted">Client: <strong>{initial.client_name}</strong></p>
        )}

        <label className="field"><span>Template *</span>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} required>
            <option value="">Select template…</option>
            {(templatesQ.data?.templates || []).map((t) => <option key={t.id} value={t.id}>{t.name} (v{t.version})</option>)}
          </select>
        </label>

        {error && <p className="error">{String(error.message || error)}</p>}
        <div className="row gap end">
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!clientId || !templateId || busy}>
            {busy ? 'Creating…' : 'Create draft'}
          </button>
        </div>
      </form>
    </div>
  );
}
