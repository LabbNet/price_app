import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../api';

const CONDITION_LABEL = {
  time_limited: 'Time-limited',
  single_order: 'Single-order',
  clinic_specific: 'Clinic-specific',
};

export default function SpecialPricing() {
  const qc = useQueryClient();
  const [clinicFilter, setClinicFilter] = useState('');
  const [conditionFilter, setConditionFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('active');

  const clinicsQ = useQuery({ queryKey: ['clinics', false], queryFn: () => apiGet('/api/clinics') });

  const list = useQuery({
    queryKey: ['special-pricing', { clinicFilter, conditionFilter, activeFilter }],
    queryFn: () => {
      const q = new URLSearchParams();
      if (clinicFilter) q.set('clinic_id', clinicFilter);
      if (conditionFilter) q.set('condition_type', conditionFilter);
      if (activeFilter === 'active') q.set('active', 'true');
      if (activeFilter === 'inactive') q.set('active', 'false');
      if (activeFilter === 'expired') q.set('expired', 'true');
      if (activeFilter === 'exhausted') q.set('exhausted', 'true');
      return apiGet(`/api/special-pricing?${q.toString()}`);
    },
  });

  const toggle = useMutation({
    mutationFn: ({ id, active }) => apiPost(`/api/special-pricing/${id}/${active ? 'deactivate' : 'activate'}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['special-pricing'] }),
  });

  return (
    <div className="shell">
      <div className="row-between">
        <h1>Special pricing</h1>
      </div>
      <p className="muted">
        One-off pricing that overrides a client's bucket. Add new entries from the individual client page.
      </p>

      <div className="card">
        <div className="row gap" style={{ flexWrap: 'wrap' }}>
          <select value={clinicFilter} onChange={(e) => setClinicFilter(e.target.value)}>
            <option value="">All clinics</option>
            {(clinicsQ.data?.clinics || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={conditionFilter} onChange={(e) => setConditionFilter(e.target.value)}>
            <option value="">All conditions</option>
            <option value="time_limited">Time-limited</option>
            <option value="single_order">Single-order</option>
            <option value="clinic_specific">Clinic-specific</option>
          </select>
          <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)}>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
            <option value="expired">Expired (time-limited past end)</option>
            <option value="exhausted">Exhausted (single-order used up)</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>

      {list.isLoading && <p className="muted">Loading…</p>}
      {list.isError && <p className="error">{String(list.error.message || list.error)}</p>}

      {list.data && (
        <div className="card no-pad">
          <table className="tbl">
            <thead>
              <tr>
                <th>Client</th>
                <th>Product</th>
                <th>Condition</th>
                <th className="num">Unit price</th>
                <th className="num">Margin</th>
                <th>Window / uses</th>
                <th>Reason</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.data.special_pricing.length === 0 && (
                <tr><td colSpan={8} className="muted center">No special pricing matches these filters.</td></tr>
              )}
              {list.data.special_pricing.map((sp) => {
                const unit = Number(sp.unit_price);
                const cost = Number(sp.labb_cost);
                const marginPct = unit > 0 ? ((unit - cost) / unit) * 100 : 0;
                return (
                  <tr key={sp.id} className={sp.is_active ? '' : 'dim'}>
                    <td>
                      <Link to={`/clients/${sp.client_id}`}><strong>{sp.client_name}</strong></Link>
                      <div className="muted small"><Link to={`/clinics/${sp.clinic_id}`}>{sp.clinic_name}</Link></div>
                    </td>
                    <td>{sp.product_name}{sp.unit_of_measure && <div className="muted small">{sp.unit_of_measure}</div>}</td>
                    <td><span className="badge">{CONDITION_LABEL[sp.condition_type]}</span></td>
                    <td className="num">${unit.toFixed(4)}</td>
                    <td className="num"><span className={`badge ${marginPct < 0 ? 'err' : 'ok'}`}>{marginPct.toFixed(1)}%</span></td>
                    <td className="small">
                      {sp.condition_type === 'time_limited' && (
                        <span>
                          {sp.effective_from ? new Date(sp.effective_from).toLocaleDateString() : '—'}
                          {' → '}
                          {sp.effective_until ? new Date(sp.effective_until).toLocaleDateString() : '—'}
                        </span>
                      )}
                      {sp.condition_type === 'single_order' && <span>{sp.uses_count} / {sp.max_uses ?? 1}</span>}
                      {sp.condition_type === 'clinic_specific' && <span className="muted">always</span>}
                    </td>
                    <td className="small">{sp.reason}</td>
                    <td className="right">
                      <button className="btn ghost" onClick={() => toggle.mutate({ id: sp.id, active: sp.is_active })}>
                        {sp.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
