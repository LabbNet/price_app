import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGet, apiPost, setToken } from '../api';
import { useAuth } from '../auth';

export default function AcceptInvite() {
  const { token } = useParams();
  const { refresh } = useAuth();
  const nav = useNavigate();
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { invite } = await apiGet(`/api/auth/invite/${token}`);
        if (!cancelled) setInvite(invite);
      } catch (err) {
        if (cancelled) return;
        if (err.message === 'invalid_or_expired_token') setError('This invite link is invalid or was revoked.');
        else if (err.message === 'already_accepted') setError('This invite has already been used.');
        else if (err.message === 'expired') setError('This invite has expired. Ask Labb for a new one.');
        else setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 12) { setError('Password must be at least 12 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      const { token: jwt } = await apiPost(`/api/auth/invite/${token}/accept`, {
        password,
        first_name: firstName || null,
        last_name: lastName || null,
      });
      setToken(jwt);
      await refresh();
      nav('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="shell" style={{ maxWidth: 520 }}><p className="muted">Loading…</p></div>;
  if (error && !invite) return (
    <div className="shell" style={{ maxWidth: 520 }}>
      <div className="card">
        <h1>Unable to accept invite</h1>
        <p className="error">{error}</p>
      </div>
    </div>
  );

  return (
    <div className="shell" style={{ maxWidth: 520 }}>
      <h1>Set up your account</h1>
      <p className="muted">
        Welcome to Labb Pricing. You were invited as a <strong>{invite.role.replace('_', ' ')}</strong>
        {invite.clinic_name && <> for <strong>{invite.clinic_name}</strong></>}
        {invite.client_name && <> / <strong>{invite.client_name}</strong></>}.
      </p>

      <form className="card" onSubmit={submit}>
        <label className="field"><span>Email</span>
          <input value={invite.email} readOnly disabled />
        </label>
        <div className="row gap">
          <label className="field grow"><span>First name</span>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
          </label>
          <label className="field grow"><span>Last name</span>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </label>
        </div>
        <label className="field"><span>Password * <span className="muted small">min 12 characters</span></span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <label className="field"><span>Confirm password *</span>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row gap end">
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Setting up…' : 'Create account'}</button>
        </div>
      </form>
    </div>
  );
}
