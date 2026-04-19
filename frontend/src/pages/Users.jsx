import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete } from '../api';

const ROLE_LABEL = {
  admin: 'Labb admin',
  sales: 'Labb sales',
  legal: 'Labb legal',
  finance: 'Labb finance',
  clinic_admin: 'Clinic admin',
  clinic_user: 'Clinic user',
  client_user: 'Client user',
};

const STAFF_ROLE_KEYS = ['admin', 'sales', 'legal', 'finance'];
const PORTAL_ROLE_KEYS = ['clinic_admin', 'clinic_user', 'client_user'];

export default function Users() {
  const qc = useQueryClient();
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);

  const users = useQuery({ queryKey: ['users'], queryFn: () => apiGet('/api/users') });
  const invites = useQuery({ queryKey: ['invites'], queryFn: () => apiGet('/api/users/invites') });

  const invite = useMutation({
    mutationFn: (data) => apiPost('/api/users/invite', data),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['invites'] });
      setInviteResult(r.invite);
      setInviting(false);
    },
  });

  const toggle = useMutation({
    mutationFn: ({ id, active }) => apiPost(`/api/users/${id}/${active ? 'deactivate' : 'activate'}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const revoke = useMutation({
    mutationFn: (id) => apiDelete(`/api/users/invites/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invites'] }),
  });

  return (
    <div className="shell">
      <div className="row-between">
        <h1>Users &amp; invites</h1>
        <button className="btn primary" onClick={() => { setInviteResult(null); setInviting(true); }}>+ Invite user</button>
      </div>

      <p className="muted">
        Labb staff (admin/sales/legal/finance) manage the platform. Portal users (clinic_admin,
        clinic_user, client_user) log in to see their own pricing and contracts.
      </p>

      {inviteResult && (
        <div className="card">
          <h2>Invite sent</h2>
          <p className="muted">Email delivery isn't wired up yet — copy this link and send it manually. It expires in 14 days.</p>
          <InviteLinkCopy token={inviteResult.token} />
        </div>
      )}

      <h2>Users ({users.data?.users?.length || 0})</h2>
      {users.isLoading && <p className="muted">Loading…</p>}
      {users.isError && <p className="error">{String(users.error.message || users.error)}</p>}
      {users.data && (
        <div className="card no-pad">
          <table className="tbl">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
                <th>Scope</th>
                <th>Status</th>
                <th>Last login</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.data.users.length === 0 && (
                <tr><td colSpan={7} className="muted center">No users yet.</td></tr>
              )}
              {users.data.users.map((u) => (
                <tr key={u.id} className={u.is_active ? '' : 'dim'}>
                  <td><strong>{u.email}</strong></td>
                  <td className="small">{[u.first_name, u.last_name].filter(Boolean).join(' ') || <span className="muted">—</span>}</td>
                  <td><span className="badge">{ROLE_LABEL[u.role] || u.role}</span></td>
                  <td className="small">
                    {u.clinic_name && <>Clinic: <strong>{u.clinic_name}</strong></>}
                    {u.client_name && <>Client: <strong>{u.client_name}</strong></>}
                    {!u.clinic_name && !u.client_name && <span className="muted">—</span>}
                  </td>
                  <td><span className={`badge ${u.is_active ? 'ok' : 'err'}`}>{u.is_active ? 'active' : 'inactive'}</span></td>
                  <td className="small muted">{u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : '—'}</td>
                  <td className="right">
                    <button className="btn ghost" onClick={() => toggle.mutate({ id: u.id, active: u.is_active })}>
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Open invites</h2>
      {invites.isLoading && <p className="muted">Loading…</p>}
      {invites.data && (
        <div className="card no-pad">
          <table className="tbl">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Scope</th>
                <th>Expires</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invites.data.invites.filter((i) => !i.accepted_at).length === 0 && (
                <tr><td colSpan={6} className="muted center">No open invites.</td></tr>
              )}
              {invites.data.invites.filter((i) => !i.accepted_at).map((i) => (
                <tr key={i.id}>
                  <td><strong>{i.email}</strong></td>
                  <td><span className="badge">{ROLE_LABEL[i.role] || i.role}</span></td>
                  <td className="small">
                    {i.clinic_name && <>Clinic: <strong>{i.clinic_name}</strong></>}
                    {i.client_name && <>Client: <strong>{i.client_name}</strong></>}
                  </td>
                  <td className="small muted">{new Date(i.expires_at).toLocaleDateString()}</td>
                  <td>
                    {new Date(i.expires_at) < new Date()
                      ? <span className="badge err">expired</span>
                      : <InviteLinkCopy token={i.token} compact />}
                  </td>
                  <td className="right">
                    <button className="btn ghost" onClick={() => { if (confirm(`Revoke invite for ${i.email}?`)) revoke.mutate(i.id); }}>Revoke</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {inviting && (
        <InviteForm
          onCancel={() => setInviting(false)}
          onSubmit={(data) => invite.mutate(data)}
          busy={invite.isPending}
          error={invite.error}
        />
      )}
    </div>
  );
}

function InviteLinkCopy({ token, compact }) {
  const link = `${window.location.origin}/accept-invite/${token}`;
  const copy = () => navigator.clipboard.writeText(link);
  if (compact) {
    return <button className="btn ghost" onClick={copy}>Copy link</button>;
  }
  return (
    <div className="row gap">
      <input className="search grow" readOnly value={link} onFocus={(e) => e.target.select()} />
      <button className="btn primary" onClick={copy}>Copy</button>
    </div>
  );
}

function InviteForm({ onSubmit, onCancel, busy, error }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('clinic_admin');
  const [clinicId, setClinicId] = useState('');
  const [clientId, setClientId] = useState('');

  const clinicsQ = useQuery({ queryKey: ['clinics', false], queryFn: () => apiGet('/api/clinics') });
  const clientsQ = useQuery({
    queryKey: ['clients-for-invite', clinicId],
    queryFn: () => apiGet(`/api/clients?clinic_id=${clinicId}&limit=500`),
    enabled: !!clinicId,
  });

  const needsClinic = role === 'clinic_admin' || role === 'clinic_user' || role === 'client_user';
  const needsClient = role === 'client_user';

  const submit = (e) => {
    e.preventDefault();
    onSubmit({
      email,
      role,
      clinic_id: needsClinic ? clinicId : null,
      client_id: needsClient ? clientId : null,
    });
  };

  return (
    <div className="modal" role="dialog">
      <form className="card modal-card" onSubmit={submit}>
        <h2>Invite user</h2>
        <p className="muted">Creates a time-limited link that lets the invitee set their password. Email delivery isn't wired yet — you'll copy the link manually.</p>

        <label className="field"><span>Email *</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>

        <label className="field"><span>Role *</span>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <optgroup label="Labb staff">
              {STAFF_ROLE_KEYS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </optgroup>
            <optgroup label="Portal">
              {PORTAL_ROLE_KEYS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </optgroup>
          </select>
        </label>

        {needsClinic && (
          <label className="field"><span>Clinic (parent) *</span>
            <select value={clinicId} onChange={(e) => { setClinicId(e.target.value); setClientId(''); }} required>
              <option value="">Select clinic…</option>
              {(clinicsQ.data?.clinics || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}

        {needsClient && (
          <label className="field"><span>Client (location) *</span>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} required disabled={!clinicId}>
              <option value="">{clinicId ? 'Select client…' : 'Pick a clinic first'}</option>
              {(clientsQ.data?.clients || []).map((cl) => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
            </select>
          </label>
        )}

        {error && <p className="error">{String(error.message || error)}</p>}

        <div className="row gap end">
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!email || (needsClinic && !clinicId) || (needsClient && !clientId) || busy}>
            {busy ? 'Creating invite…' : 'Create invite'}
          </button>
        </div>
      </form>
    </div>
  );
}
