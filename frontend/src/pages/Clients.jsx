import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api';

const PAGE = 50;

export default function Clients() {
  const [search, setSearch] = useState('');
  const [clinicFilter, setClinicFilter] = useState('');
  const [bucketFilter, setBucketFilter] = useState('');
  const [offset, setOffset] = useState(0);

  const clinicsQ = useQuery({ queryKey: ['clinics', false], queryFn: () => apiGet('/api/clinics') });
  const bucketsQ = useQuery({ queryKey: ['buckets', false], queryFn: () => apiGet('/api/buckets') });

  const list = useQuery({
    queryKey: ['clients', { search, clinicFilter, bucketFilter, offset }],
    queryFn: () => {
      const q = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (search) q.set('search', search);
      if (clinicFilter) q.set('clinic_id', clinicFilter);
      if (bucketFilter === 'unassigned') q.set('unassigned', 'true');
      else if (bucketFilter) q.set('bucket_id', bucketFilter);
      return apiGet(`/api/clients?${q.toString()}`);
    },
  });

  const total = list.data?.total ?? 0;
  const pageEnd = Math.min(offset + PAGE, total);

  return (
    <div className="shell">
      <div className="row-between">
        <h1>Clients</h1>
      </div>
      <p className="muted">Global directory of every client across every clinic. Use the filters to narrow down.</p>

      <div className="card">
        <div className="row gap" style={{ flexWrap: 'wrap' }}>
          <input
            className="search grow"
            placeholder="Search by name, city, state, email…"
            value={search}
            onChange={(e) => { setOffset(0); setSearch(e.target.value); }}
            style={{ minWidth: 240 }}
          />
          <select value={clinicFilter} onChange={(e) => { setOffset(0); setClinicFilter(e.target.value); }}>
            <option value="">All clinics</option>
            {(clinicsQ.data?.clinics || []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select value={bucketFilter} onChange={(e) => { setOffset(0); setBucketFilter(e.target.value); }}>
            <option value="">All buckets</option>
            <option value="unassigned">— Unassigned —</option>
            {(bucketsQ.data?.buckets || []).filter((b) => b.is_active).map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {list.isLoading && <p className="muted">Loading…</p>}
      {list.isError && <p className="error">{String(list.error.message || list.error)}</p>}

      {list.data && (
        <>
          <div className="card no-pad">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Clinic</th>
                  <th>Location</th>
                  <th>Bucket</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.data.clients.length === 0 && (
                  <tr><td colSpan={5} className="muted center">No clients match.</td></tr>
                )}
                {list.data.clients.map((cl) => (
                  <tr key={cl.id} className={cl.is_active ? '' : 'dim'}>
                    <td><Link to={`/clients/${cl.id}`}><strong>{cl.name}</strong></Link></td>
                    <td><Link to={`/clinics/${cl.clinic_id}`} className="muted">{cl.clinic_name}</Link></td>
                    <td className="small">{[cl.city, cl.state].filter(Boolean).join(', ') || <span className="muted">—</span>}</td>
                    <td>{cl.bucket_name ? <Link to={`/buckets/${cl.bucket_id}`}>{cl.bucket_name}</Link> : <span className="muted">Unassigned</span>}</td>
                    <td className="right"><Link className="btn ghost" to={`/clients/${cl.id}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="row-between">
            <span className="muted small">{total === 0 ? '0' : `${offset + 1}–${pageEnd}`} of {total}</span>
            <div className="row gap">
              <button className="btn ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>← Prev</button>
              <button className="btn ghost" disabled={pageEnd >= total} onClick={() => setOffset(offset + PAGE)}>Next →</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function ClientForm({ initial = {}, onSubmit, onCancel, busy, error, title = 'New client' }) {
  const [f, setF] = useState({
    name: initial.name || '',
    legal_name: initial.legal_name || '',
    ein: initial.ein || '',
    contact_name: initial.contact_name || '',
    contact_email: initial.contact_email || '',
    contact_phone: initial.contact_phone || '',
    address_line1: initial.address_line1 || '',
    city: initial.city || '',
    state: initial.state || '',
    postal_code: initial.postal_code || '',
    notes: initial.notes || '',
  });
  const u = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    onSubmit({
      name: f.name,
      legal_name: f.legal_name || null,
      ein: f.ein || null,
      contact_name: f.contact_name || null,
      contact_email: f.contact_email || null,
      contact_phone: f.contact_phone || null,
      address_line1: f.address_line1 || null,
      city: f.city || null,
      state: f.state || null,
      postal_code: f.postal_code || null,
      notes: f.notes || null,
    });
  };
  return (
    <div className="modal" role="dialog">
      <form className="card modal-card" onSubmit={submit}>
        <h2>{title}</h2>
        <label className="field"><span>Name *</span>
          <input value={f.name} onChange={u('name')} required autoFocus />
        </label>
        <div className="row gap">
          <label className="field grow"><span>Legal name</span>
            <input value={f.legal_name} onChange={u('legal_name')} />
          </label>
          <label className="field grow"><span>EIN</span>
            <input value={f.ein} onChange={u('ein')} />
          </label>
        </div>
        <div className="row gap">
          <label className="field grow"><span>Contact name</span>
            <input value={f.contact_name} onChange={u('contact_name')} />
          </label>
          <label className="field grow"><span>Contact email</span>
            <input type="email" value={f.contact_email} onChange={u('contact_email')} />
          </label>
        </div>
        <label className="field"><span>Contact phone</span>
          <input value={f.contact_phone} onChange={u('contact_phone')} />
        </label>
        <label className="field"><span>Address</span>
          <input value={f.address_line1} onChange={u('address_line1')} />
        </label>
        <div className="row gap">
          <label className="field grow"><span>City</span>
            <input value={f.city} onChange={u('city')} />
          </label>
          <label className="field" style={{ width: 100 }}><span>State</span>
            <input value={f.state} onChange={u('state')} />
          </label>
          <label className="field" style={{ width: 140 }}><span>ZIP</span>
            <input value={f.postal_code} onChange={u('postal_code')} />
          </label>
        </div>
        <label className="field"><span>Notes</span>
          <textarea rows={2} value={f.notes} onChange={u('notes')} />
        </label>
        {error && <p className="error">{String(error.message || error)}</p>}
        <div className="row gap end">
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}
