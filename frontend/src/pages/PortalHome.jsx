import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api';
import { useAuth } from '../auth';

export default function PortalHome() {
  const { user } = useAuth();
  const me = useQuery({ queryKey: ['portal-me'], queryFn: () => apiGet('/api/portal/me') });

  if (me.isLoading) return <div className="shell"><p className="muted">Loading…</p></div>;
  if (me.isError) return <div className="shell"><p className="error">{String(me.error.message || me.error)}</p></div>;

  const { clinic, clients } = me.data;

  return (
    <div className="shell">
      <h1>Welcome{user.first_name ? `, ${user.first_name}` : ''}</h1>
      {clinic && <p className="muted">Signed in for <strong>{clinic.name}</strong>{user.role === 'client_user' && clients[0] ? <> · {clients[0].name}</> : null}</p>}

      <div className="card">
        <h2>Your locations</h2>
        {clients.length === 0 && <p className="muted">No locations associated with your account yet.</p>}
        {clients.length > 0 && (
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Location</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong></td>
                  <td className="small">{[c.city, c.state].filter(Boolean).join(', ') || <span className="muted">—</span>}</td>
                  <td className="right">
                    <Link to={`/portal/locations/${c.id}/pricing`} className="btn ghost">Pricing</Link>
                    <Link to={`/portal/locations/${c.id}/contracts`} className="btn ghost">Contracts</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
