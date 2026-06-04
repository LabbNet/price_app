import { NavLink, Outlet } from 'react-router-dom';

const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/stock', label: 'Stock' },
  { to: '/items', label: 'Items' },
  { to: '/warehouses', label: 'Warehouses' },
  { to: '/movements', label: 'Movements' },
];

export default function Layout() {
  return (
    <div className="app">
      <aside className="sidebar">
        <h1>📦 Inventory</h1>
        <nav>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}>
              {l.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
