import { useEffect, useState } from 'react';
import { api } from '../api';

export default function Items() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ sku: '', name: '', unit: 'each', reorder_point: 0 });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = () => api.get('/items').then((d) => setItems(d.items));

  useEffect(() => {
    load();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/items', {
        sku: form.sku.trim(),
        name: form.name.trim(),
        unit: form.unit.trim() || 'each',
        reorder_point: Number(form.reorder_point) || 0,
      });
      setForm({ sku: '', name: '', unit: 'each', reorder_point: 0 });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Items</h2>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Add item</h3>
        <form onSubmit={submit}>
          <div className="grid2">
            <div className="field">
              <label>SKU</label>
              <input
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                placeholder="WID-001"
                required
              />
            </div>
            <div className="field">
              <label>Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Standard Widget"
                required
              />
            </div>
          </div>
          <div className="grid2">
            <div className="field">
              <label>Unit</label>
              <input
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="each"
              />
            </div>
            <div className="field">
              <label>Reorder point</label>
              <input
                type="number"
                min="0"
                value={form.reorder_point}
                onChange={(e) => setForm({ ...form, reorder_point: e.target.value })}
              />
            </div>
          </div>
          {error && <div className="error">{error}</div>}
          <button disabled={loading}>{loading ? 'Saving…' : 'Add item'}</button>
        </form>
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Unit</th>
              <th>Reorder pt</th>
              <th>On hand (all)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className={it.total_quantity <= it.reorder_point ? 'low' : ''}>
                <td>{it.sku}</td>
                <td>{it.name}</td>
                <td className="muted">{it.unit}</td>
                <td>{it.reorder_point}</td>
                <td>
                  {it.total_quantity}
                  {it.total_quantity <= it.reorder_point && (
                    <span className="badge low" style={{ marginLeft: 8 }}>
                      low
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No items yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
