import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';

export default function ProtectedRoute({ children, allow }) {
  const { user, loading } = useAuth();
  const loc = useLocation();

  if (loading) return <div className="shell"><p className="muted">Loading…</p></div>;
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />;
  if (allow && !allow.includes(user.role)) return <div className="shell"><h1>Forbidden</h1></div>;
  return children;
}
