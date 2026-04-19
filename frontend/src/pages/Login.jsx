import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth, landingPath } from '../auth';

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={landingPath(user)} replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const u = await login(email.trim(), password);
      nav(landingPath(u), { replace: true });
    } catch (err) {
      setError(err.message === 'invalid_credentials' ? 'Wrong email or password.' : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shell" style={{ maxWidth: 420 }}>
      <h1>Sign in</h1>
      <p className="muted">Labb Pricing App</p>
      <form onSubmit={onSubmit} className="card">
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
