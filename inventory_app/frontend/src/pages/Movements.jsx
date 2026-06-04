import { useEffect, useState } from 'react';
import { api } from '../api';

function describe(m) {
  switch (m.kind) {
    case 'receive':
      return `→ ${m.to_code}`;
    case 'ship':
      return `${m.from_code} →`;
    case 'transfer':
      return `${m.from_code} → ${m.to_code}`;
    case 'adjust':
      return `@ ${m.to_code}`;
    default:
      return '';
  }
}

export default function Movements() {
  const [movements, setMovements] = useState([]);

  useEffect(() => {
    api.get('/movements').then((d) => setMovements(d.movements));
  }, []);

  return (
    <div>
      <h2>Movement log</h2>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>Item</th>
              <th>Route</th>
              <th>Qty</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id}>
                <td className="muted">{new Date(m.created_at).toLocaleString()}</td>
                <td>
                  <span className="badge">{m.kind}</span>
                </td>
                <td>
                  {m.item_name} <span className="muted">({m.sku})</span>
                </td>
                <td className="muted">{describe(m)}</td>
                <td style={{ color: m.quantity < 0 ? 'var(--danger)' : 'inherit' }}>
                  {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                </td>
                <td className="muted">{m.note || '—'}</td>
              </tr>
            ))}
            {movements.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No movements yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
