import { Routes, Route, Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

function Home() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const r = await fetch('/api/health');
      return r.json();
    },
  });

  return (
    <div className="shell">
      <h1>Labb Pricing App</h1>
      <p className="muted">Scaffold v0.1 — foundation only. Features ship next.</p>

      <div className="card">
        <h2>Backend health</h2>
        {health.isLoading && <p className="muted">Checking…</p>}
        {health.isError && <p><span className="badge err">down</span> {String(health.error)}</p>}
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
        <h2>Planned areas</h2>
        <ul>
          <li>Products catalog (with Labb cost for margin)</li>
          <li>Pricing buckets — reusable, copyable templates</li>
          <li>Clients &amp; clinics — each clinic signs its own contract</li>
          <li>Special (conditional) pricing — time-limited, single-order, client-specific</li>
          <li>Contract templates &amp; e-sign flow — client signs first, Labb counter-signs</li>
          <li>Audit log, margin dashboard, client portal</li>
        </ul>
      </div>

      <p className="muted">
        <Link to="/login">Sign in</Link> (placeholder)
      </p>
    </div>
  );
}

function Login() {
  return (
    <div className="shell">
      <h1>Sign in</h1>
      <p className="muted">Login UI ships next commit — backend endpoint <code>POST /api/auth/login</code> is live.</p>
      <Link to="/">← back</Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
