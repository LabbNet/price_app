import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch } from '../api';
import { ClientForm } from './Clients';
import SpecialPricingForm from '../components/SpecialPricingForm';
import { NewContractForm } from './Contracts';

const CONDITION_LABEL = {
  time_limited: 'Time-limited',
  single_order: 'Single-order',
  clinic_specific: 'Clinic-specific',
};

export default function ClientDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [addingSpecial, setAddingSpecial] = useState(false);
  const [editingSpecial, setEditingSpecial] = useState(null);
  const [creatingContract, setCreatingContract] = useState(false);

  const contractsQ = useQuery({ queryKey: ['contracts', { client: id }], queryFn: () => apiGet(`/api/contracts?client_id=${id}`) });
  const createContract = useMutation({
    mutationFn: (data) => apiPost('/api/contracts', data),
    onSuccess: (r) => { setCreatingContract(false); nav(`/contracts/${r.contract.id}`); },
  });

  const detail = useQuery({ queryKey: ['client', id], queryFn: () => apiGet(`/api/clients/${id}`) });
  const buckets = useQuery({ queryKey: ['buckets', false], queryFn: () => apiGet('/api/buckets') });
  const specials = useQuery({
    queryKey: ['special-pricing', { client: id }],
    queryFn: () => apiGet(`/api/special-pricing?client_id=${id}`),
  });
  const effective = useQuery({
    queryKey: ['effective', id],
    queryFn: () => apiGet(`/api/special-pricing/resolve-client/${id}`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['client', id] });
    qc.invalidateQueries({ queryKey: ['clients'] });
    qc.invalidateQueries({ queryKey: ['special-pricing'] });
    qc.invalidateQueries({ queryKey: ['effective', id] });
  };

  const save = useMutation({
    mutationFn: (data) => apiPatch(`/api/clients/${id}`, data),
    onSuccess: () => { invalidate(); setEditing(false); },
  });

  const assign = useMutation({
    mutationFn: (data) => apiPost(`/api/clients/${id}/assign-bucket`, data),
    onSuccess: () => { invalidate(); setAssigning(false); },
  });

  const unassign = useMutation({
    mutationFn: () => apiPost(`/api/clients/${id}/unassign-bucket`),
    onSuccess: () => invalidate(),
  });

  const toggle = useMutation({
    mutationFn: () => apiPost(`/api/clients/${id}/${detail.data.client.is_active ? 'deactivate' : 'activate'}`),
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

  const { client, current_assignment, assignment_history } = detail.data;

  return (
    <div className="shell">
      <p className="muted">
        <Link to="/clients">← All clients</Link>
        {' · '}
        <Link to={`/clinics/${client.clinic_id}`}>{client.clinic_name}</Link>
      </p>

      <div className="row-between">
        <div>
          <h1>{client.name}</h1>
          {client.legal_name && client.legal_name !== client.name && <p className="muted">{client.legal_name}</p>}
          {!client.is_active && <span className="badge err">inactive</span>}
        </div>
        <div className="row gap">
          <button className="btn ghost" onClick={() => setEditing(true)}>Edit</button>
          <button className="btn ghost" onClick={() => toggle.mutate()}>
            {client.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="row gap" style={{ flexWrap: 'wrap' }}>
          <Field label="Contact" value={client.contact_name} />
          <Field label="Email" value={client.contact_email} />
          <Field label="Phone" value={client.contact_phone} />
          <Field label="EIN" value={client.ein} />
          <Field label="Address" value={[client.address_line1, client.city, client.state, client.postal_code].filter(Boolean).join(', ')} />
        </div>
        {client.notes && <><h2>Notes</h2><p>{client.notes}</p></>}
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
      <p className="muted">Overrides the bucket price for the conditions you set. Precedence: single-order &gt; time-limited &gt; clinic-specific.</p>

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
              <tr><td colSpan={7} className="muted center">No special pricing. This client uses its bucket price for everything.</td></tr>
            )}
            {specials.data && specials.data.special_pricing.map((sp) => {
              const unit = Number(sp.unit_price);
              const cost = Number(sp.labb_cost);
              const marginPct = unit > 0 ? ((unit - cost) / unit) * 100 : 0;
              return (
                <tr key={sp.id} className={sp.is_active ? '' : 'dim'}>
                  <td>{sp.product_name}{sp.unit_of_measure && <div className="muted small">{sp.unit_of_measure}</div>}</td>
                  <td><span className="badge">{CONDITION_LABEL[sp.condition_type]}</span></td>
                  <td className="num">${unit.toFixed(2)}</td>
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
      <p className="muted">What this client is actually priced at today. Source shows whether the price comes from special pricing or the assigned bucket.</p>
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
                  <td className="num">${Number(r.unit_price).toFixed(2)}</td>
                  <td className="num muted">${Number(r.labb_cost).toFixed(2)}</td>
                  <td className="num">
                    <span className={`badge ${margin < 0 ? 'err' : 'ok'}`}>{marginPct.toFixed(1)}%</span>
                    <div className="muted small">${margin.toFixed(2)}</div>
                  </td>
                  <td className="small">{r.source === 'special' ? r.reason : (r.notes || <span className="muted">—</span>)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="row-between" style={{ marginTop: '1.5rem' }}>
        <h2>Contracts</h2>
        <button className="btn primary" onClick={() => setCreatingContract(true)}>+ New contract</button>
      </div>
      <div className="card no-pad">
        <table className="tbl">
          <thead>
            <tr>
              <th>Template</th>
              <th>Status</th>
              <th>Sent</th>
              <th>Signed</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {contractsQ.isLoading && <tr><td colSpan={5} className="muted center">Loading…</td></tr>}
            {contractsQ.data && contractsQ.data.contracts.length === 0 && (
              <tr><td colSpan={5} className="muted center">No contracts yet.</td></tr>
            )}
            {contractsQ.data && contractsQ.data.contracts.map((c) => (
              <tr key={c.id}>
                <td><Link to={`/contracts/${c.id}`}>{c.template_name || '—'}</Link> <span className="muted small">v{c.template_version}</span></td>
                <td><span className={`badge ${c.status === 'active' ? 'ok' : c.status === 'terminated' ? 'err' : ''}`}>{c.status}</span></td>
                <td className="small">{c.sent_at ? new Date(c.sent_at).toLocaleDateString() : <span className="muted">—</span>}</td>
                <td className="small">{c.counter_signed_at ? new Date(c.counter_signed_at).toLocaleDateString() : c.signed_by_clinic_at ? new Date(c.signed_by_clinic_at).toLocaleDateString() + ' (clinic)' : <span className="muted">—</span>}</td>
                <td className="right"><Link className="btn ghost" to={`/contracts/${c.id}`}>Open</Link></td>
              </tr>
            ))}
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
        <ClientForm
          initial={client}
          title="Edit client"
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
          client={{ id: client.id, name: client.name }}
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
          client={{ id: client.id, name: client.name }}
          onCancel={() => setEditingSpecial(null)}
          onSubmit={(data) => updateSpecial.mutate({ spId: editingSpecial.id, data })}
          busy={updateSpecial.isPending}
          error={updateSpecial.error}
        />
      )}
      {creatingContract && (
        <NewContractForm
          initial={{ client_id: client.id, client_name: client.name, clinic_id: client.clinic_id }}
          onCancel={() => setCreatingContract(false)}
          onSubmit={(data) => createContract.mutate(data)}
          busy={createContract.isPending}
          error={createContract.error}
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
