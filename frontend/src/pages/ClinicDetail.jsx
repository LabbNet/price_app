import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch } from '../api';
import { ClinicForm } from './Clinics';
import { ClientForm } from './Clients';
import { parseCsvToObjects } from '../lib/csv';

const PAGE = 50;

export default function ClinicDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);
  const [importing, setImporting] = useState(false);
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [bucketFilter, setBucketFilter] = useState('');

  const clinic = useQuery({ queryKey: ['clinic', id], queryFn: () => apiGet(`/api/clinics/${id}`) });
  const clients = useQuery({
    queryKey: ['clients', { clinic_id: id, offset, search, bucketFilter }],
    queryFn: () => {
      const q = new URLSearchParams({
        clinic_id: id,
        limit: String(PAGE),
        offset: String(offset),
      });
      if (search) q.set('search', search);
      if (bucketFilter === 'unassigned') q.set('unassigned', 'true');
      else if (bucketFilter) q.set('bucket_id', bucketFilter);
      return apiGet(`/api/clients?${q.toString()}`);
    },
  });
  const buckets = useQuery({ queryKey: ['buckets', false], queryFn: () => apiGet('/api/buckets') });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['clinic', id] });
    qc.invalidateQueries({ queryKey: ['clients'] });
    qc.invalidateQueries({ queryKey: ['clinics'] });
  };

  const saveClinic = useMutation({
    mutationFn: (data) => apiPatch(`/api/clinics/${id}`, data),
    onSuccess: () => { invalidate(); setEditing(false); },
  });

  const createClient = useMutation({
    mutationFn: (data) => apiPost('/api/clients', { ...data, clinic_id: id }),
    onSuccess: () => { invalidate(); setCreatingClient(false); },
  });

  const bulkImport = useMutation({
    mutationFn: (rows) => apiPost('/api/clients/import', { clinic_id: id, clients: rows }),
    onSuccess: () => { invalidate(); setImporting(false); },
  });

  const bulkAssign = useMutation({
    mutationFn: (bucket_id) => apiPost(`/api/clinics/${id}/assign-bucket-to-all`, { bucket_id }),
    onSuccess: () => { invalidate(); setBulkAssigning(false); },
  });

  if (clinic.isLoading) return <div className="shell"><p className="muted">Loading…</p></div>;
  if (clinic.isError) return <div className="shell"><p className="error">{String(clinic.error.message || clinic.error)}</p></div>;

  const c = clinic.data.clinic;
  const total = clients.data?.total ?? 0;
  const pageEnd = Math.min(offset + PAGE, total);
  const bucketOptions = (buckets.data?.buckets || []).filter((b) => b.is_active);

  return (
    <div className="shell">
      <p className="muted"><Link to="/clinics">← All clinics</Link></p>

      <div className="row-between">
        <div>
          <h1>{c.name}</h1>
          {c.legal_name && c.legal_name !== c.name && <p className="muted">{c.legal_name}</p>}
          {!c.is_active && <span className="badge err">inactive</span>}
        </div>
        <div className="row gap">
          <button className="btn ghost" onClick={() => setEditing(true)}>Edit</button>
        </div>
      </div>

      <div className="card">
        <div className="row gap" style={{ flexWrap: 'wrap' }}>
          <Field label="Contact" value={c.primary_contact_name} />
          <Field label="Email" value={c.primary_contact_email} />
          <Field label="Phone" value={c.primary_contact_phone} />
          <Field label="EIN" value={c.ein} />
          <Field label="Location" value={[c.city, c.state].filter(Boolean).join(', ')} />
        </div>
        {c.notes && <><h2>Notes</h2><p>{c.notes}</p></>}
      </div>

      <div className="row-between" style={{ marginTop: '1.5rem' }}>
        <h2>Clients ({total})</h2>
        <div className="row gap">
          <button className="btn ghost" onClick={() => setBulkAssigning(true)} disabled={total === 0}>
            Bulk-assign bucket
          </button>
          <button className="btn ghost" onClick={() => setImporting(true)}>Import CSV</button>
          <button className="btn primary" onClick={() => setCreatingClient(true)}>+ Add client</button>
        </div>
      </div>

      <div className="card">
        <div className="row gap">
          <input
            className="search"
            placeholder="Search by name, city, state, email…"
            value={search}
            onChange={(e) => { setOffset(0); setSearch(e.target.value); }}
          />
          <select value={bucketFilter} onChange={(e) => { setOffset(0); setBucketFilter(e.target.value); }}>
            <option value="">All buckets</option>
            <option value="unassigned">— Unassigned —</option>
            {bucketOptions.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>

      {clients.isLoading && <p className="muted">Loading clients…</p>}
      {clients.isError && <p className="error">{String(clients.error.message || clients.error)}</p>}

      {clients.data && (
        <>
          <div className="card no-pad">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Location</th>
                  <th>Contact</th>
                  <th>Bucket</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {clients.data.clients.length === 0 && (
                  <tr><td colSpan={6} className="muted center">No clients match.</td></tr>
                )}
                {clients.data.clients.map((cl) => (
                  <tr key={cl.id} className={cl.is_active ? '' : 'dim'}>
                    <td><Link to={`/clients/${cl.id}`}><strong>{cl.name}</strong></Link></td>
                    <td className="small">{[cl.city, cl.state].filter(Boolean).join(', ') || <span className="muted">—</span>}</td>
                    <td className="small">
                      {cl.contact_name || <span className="muted">—</span>}
                      {cl.contact_email && <div className="muted">{cl.contact_email}</div>}
                    </td>
                    <td>
                      {cl.bucket_name
                        ? <Link to={`/buckets/${cl.bucket_id}`}>{cl.bucket_name}</Link>
                        : <span className="muted">Unassigned</span>}
                    </td>
                    <td><span className={`badge ${cl.is_active ? 'ok' : 'err'}`}>{cl.is_active ? 'active' : 'inactive'}</span></td>
                    <td className="right">
                      <Link className="btn ghost" to={`/clients/${cl.id}`}>Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > PAGE && (
            <div className="row-between">
              <span className="muted small">{offset + 1}–{pageEnd} of {total}</span>
              <div className="row gap">
                <button className="btn ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>← Prev</button>
                <button className="btn ghost" disabled={pageEnd >= total} onClick={() => setOffset(offset + PAGE)}>Next →</button>
              </div>
            </div>
          )}
        </>
      )}

      {editing && (
        <ClinicForm
          initial={c}
          title="Edit clinic"
          onCancel={() => setEditing(false)}
          onSubmit={(data) => saveClinic.mutate(data)}
          busy={saveClinic.isPending}
          error={saveClinic.error}
        />
      )}
      {creatingClient && (
        <ClientForm
          onCancel={() => setCreatingClient(false)}
          onSubmit={(data) => createClient.mutate(data)}
          busy={createClient.isPending}
          error={createClient.error}
        />
      )}
      {importing && (
        <ImportCsv
          onCancel={() => setImporting(false)}
          onSubmit={(rows) => bulkImport.mutate(rows)}
          busy={bulkImport.isPending}
          error={bulkImport.error}
          result={bulkImport.data}
        />
      )}
      {bulkAssigning && (
        <BulkAssign
          buckets={bucketOptions}
          clientCount={total}
          clinicName={c.name}
          onCancel={() => setBulkAssigning(false)}
          onSubmit={(bucket_id) => bulkAssign.mutate(bucket_id)}
          busy={bulkAssign.isPending}
          error={bulkAssign.error}
          result={bulkAssign.data}
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

function ImportCsv({ onSubmit, onCancel, busy, error, result }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => setText(String(r.result || ''));
    r.readAsText(file);
  };

  const parse = () => {
    const rows = parseCsvToObjects(text).map((r) => ({
      name: r.name || '',
      legal_name: r.legal_name || null,
      ein: r.ein || null,
      contact_name: r.contact_name || null,
      contact_email: r.contact_email || null,
      contact_phone: r.contact_phone || null,
      address_line1: r.address_line1 || r.address || null,
      address_line2: r.address_line2 || null,
      city: r.city || null,
      state: r.state || null,
      postal_code: r.postal_code || r.zip || null,
      notes: r.notes || null,
    }));
    setPreview(rows);
  };

  const submit = () => {
    if (!preview) return;
    const valid = preview.filter((r) => r.name);
    onSubmit(valid);
  };

  return (
    <div className="modal" role="dialog">
      <div className="card modal-card" style={{ maxWidth: 780 }}>
        <h2>Import clients from CSV</h2>
        <p className="muted">
          Expected headers (case-insensitive): <code>name</code> (required), <code>legal_name</code>, <code>ein</code>,{' '}
          <code>contact_name</code>, <code>contact_email</code>, <code>contact_phone</code>,{' '}
          <code>address_line1</code>, <code>city</code>, <code>state</code>, <code>postal_code</code>, <code>notes</code>.
        </p>
        <label className="field"><span>Choose file</span>
          <input type="file" accept=".csv,text/csv" onChange={onFile} />
        </label>
        <label className="field"><span>…or paste CSV</span>
          <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="name,city,state..." />
        </label>
        <div className="row gap">
          <button type="button" className="btn ghost" onClick={parse} disabled={!text}>Parse</button>
          {preview && <span className="muted small">Parsed {preview.length} row(s), {preview.filter((r) => r.name).length} valid (have a name).</span>}
        </div>
        {preview && preview.length > 0 && (
          <div className="card no-pad" style={{ maxHeight: 240, overflow: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>Name</th><th>City</th><th>State</th><th>Email</th></tr></thead>
              <tbody>
                {preview.slice(0, 25).map((r, i) => (
                  <tr key={i}>
                    <td>{r.name || <span className="error">missing</span>}</td>
                    <td>{r.city || <span className="muted">—</span>}</td>
                    <td>{r.state || <span className="muted">—</span>}</td>
                    <td className="small">{r.contact_email || <span className="muted">—</span>}</td>
                  </tr>
                ))}
                {preview.length > 25 && <tr><td colSpan={4} className="muted center">…and {preview.length - 25} more</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {error && <p className="error">{String(error.message || error)}</p>}
        {result && <p className="muted">✓ Imported {result.imported} client(s).</p>}
        <div className="row gap end">
          <button type="button" className="btn ghost" onClick={onCancel}>Close</button>
          <button
            type="button"
            className="btn primary"
            disabled={!preview || preview.filter((r) => r.name).length === 0 || busy}
            onClick={submit}
          >{busy ? 'Importing…' : `Import ${preview ? preview.filter((r) => r.name).length : 0}`}</button>
        </div>
      </div>
    </div>
  );
}

function BulkAssign({ buckets, clientCount, clinicName, onSubmit, onCancel, busy, error, result }) {
  const [bucketId, setBucketId] = useState(buckets[0]?.id || '');
  return (
    <div className="modal" role="dialog">
      <div className="card modal-card">
        <h2>Bulk-assign bucket</h2>
        <p className="muted">Assigns the selected bucket to every active client under <strong>{clinicName}</strong> ({clientCount} client{clientCount === 1 ? '' : 's'}). Prior assignments are closed.</p>
        <label className="field"><span>Bucket</span>
          <select value={bucketId} onChange={(e) => setBucketId(e.target.value)}>
            {buckets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        {error && <p className="error">{String(error.message || error)}</p>}
        {result && <p className="muted">✓ Updated {result.updated} client(s).</p>}
        <div className="row gap end">
          <button type="button" className="btn ghost" onClick={onCancel}>Close</button>
          <button type="button" className="btn primary" disabled={!bucketId || busy} onClick={() => onSubmit(bucketId)}>
            {busy ? 'Assigning…' : 'Assign to all'}
          </button>
        </div>
      </div>
    </div>
  );
}
