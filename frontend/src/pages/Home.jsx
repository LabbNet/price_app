import { Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api';
import { useAuth, isStaff, isPortalUser } from '../auth';

export default function Home() {
  const { user } = useAuth();
  if (isPortalUser(user)) return <Navigate to="/portal" replace />;
  const apiBase = import.meta.env.VITE_API_URL || '(same origin)';
  const health = useQuery({ queryKey: ['health'], queryFn: () => apiGet('/api/health') });

  return (
    <div className="shell">
      <h1>Labb Pricing App</h1>
      <p className="muted">Signed in as <strong>{user?.email}</strong> ({user?.role})</p>

      <div className="card">
        <h2>Backend health</h2>
        <p className="muted">API: <code>{apiBase}</code></p>
        {health.isLoading && <p className="muted">Checking…</p>}
        {health.isError && <p><span className="badge err">down</span> {String(health.error.message || health.error)}</p>}
        {health.data && (
          <p>
            <span className={`badge ${health.data.status === 'ok' ? 'ok' : 'err'}`}>
              {health.data.status}
            </span>{' '}
            db: <code>{health.data.db}</code> · <span className="muted">{health.data.time}</span>
          </p>
        )}
      </div>

      <div className="card">
        <h2>Quick actions</h2>
        <ul>
          {isStaff(user) && <li><Link to="/products">Manage products</Link></li>}
          {isStaff(user) && <li><Link to="/buckets">Pricing buckets</Link></li>}
          {isStaff(user) && <li><Link to="/clinics">Accounts</Link></li>}
          {isStaff(user) && <li><Link to="/clients">Clients</Link></li>}
          {isStaff(user) && <li><Link to="/special-pricing">Special pricing</Link></li>}
          {isStaff(user) && <li><Link to="/contracts">Contracts</Link></li>}
          {isStaff(user) && <li><Link to="/contract-templates">Contract templates</Link></li>}
          {isStaff(user) && <li><Link to="/users">Users &amp; invites</Link></li>}
        </ul>
      </div>
    </div>
  );
}
