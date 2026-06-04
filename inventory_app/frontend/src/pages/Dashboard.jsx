import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function Dashboard() {
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [low, setLow] = useState([]);

  useEffect(() => {
    api.get('/items').then((d) => setItems(d.items));
    api.get('/warehouses').then((d) => setWarehouses(d.warehouses));
    api.get('/stock?low_only=true').then((d) => setLow(d.stock));
  }, []);

  const totalUnits = items.reduce((s, it) => s + (it.total_quantity || 0), 0);

  return (
    <div>
      <h2>Dashboard</h2>

      <div className="stat-row" style={{ marginBottom: 20 }}>
        <div className="panel stat-card">
          <div className="muted">Items</div>
          <div className="stat">{items.length}</div>
        </div>
        <div className="panel stat-card">
          <div className="muted">Warehouses</div>
          <div className="stat">{warehouses.length}</div>
        </div>
        <div className="panel stat-card">
          <div className="muted">Total units on hand</div>
          <div className="stat">{totalUnits}</div>
        </div>
        <div className="panel stat-card">
          <div className="muted">Low-stock alerts</div>
          <div className="stat" style={{ color: low.length ? 'var(--danger)' : 'inherit' }}>
            {low.length}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="row-between" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Low stock</h3>
          <Link to="/stock">Manage stock →</Link>
        </div>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Warehouse</th>
              <th>Qty</th>
              <th>Reorder pt</th>
            </tr>
          </thead>
          <tbody>
            {low.map((s) => (
              <tr key={s.id} className="low">
                <td>
                  {s.item_name} <span className="muted">({s.sku})</span>
                </td>
                <td>{s.warehouse_code}</td>
                <td>{s.quantity}</td>
                <td>{s.reorder_point}</td>
              </tr>
            ))}
            {low.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  Nothing below reorder point. 🎉
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
