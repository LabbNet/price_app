import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../api';

const STATUS_LABEL = {
  pending: 'Pending',
  skipped: 'Skipped',
  resolved: 'Resolved',
};

export default function Duplicates() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('pending_or_skipped');

  const list = useQuery({
    queryKey: ['duplicates', status],
    queryFn: () => apiGet(`/api/duplicates?status=${status}`),
  });

  const skip = useMutation({
    mutationFn: (id) => apiPost(`/api/duplicates/${id}/skip`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['duplicates'] }),
  });

  const resolve = useMutation({
    mutationFn: ({ id, action, notes }) => apiPost(`/api/duplicates/${id}/resolve`, { action, notes: notes || null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['duplicates'] }),
  });

  return (
    <div className="shell">
      <div className="row-between">
        <h1>Duplicate accounts</h1>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending_or_skipped">Pending + skipped</option>
          <option value="pending">Pending only</option>
          <option value="skipped">Skipped only</option>
          <option value="resolved">Resolved</option>
          <option value="all">All</option>
        </select>
      </div>

      <p className="muted">
        Pairs of accounts that match on 3 of 4 address fields. (4/4 matches are auto-deleted.)
        "Skip for now" leaves the pair in the queue — the next staff user will see it.
      </p>

      {list.isLoading && <p className="muted">Loading…</p>}
      {list.isError && <p className="error">{String(list.error.message || list.error)}</p>}

      {list.data && list.data.duplicates.length === 0 && (
        <div className="card muted center"><p>Nothing in the queue.</p></div>
      )}

      {list.data && list.data.duplicates.map((d) => (
        <div key={d.id} className="card">
          <div className="row-between">
            <div className="row gap">
              <span className="badge">{d.match_score}/4 address match</span>
              <span className={`badge ${d.status === 'resolved' ? 'ok' : d.status === 'skipped' ? '' : 'err'}`}>
                {STATUS_LABEL[d.status] || d.status}
              </span>
            </div>
            {d.status !== 'resolved' && (
              <div className="row gap">
                <button className="btn ghost" onClick={() => skip.mutate(d.id)}>Skip for now</button>
              </div>
            )}
          </div>

          <div className="row gap" style={{ alignItems: 'stretch', marginTop: '0.75rem' }}>
            <AccountCard
              label="Older (A)"
              account={{ id: d.a_id, name: d.a_name, address_line1: d.a_line, city: d.a_city, state: d.a_state, postal_code: d.a_zip, created_at: d.a_created }}
              disabled={d.status === 'resolved'}
              onDelete={() => {
                if (confirm(`Delete "${d.a_name}" (the older record)?`)) resolve.mutate({ id: d.id, action: 'delete_a' });
              }}
            />
            <AccountCard
              label="Newer (B)"
              account={{ id: d.b_id, name: d.b_name, address_line1: d.b_line, city: d.b_city, state: d.b_state, postal_code: d.b_zip, created_at: d.b_created }}
              disabled={d.status === 'resolved'}
              onDelete={() => {
                if (confirm(`Delete "${d.b_name}" (the newer record)?`)) resolve.mutate({ id: d.id, action: 'delete_b' });
              }}
            />
          </div>

          {d.status !== 'resolved' && (
            <div className="row gap end" style={{ marginTop: '0.5rem' }}>
              <button className="btn ghost" onClick={() => resolve.mutate({ id: d.id, action: 'keep_both' })}>
                Not a duplicate — keep both
              </button>
            </div>
          )}

          {d.status === 'resolved' && (
            <p className="muted small">
              Resolved {d.resolved_at ? new Date(d.resolved_at).toLocaleString() : ''}
              {d.resolved_by_email ? ` by ${d.resolved_by_email}` : ''}
              {d.resolution_notes ? ` — ${d.resolution_notes}` : ''}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function AccountCard({ label, account, onDelete, disabled }) {
  return (
    <div className="card grow" style={{ margin: 0 }}>
      <div className="row-between">
        <span className="muted small" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
        <span className="muted small">{new Date(account.created_at).toLocaleDateString()}</span>
      </div>
      <h3 style={{ margin: '0.25rem 0' }}><Link to={`/clinics/${account.id}`}>{account.name}</Link></h3>
      <p className="muted small">
        {account.address_line1 || <em>no street</em>}<br />
        {[account.city, account.state, account.postal_code].filter(Boolean).join(' · ')}
      </p>
      {!disabled && (
        <button className="btn danger" onClick={onDelete}>Delete this one</button>
      )}
    </div>
  );
}
