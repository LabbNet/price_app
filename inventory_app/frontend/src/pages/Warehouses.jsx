import { useEffect, useState } from 'react';
import { api } from '../api';

export default function Warehouses() {
  const [warehouses, setWarehouses] = useState([]);
  const [form, setForm] = useState({ code: '', name: '', address: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = () =>
    api.get('/warehouses?include_inactive=true').then((d) => setWarehouses(d.warehouses));

  useEffect(() => {
    load();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/warehouses', {
        code: form.code.trim(),
        name: form.name.trim(),
        address: form.address.trim() || null,
      });
      setForm({ code: '', name: '', address: '' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Warehouses</h2>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Add warehouse</h3>
        <form onSubmit={submit}>
          <div className="grid3">
            <div className="field">
              <label>Code</label>
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="MAIN"
                required
              />
            </div>
            <div className="field">
              <label>Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Main Warehouse"
                required
              />
            </div>
            <div className="field">
              <label>Address</label>
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="optional"
              />
            </div>
          </div>
          {error && <div className="error">{error}</div>}
          <button disabled={loading}>{loading ? 'Saving…' : 'Add warehouse'}</button>
        </form>
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Address</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {warehouses.map((w) => (
              <tr key={w.id}>
                <td>{w.code}</td>
                <td>{w.name}</td>
                <td className="muted">{w.address || '—'}</td>
                <td>{w.is_active ? 'Active' : 'Inactive'}</td>
              </tr>
            ))}
            {warehouses.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  No warehouses yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
