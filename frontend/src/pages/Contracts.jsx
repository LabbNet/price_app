import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../api';

const STATUS_LABEL = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Viewed',
  signed_by_client: 'Signed (client)',
  counter_signed: 'Counter-signed',
  active: 'Active',
  terminated: 'Terminated',
};

const STATUS_BADGE = {
  draft: '',
  sent: '',
  viewed: '',
  signed_by_client: '',
  counter_signed: 'ok',
  active: 'ok',
  terminated: 'err',
};

export default function Contracts() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');

  const clientsQ = useQuery({ queryKey: ['clients', false], queryFn: () => apiGet('/api/clients') });
  const list = useQuery({
    queryKey: ['contracts', { statusFilter, clientFilter }],
    queryFn: () => {
      const q = new URLSearchParams();
      if (statusFilter) q.set('status', statusFilter);
      if (clientFilter) q.set('client_id', clientFilter);
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

  return (
    <div className="shell">
      <div className="row-between">
        <h1>Contracts</h1>
        <button className="btn primary" onClick={() => setCreating(true)}>+ New contract</button>
      </div>

      <div className="card">
        <div className="row gap" style={{ flexWrap: 'wrap' }}>
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
            <option value="">All clients</option>
            {(clientsQ.data?.clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                <th>Clinic</th>
                <th>Client</th>
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
                  <td><Link to={`/contracts/${c.id}`}><strong>{c.clinic_name}</strong></Link></td>
                  <td className="small"><Link to={`/clients/${c.client_id}`} className="muted">{c.client_name}</Link></td>
                  <td className="small">{c.template_name || <span className="muted">—</span>} <span className="muted">v{c.template_version}</span></td>
                  <td><span className={`badge ${STATUS_BADGE[c.status]}`}>{STATUS_LABEL[c.status]}</span></td>
                  <td className="small">{c.sent_at ? new Date(c.sent_at).toLocaleDateString() : <span className="muted">—</span>}</td>
                  <td className="small">{c.counter_signed_at ? new Date(c.counter_signed_at).toLocaleDateString() : c.signed_by_client_at ? new Date(c.signed_by_client_at).toLocaleDateString() + ' (client)' : <span className="muted">—</span>}</td>
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
    </div>
  );
}

export function NewContractForm({ initial = {}, onSubmit, onCancel, busy, error }) {
  const [clientId, setClientId] = useState(initial.client_id || '');
  const [clinicId, setClinicId] = useState(initial.clinic_id || '');
  const [templateId, setTemplateId] = useState('');

  const clientsQ = useQuery({ queryKey: ['clients', false], queryFn: () => apiGet('/api/clients') });
  const clinicsQ = useQuery({
    queryKey: ['clinics-for-contract', clientId],
    queryFn: () => apiGet(`/api/clinics?client_id=${clientId}&limit=500`),
    enabled: !!clientId,
  });
  const templatesQ = useQuery({ queryKey: ['contract-templates', false], queryFn: () => apiGet('/api/contract-templates') });

  const submit = (e) => {
    e.preventDefault();
    onSubmit({ clinic_id: clinicId, template_id: templateId });
  };

  return (
    <div className="modal" role="dialog">
      <form className="card modal-card" onSubmit={submit}>
        <h2>New contract</h2>
        <p className="muted">A draft contract will be created with the clinic's current bucket and effective pricing frozen as a snapshot.</p>

        {!initial.clinic_id && (
          <>
            <label className="field"><span>Client *</span>
              <select value={clientId} onChange={(e) => { setClientId(e.target.value); setClinicId(''); }} required>
                <option value="">Select client…</option>
                {(clientsQ.data?.clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="field"><span>Clinic *</span>
              <select value={clinicId} onChange={(e) => setClinicId(e.target.value)} required disabled={!clientId}>
                <option value="">{clientId ? 'Select clinic…' : 'Select a client first'}</option>
                {(clinicsQ.data?.clinics || []).map((cl) => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
              </select>
            </label>
          </>
        )}
        {initial.clinic_id && initial.clinic_name && (
          <p className="muted">Clinic: <strong>{initial.clinic_name}</strong></p>
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
          <button type="submit" className="btn primary" disabled={!clinicId || !templateId || busy}>
            {busy ? 'Creating…' : 'Create draft'}
          </button>
        </div>
      </form>
    </div>
  );
}
