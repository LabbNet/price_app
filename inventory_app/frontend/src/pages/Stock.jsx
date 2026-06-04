import { useEffect, useState } from 'react';
import { api } from '../api';

const KINDS = [
  { value: 'receive', label: 'Receive (stock in)' },
  { value: 'ship', label: 'Ship (stock out)' },
  { value: 'transfer', label: 'Transfer between warehouses' },
  { value: 'adjust', label: 'Adjust (correction +/-)' },
];

export default function Stock() {
  const [stock, setStock] = useState([]);
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [move, setMove] = useState({
    item_id: '',
    kind: 'receive',
    from_warehouse_id: '',
    to_warehouse_id: '',
    quantity: '',
    note: '',
  });

  const loadStock = () => {
    const params = new URLSearchParams();
    if (filterWarehouse) params.set('warehouse_id', filterWarehouse);
    if (lowOnly) params.set('low_only', 'true');
    const qs = params.toString();
    return api.get(`/stock${qs ? `?${qs}` : ''}`).then((d) => setStock(d.stock));
  };

  useEffect(() => {
    api.get('/items').then((d) => setItems(d.items));
    api.get('/warehouses').then((d) => setWarehouses(d.warehouses));
  }, []);

  useEffect(() => {
    loadStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterWarehouse, lowOnly]);

  const needsFrom = move.kind === 'ship' || move.kind === 'transfer';
  const needsTo = move.kind === 'receive' || move.kind === 'transfer' || move.kind === 'adjust';

  const submitMove = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = {
        item_id: Number(move.item_id),
        kind: move.kind,
        quantity: Number(move.quantity),
        note: move.note.trim() || null,
        from_warehouse_id: needsFrom ? Number(move.from_warehouse_id) : null,
        to_warehouse_id: needsTo ? Number(move.to_warehouse_id) : null,
      };
      await api.post('/stock/move', payload);
      setMove({ ...move, quantity: '', note: '' });
      loadStock();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2>Stock</h2>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Record movement</h3>
        <form onSubmit={submitMove}>
          <div className="grid2">
            <div className="field">
              <label>Movement type</label>
              <select value={move.kind} onChange={(e) => setMove({ ...move, kind: e.target.value })}>
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Item</label>
              <select
                value={move.item_id}
                onChange={(e) => setMove({ ...move, item_id: e.target.value })}
                required
              >
                <option value="">Select item…</option>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.sku} — {it.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid3">
            {needsFrom && (
              <div className="field">
                <label>From warehouse</label>
                <select
                  value={move.from_warehouse_id}
                  onChange={(e) => setMove({ ...move, from_warehouse_id: e.target.value })}
                  required
                >
                  <option value="">Select…</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {needsTo && (
              <div className="field">
                <label>{move.kind === 'adjust' ? 'Warehouse' : 'To warehouse'}</label>
                <select
                  value={move.to_warehouse_id}
                  onChange={(e) => setMove({ ...move, to_warehouse_id: e.target.value })}
                  required
                >
                  <option value="">Select…</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="field">
              <label>
                Quantity{move.kind === 'adjust' ? ' (use − to reduce)' : ''}
              </label>
              <input
                type="number"
                value={move.quantity}
                onChange={(e) => setMove({ ...move, quantity: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="field">
            <label>Note</label>
            <input
              value={move.note}
              onChange={(e) => setMove({ ...move, note: e.target.value })}
              placeholder="optional"
            />
          </div>

          {error && <div className="error">{error}</div>}
          <button disabled={busy}>{busy ? 'Saving…' : 'Record movement'}</button>
        </form>
      </div>

      <div className="panel">
        <div className="row-between" style={{ marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>On hand</h3>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <select
              value={filterWarehouse}
              onChange={(e) => setFilterWarehouse(e.target.value)}
              style={{ width: 'auto' }}
            >
              <option value="">All warehouses</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code}
                </option>
              ))}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
              <input
                type="checkbox"
                checked={lowOnly}
                onChange={(e) => setLowOnly(e.target.checked)}
                style={{ width: 'auto' }}
              />
              Low only
            </label>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>SKU</th>
              <th>Warehouse</th>
              <th>Qty</th>
              <th>Reorder pt</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {stock.map((s) => (
              <tr key={s.id} className={s.low ? 'low' : ''}>
                <td>{s.item_name}</td>
                <td className="muted">{s.sku}</td>
                <td>{s.warehouse_code}</td>
                <td>
                  {s.quantity} {s.unit}
                </td>
                <td className="muted">{s.reorder_point}</td>
                <td>{s.low && <span className="badge low">low</span>}</td>
              </tr>
            ))}
            {stock.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No stock to show.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
