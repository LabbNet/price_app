import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch } from '../api';
import { ClinicForm } from './Clinics';
import SpecialPricingForm from '../components/SpecialPricingForm';

const CONDITION_LABEL = {
  time_limited: 'Time-limited',
  single_order: 'Single-order',
  client_specific: 'Client-specific',
};

export default function ClinicDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [addingSpecial, setAddingSpecial] = useState(false);
  const [editingSpecial, setEditingSpecial] = useState(null);

  const detail = useQuery({ queryKey: ['clinic', id], queryFn: () => apiGet(`/api/clinics/${id}`) });
  const buckets = useQuery({ queryKey: ['buckets', false], queryFn: () => apiGet('/api/buckets') });
  const specials = useQuery({
    queryKey: ['special-pricing', { clinic: id }],
    queryFn: () => apiGet(`/api/special-pricing?clinic_id=${id}`),
  });
  const effective = useQuery({
    queryKey: ['effective', id],
    queryFn: () => apiGet(`/api/special-pricing/resolve-clinic/${id}`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['clinic', id] });
    qc.invalidateQueries({ queryKey: ['clinics'] });
    qc.invalidateQueries({ queryKey: ['special-pricing'] });
    qc.invalidateQueries({ queryKey: ['effective', id] });
  };

  const save = useMutation({
    mutationFn: (data) => apiPatch(`/api/clinics/${id}`, data),
    onSuccess: () => { invalidate(); setEditing(false); },
  });

  const assign = useMutation({
    mutationFn: (data) => apiPost(`/api/clinics/${id}/assign-bucket`, data),
    onSuccess: () => { invalidate(); setAssigning(false); },
  });

  const unassign = useMutation({
    mutationFn: () => apiPost(`/api/clinics/${id}/unassign-bucket`),
    onSuccess: () => invalidate(),
  });

  const toggle = useMutation({
    mutationFn: () => apiPost(`/api/clinics/${id}/${detail.data.clinic.is_active ? 'deactivate' : 'activate'}`),
    onSuccess: () => invalidate(),
  });

  const createSpecial = useMutation({
    mutationFn: (data) => apiPost('/api/special-pricing', data),
    onSuccess: () => { invalidate(); setAddingSpecial(false); },
  });

  const updateSpecial = useMutation({
    mutationFn: ({ spId, data }) => apiPatch(`/api/special-pricing/${spId}`, data),
    onSuccess: () => { invalidate(); setEditingSpecial(null); },
  });

  const toggleSpecial = useMutation({
    mutationFn: ({ spId, active }) => apiPost(`/api/special-pricing/${spId}/${active ? 'deactivate' : 'activate'}`),
    onSuccess: () => invalidate(),
  });

  if (detail.isLoading) return <div className="shell"><p className="muted">Loading…</p></div>;
  if (detail.isError) return <div className="shell"><p className="error">{String(detail.error.message || detail.error)}</p></div>;

  const { clinic, current_assignment, assignment_history } = detail.data;

  return (
    <div className="shell">
      <p className="muted">
        <Link to="/clinics">← All clinics</Link>
        {' · '}
        <Link to={`/clients/${clinic.client_id}`}>{clinic.client_name}</Link>
      </p>

      <div className="row-between">
        <div>
          <h1>{clinic.name}</h1>
          {clinic.legal_name && clinic.legal_name !== clinic.name && <p className="muted">{clinic.legal_name}</p>}
          {!clinic.is_active && <span className="badge err">inactive</span>}
        </div>
        <div className="row gap">
          <button className="btn ghost" onClick={() => setEditing(true)}>Edit</button>
          <button className="btn ghost" onClick={() => toggle.mutate()}>
            {clinic.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="row gap" style={{ flexWrap: 'wrap' }}>
          <Field label="Contact" value={clinic.contact_name} />
          <Field label="Email" value={clinic.contact_email} />
          <Field label="Phone" value={clinic.contact_phone} />
          <Field label="EIN" value={clinic.ein} />
          <Field label="Address" value={[clinic.address_line1, clinic.city, clinic.state, clinic.postal_code].filter(Boolean).join(', ')} />
        </div>
        {clinic.notes && <><h2>Notes</h2><p>{clinic.notes}</p></>}
      </div>

      <div className="row-between" style={{ marginTop: '1.5rem' }}>
        <h2>Pricing bucket</h2>
        <div className="row gap">
          {current_assignment && (
            <button className="btn ghost" onClick={() => { if (confirm('Unassign the current bucket?')) unassign.mutate(); }}>
              Unassign
            </button>
          )}
          <button className="btn primary" onClick={() => setAssigning(true)}>
            {current_assignment ? 'Switch bucket' : 'Assign bucket'}
          </button>
        </div>
      </div>

      <div className="card">
        {current_assignment ? (
          <>
            <p><strong><Link to={`/buckets/${current_assignment.bucket_id}`}>{current_assignment.bucket_name}</Link></strong></p>
            <p className="muted small">Assigned {new Date(current_assignment.assigned_at).toLocaleString()}{current_assignment.assigned_by_email ? ` by ${current_assignment.assigned_by_email}` : ''}</p>
          </>
        ) : (
          <p className="muted">No bucket assigned.</p>
        )}
      </div>

      <div className="row-between" style={{ marginTop: '1.5rem' }}>
        <h2>Special pricing</h2>
        <button className="btn primary" onClick={() => setAddingSpecial(true)}>+ Add special pricing</button>
      </div>
      <p className="muted">Overrides the bucket price for the conditions you set. Precedence: single-order &gt; time-limited &gt; client-specific.</p>

      <div className="card no-pad">
        <table className="tbl">
          <thead>
            <tr>
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
            {specials.isLoading && <tr><td colSpan={7} className="muted center">Loading…</td></tr>}
            {specials.data && specials.data.special_pricing.length === 0 && (
              <tr><td colSpan={7} className="muted center">No special pricing. This clinic uses its bucket price for everything.</td></tr>
            )}
            {specials.data && specials.data.special_pricing.map((sp) => {
              const unit = Number(sp.unit_price);
              const cost = Number(sp.labb_cost);
              const marginPct = unit > 0 ? ((unit - cost) / unit) * 100 : 0;
              return (
                <tr key={sp.id} className={sp.is_active ? '' : 'dim'}>
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
                    {sp.condition_type === 'client_specific' && <span className="muted">always</span>}
                  </td>
                  <td className="small">{sp.reason}</td>
                  <td className="right">
                    <button className="btn ghost" onClick={() => setEditingSpecial(sp)}>Edit</button>
                    <button className="btn ghost" onClick={() => toggleSpecial.mutate({ spId: sp.id, active: sp.is_active })}>
                      {sp.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 style={{ marginTop: '1.5rem' }}>Effective pricing</h2>
      <p className="muted">What this clinic is actually priced at today. Source shows whether the price comes from special pricing or the assigned bucket.</p>
      <div className="card no-pad">
        <table className="tbl">
          <thead>
            <tr>
              <th>Product</th>
              <th>Source</th>
              <th className="num">Unit price</th>
              <th className="num">Labb cost</th>
              <th className="num">Margin</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {effective.isLoading && <tr><td colSpan={6} className="muted center">Resolving…</td></tr>}
            {effective.data && effective.data.effective.length === 0 && (
              <tr><td colSpan={6} className="muted center">No effective pricing. Assign a bucket or add special pricing.</td></tr>
            )}
            {effective.data && effective.data.effective.map((r) => {
              const margin = r.unit_price - r.labb_cost;
              const marginPct = r.unit_price > 0 ? (margin / r.unit_price) * 100 : 0;
              return (
                <tr key={r.product_id}>
                  <td>{r.product_name}{r.unit_of_measure && <div className="muted small">{r.unit_of_measure}</div>}</td>
                  <td>
                    <span className={`badge ${r.source === 'special' ? '' : 'ok'}`}>
                      {r.source === 'special' ? `Special (${CONDITION_LABEL[r.condition_type]})` : 'Bucket'}
                    </span>
                  </td>
                  <td className="num">${Number(r.unit_price).toFixed(4)}</td>
                  <td className="num muted">${Number(r.labb_cost).toFixed(4)}</td>
                  <td className="num">
                    <span className={`badge ${margin < 0 ? 'err' : 'ok'}`}>{marginPct.toFixed(1)}%</span>
                    <div className="muted small">${margin.toFixed(4)}</div>
                  </td>
                  <td className="small">{r.source === 'special' ? r.reason : (r.notes || <span className="muted">—</span>)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {assignment_history.length > 0 && (
        <>
          <h2 style={{ marginTop: '1.5rem' }}>Bucket assignment history</h2>
          <div className="card no-pad">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Bucket</th>
                  <th>Assigned</th>
                  <th>Closed</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {assignment_history.map((h) => (
                  <tr key={h.id}>
                    <td><Link to={`/buckets/${h.bucket_id}`}>{h.bucket_name}</Link></td>
                    <td className="small">{new Date(h.assigned_at).toLocaleString()}</td>
                    <td className="small">{h.unassigned_at ? new Date(h.unassigned_at).toLocaleString() : <span className="badge ok">current</span>}</td>
                    <td className="small muted">{h.assigned_by_email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {editing && (
        <ClinicForm
          initial={clinic}
          title="Edit clinic"
          onCancel={() => setEditing(false)}
          onSubmit={(data) => save.mutate(data)}
          busy={save.isPending}
          error={save.error}
        />
      )}
      {assigning && (
        <AssignBucketForm
          buckets={(buckets.data?.buckets || []).filter((b) => b.is_active)}
          current={current_assignment}
          onCancel={() => setAssigning(false)}
          onSubmit={(data) => assign.mutate(data)}
          busy={assign.isPending}
          error={assign.error}
        />
      )}
      {addingSpecial && (
        <SpecialPricingForm
          mode="create"
          clinic={{ id: clinic.id, name: clinic.name }}
          onCancel={() => setAddingSpecial(false)}
          onSubmit={(data) => createSpecial.mutate(data)}
          busy={createSpecial.isPending}
          error={createSpecial.error}
        />
      )}
      {editingSpecial && (
        <SpecialPricingForm
          mode="edit"
          initial={editingSpecial}
          clinic={{ id: clinic.id, name: clinic.name }}
          onCancel={() => setEditingSpecial(null)}
          onSubmit={(data) => updateSpecial.mutate({ spId: editingSpecial.id, data })}
          busy={updateSpecial.isPending}
          error={updateSpecial.error}
        />
      )}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div style={{ minWidth: 160 }}>
      <div className="muted small" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.72rem' }}>{label}</div>
      <div>{value || <span className="muted">—</span>}</div>
    </div>
  );
}

function AssignBucketForm({ buckets, current, onSubmit, onCancel, busy, error }) {
  const [bucketId, setBucketId] = useState(buckets[0]?.id || '');
  const [notes, setNotes] = useState('');
  const submit = (e) => {
    e.preventDefault();
    onSubmit({ bucket_id: bucketId, notes: notes || null });
  };
  return (
    <div className="modal" role="dialog">
      <form className="card modal-card" onSubmit={submit}>
        <h2>{current ? 'Switch bucket' : 'Assign bucket'}</h2>
        {current && <p className="muted">Currently on <strong>{current.bucket_name}</strong>. Assigning a new bucket closes the current assignment.</p>}
        <label className="field"><span>Bucket *</span>
          <select value={bucketId} onChange={(e) => setBucketId(e.target.value)} required>
            {buckets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Notes (optional)</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for this assignment (visible in history)" />
        </label>
        {error && <p className="error">{String(error.message || error)}</p>}
        <div className="row gap end">
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!bucketId || busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}
