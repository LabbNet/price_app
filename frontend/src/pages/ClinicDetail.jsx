import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch } from '../api';
import { ClinicForm } from './Clinics';

export default function ClinicDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const detail = useQuery({ queryKey: ['clinic', id], queryFn: () => apiGet(`/api/clinics/${id}`) });
  const buckets = useQuery({ queryKey: ['buckets', false], queryFn: () => apiGet('/api/buckets') });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['clinic', id] });
    qc.invalidateQueries({ queryKey: ['clinics'] });
  };

  const save = useMutation({
    mutationFn: (data) => apiPatch(`/api/clinics/${id}`, data),
    onSuccess: () => { invalidate(); setEditing(false); },
  });

  const assign = useMutation({
    mutationFn: (data) => apiPost(`/api/clinics/${id}/assign-bucket`, data),
    onSuccess: () => { invalidate(); setAssigning(false); },
  });

  const unassign = useMutation({
    mutationFn: () => apiPost(`/api/clinics/${id}/unassign-bucket`),
    onSuccess: () => invalidate(),
  });

  const toggle = useMutation({
    mutationFn: () => apiPost(`/api/clinics/${id}/${detail.data.clinic.is_active ? 'deactivate' : 'activate'}`),
    onSuccess: () => invalidate(),
  });

  if (detail.isLoading) return <div className="shell"><p className="muted">Loading…</p></div>;
  if (detail.isError) return <div className="shell"><p className="error">{String(detail.error.message || detail.error)}</p></div>;

  const { clinic, current_assignment, assignment_history } = detail.data;

  return (
    <div className="shell">
      <p className="muted">
        <Link to="/clinics">← All clinics</Link>
        {' · '}
        <Link to={`/clients/${clinic.client_id}`}>{clinic.client_name}</Link>
      </p>

      <div className="row-between">
        <div>
          <h1>{clinic.name}</h1>
          {clinic.legal_name && clinic.legal_name !== clinic.name && <p className="muted">{clinic.legal_name}</p>}
          {!clinic.is_active && <span className="badge err">inactive</span>}
        </div>
        <div className="row gap">
          <button className="btn ghost" onClick={() => setEditing(true)}>Edit</button>
          <button className="btn ghost" onClick={() => toggle.mutate()}>
            {clinic.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="row gap" style={{ flexWrap: 'wrap' }}>
          <Field label="Contact" value={clinic.contact_name} />
          <Field label="Email" value={clinic.contact_email} />
          <Field label="Phone" value={clinic.contact_phone} />
          <Field label="EIN" value={clinic.ein} />
          <Field label="Address" value={[clinic.address_line1, clinic.city, clinic.state, clinic.postal_code].filter(Boolean).join(', ')} />
        </div>
        {clinic.notes && <><h2>Notes</h2><p>{clinic.notes}</p></>}
      </div>

      <div className="row-between" style={{ marginTop: '1.5rem' }}>
        <h2>Pricing bucket</h2>
        <div className="row gap">
          {current_assignment && (
            <button className="btn ghost" onClick={() => { if (confirm('Unassign the current bucket?')) unassign.mutate(); }}>
              Unassign
            </button>
          )}
          <button className="btn primary" onClick={() => setAssigning(true)}>
            {current_assignment ? 'Switch bucket' : 'Assign bucket'}
          </button>
        </div>
      </div>

      <div className="card">
        {current_assignment ? (
          <>
            <p><strong><Link to={`/buckets/${current_assignment.bucket_id}`}>{current_assignment.bucket_name}</Link></strong></p>
            <p className="muted small">Assigned {new Date(current_assignment.assigned_at).toLocaleString()}{current_assignment.assigned_by_email ? ` by ${current_assignment.assigned_by_email}` : ''}</p>
          </>
        ) : (
          <p className="muted">No bucket assigned.</p>
        )}
      </div>

      {assignment_history.length > 0 && (
        <>
          <h2>Assignment history</h2>
          <div className="card no-pad">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Bucket</th>
                  <th>Assigned</th>
                  <th>Closed</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {assignment_history.map((h) => (
                  <tr key={h.id}>
                    <td><Link to={`/buckets/${h.bucket_id}`}>{h.bucket_name}</Link></td>
                    <td className="small">{new Date(h.assigned_at).toLocaleString()}</td>
                    <td className="small">{h.unassigned_at ? new Date(h.unassigned_at).toLocaleString() : <span className="badge ok">current</span>}</td>
                    <td className="small muted">{h.assigned_by_email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {editing && (
        <ClinicForm
          initial={clinic}
          title="Edit clinic"
          onCancel={() => setEditing(false)}
          onSubmit={(data) => save.mutate(data)}
          busy={save.isPending}
          error={save.error}
        />
      )}
      {assigning && (
        <AssignBucketForm
          buckets={(buckets.data?.buckets || []).filter((b) => b.is_active)}
          current={current_assignment}
          onCancel={() => setAssigning(false)}
          onSubmit={(data) => assign.mutate(data)}
          busy={assign.isPending}
          error={assign.error}
        />
      )}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div style={{ minWidth: 160 }}>
      <div className="muted small" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.72rem' }}>{label}</div>
      <div>{value || <span className="muted">—</span>}</div>
    </div>
  );
}

function AssignBucketForm({ buckets, current, onSubmit, onCancel, busy, error }) {
  const [bucketId, setBucketId] = useState(buckets[0]?.id || '');
  const [notes, setNotes] = useState('');
  const submit = (e) => {
    e.preventDefault();
    onSubmit({ bucket_id: bucketId, notes: notes || null });
  };
  return (
    <div className="modal" role="dialog">
      <form className="card modal-card" onSubmit={submit}>
        <h2>{current ? 'Switch bucket' : 'Assign bucket'}</h2>
        {current && <p className="muted">Currently on <strong>{current.bucket_name}</strong>. Assigning a new bucket closes the current assignment.</p>}
        <label className="field"><span>Bucket *</span>
          <select value={bucketId} onChange={(e) => setBucketId(e.target.value)} required>
            {buckets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Notes (optional)</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for this assignment (visible in history)" />
        </label>
        {error && <p className="error">{String(error.message || error)}</p>}
        <div className="row gap end">
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!bucketId || busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}
