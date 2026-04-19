import { NavLink, Outlet } from 'react-router-dom';
import { useAuth, isStaff, isPortalUser } from '../auth';

export default function Layout() {
  const { user, logout } = useAuth();
  const portal = isPortalUser(user);

  return (
    <div>
      <nav className="nav">
        <div className="nav-inner">
          <div className="nav-brand">{portal ? 'Labb Pricing · Portal' : 'Labb Pricing'}</div>
          <div className="nav-links">
            {!portal && <NavLink to="/" end>Home</NavLink>}
            {isStaff(user) && <NavLink to="/products">Products</NavLink>}
            {isStaff(user) && <NavLink to="/buckets">Buckets</NavLink>}
            {isStaff(user) && <NavLink to="/clinics">Clinics</NavLink>}
            {isStaff(user) && <NavLink to="/clients">Clients</NavLink>}
            {isStaff(user) && <NavLink to="/special-pricing">Special pricing</NavLink>}
            {isStaff(user) && <NavLink to="/contracts">Contracts</NavLink>}
            {isStaff(user) && <NavLink to="/contract-templates">Templates</NavLink>}
            {isStaff(user) && <NavLink to="/users">Users</NavLink>}
            {portal && <NavLink to="/portal" end>My pricing &amp; contracts</NavLink>}
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
