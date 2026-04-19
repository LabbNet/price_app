import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../api';

export default function Buckets() {
  const qc = useQueryClient();
  const [includeInactive, setIncludeInactive] = useState(false);
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: ['buckets', includeInactive],
    queryFn: () => apiGet(`/api/buckets${includeInactive ? '?include_inactive=true' : ''}`),
  });

  const create = useMutation({
    mutationFn: (data) => apiPost('/api/buckets', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['buckets'] });
      setCreating(false);
    },
  });

  const toggle = useMutation({
    mutationFn: ({ id, active }) =>
      active ? apiPost(`/api/buckets/${id}/deactivate`) : apiPost(`/api/buckets/${id}/activate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buckets'] }),
  });

  return (
    <div className="shell">
      <div className="row-between">
        <h1>Pricing buckets</h1>
        <div className="row gap">
          <label className="row gap muted">
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            Show inactive
          </label>
          <button className="btn primary" onClick={() => setCreating(true)}>+ New bucket</button>
        </div>
      </div>

      <p className="muted">
        Buckets are reusable price lists. Assign a bucket to any client; copy one to tweak it for another clinic.
      </p>

      {list.isLoading && <p className="muted">Loading…</p>}
      {list.isError && <p className="error">{String(list.error.message || list.error)}</p>}

      {list.data && (
        <div className="card no-pad">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th className="num">Items</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.data.buckets.length === 0 && (
                <tr><td colSpan={5} className="muted center">No buckets yet.</td></tr>
              )}
              {list.data.buckets.map((b) => (
                <tr key={b.id} className={b.is_active ? '' : 'dim'}>
                  <td>
                    <Link to={`/buckets/${b.id}`}><strong>{b.name}</strong></Link>
                    {b.description && <div className="muted small">{b.description}</div>}
                    {b.copied_from_bucket_id && <div className="muted small">copied from another bucket</div>}
                  </td>
                  <td className="num">{b.item_count}</td>
                  <td>
                    <span className={`badge ${b.is_active ? 'ok' : 'err'}`}>
                      {b.is_active ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td className="muted small">{new Date(b.created_at).toLocaleDateString()}</td>
                  <td className="right">
                    <Link className="btn ghost" to={`/buckets/${b.id}`}>Open</Link>
                    <button className="btn ghost" onClick={() => toggle.mutate({ id: b.id, active: b.is_active })}>
                      {b.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <BucketForm
          onCancel={() => setCreating(false)}
          onSubmit={(data) => create.mutate(data)}
          busy={create.isPending}
          error={create.error}
        />
      )}
    </div>
  );
}

function BucketForm({ onSubmit, onCancel, busy, error }) {
  const [f, setF] = useState({ name: '', description: '', notes: '' });
  const u = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    onSubmit({
      name: f.name,
      description: f.description || null,
      notes: f.notes || null,
    });
  };
  return (
    <div className="modal" role="dialog">
      <form className="card modal-card" onSubmit={submit}>
        <h2>New bucket</h2>
        <label className="field">
          <span>Name *</span>
          <input value={f.name} onChange={u('name')} required autoFocus placeholder="e.g. Acme Network — Standard" />
        </label>
        <label className="field">
          <span>Description</span>
          <input value={f.description} onChange={u('description')} placeholder="Short description for staff" />
        </label>
        <label className="field">
          <span>Notes (internal)</span>
          <textarea rows={3} value={f.notes} onChange={u('notes')} />
        </label>
        {error && <p className="error">{String(error.message || error)}</p>}
        <div className="row gap end">
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Create'}</button>
        </div>
      </form>
    </div>
  );
}
