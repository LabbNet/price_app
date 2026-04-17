import { NavLink, Outlet } from 'react-router-dom';
import { useAuth, isStaff } from '../auth';

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div>
      <nav className="nav">
        <div className="nav-inner">
          <div className="nav-brand">Labb Pricing</div>
          <div className="nav-links">
            <NavLink to="/" end>Home</NavLink>
            {isStaff(user) && <NavLink to="/products">Products</NavLink>}
            {isStaff(user) && <NavLink to="/buckets">Buckets</NavLink>}
            {isStaff(user) && <NavLink to="/clients">Clients</NavLink>}
            {isStaff(user) && <NavLink to="/clinics">Clinics</NavLink>}
          </div>
          <div className="nav-right">
            <span className="muted">{user?.email} · {user?.role}</span>
            <button className="btn ghost" onClick={logout}>Sign out</button>
          </div>
        </div>
      </nav>
      <Outlet />
    </div>
  );
}
