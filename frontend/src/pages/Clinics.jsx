import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../api';
import CsvImportModal from '../components/CsvImportModal';

// Dropdown source for sales rep — admin users only.
function useAdminUsers() {
  return useQuery({
    queryKey: ['users', 'admin'],
    queryFn: () => apiGet('/api/users?role=admin&active=true'),
  });
}
function formatRep(u) {
  if (!u) return '';
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ');
  return name ? `${name} (${u.email})` : u.email;
}

const CLINIC_CSV_HEADERS = [
  { key: 'name', required: true },
  { key: 'legal_name' },
  { key: 'ein' },
  { key: 'primary_contact_name' },
  { key: 'primary_contact_email' },
  { key: 'primary_contact_phone' },
  { key: 'address_line1' },
  { key: 'city' },
  { key: 'state' },
  { key: 'postal_code' },
  { key: 'notes' },
];

export default function Clinics() {
  const qc = useQueryClient();
  const [includeInactive, setIncludeInactive] = useState(false);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const list = useQuery({
    queryKey: ['clinics', includeInactive],
    queryFn: () => apiGet(`/api/clinics${includeInactive ? '?include_inactive=true' : ''}`),
  });

  const create = useMutation({
    mutationFn: (data) => apiPost('/api/clinics', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clinics'] }); setCreating(false); },
  });

  const [importRepId, setImportRepId] = useState('');
  const admins = useAdminUsers();
  const importCsv = useMutation({
    mutationFn: (clinics) => apiPost('/api/clinics/import', { sales_rep_id: importRepId, clinics }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clinics'] }); },
  });

  const toggle = useMutation({
    mutationFn: ({ id, active }) => apiPost(`/api/clinics/${id}/${active ? 'deactivate' : 'activate'}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinics'] }),
  });

  return (
    <div className="shell">
      <div className="row-between">
        <h1>Clinics</h1>
        <div className="row gap">
          <label className="row gap muted">
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            Show inactive
          </label>
          <button className="btn ghost" onClick={() => setImporting(true)}>Import CSV</button>
          <button className="btn primary" onClick={() => setCreating(true)}>+ New clinic</button>
        </div>
      </div>

      <p className="muted">Parent organizations. Each clinic has one or more clients, and each client signs its own contract.</p>

      {list.isLoading && <p className="muted">Loading…</p>}
      {list.isError && <p className="error">{String(list.error.message || list.error)}</p>}

      {list.data && (
        <div className="card no-pad">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Sales rep</th>
                <th>Contact</th>
                <th className="num">Active clients</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.data.clinics.length === 0 && (
                <tr><td colSpan={6} className="muted center">No clinics yet.</td></tr>
              )}
              {list.data.clinics.map((c) => (
                <tr key={c.id} className={c.is_active ? '' : 'dim'}>
                  <td>
                    <Link to={`/clinics/${c.id}`}><strong>{c.name}</strong></Link>
                    {c.legal_name && c.legal_name !== c.name && <div className="muted small">{c.legal_name}</div>}
                  </td>
                  <td className="small">
                    {c.sales_rep_email
                      ? (
                        <>
                          {[c.sales_rep_first_name, c.sales_rep_last_name].filter(Boolean).join(' ') || c.sales_rep_email}
                          <div className="muted">{c.sales_rep_email}</div>
                        </>
                      )
                      : <span className="badge err">unassigned</span>}
                  </td>
                  <td className="small">
                    {c.primary_contact_name || <span className="muted">—</span>}
                    {c.primary_contact_email && <div className="muted">{c.primary_contact_email}</div>}
                  </td>
                  <td className="num">
                    {c.active_client_count}
                    {c.total_client_count !== c.active_client_count && (
                      <div className="muted small">/ {c.total_client_count} total</div>
                    )}
                  </td>
                  <td><span className={`badge ${c.is_active ? 'ok' : 'err'}`}>{c.is_active ? 'active' : 'inactive'}</span></td>
                  <td className="right">
                    <Link className="btn ghost" to={`/clinics/${c.id}`}>Open</Link>
                    <button className="btn ghost" onClick={() => toggle.mutate({ id: c.id, active: c.is_active })}>
                      {c.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <ClinicForm
          onCancel={() => setCreating(false)}
          onSubmit={(data) => create.mutate(data)}
          busy={create.isPending}
          error={create.error}
        />
      )}

      {importing && (
        <CsvImportModal
          title="Import clinics from CSV"
          description="Create parent organizations in bulk. Duplicates are not checked — clinics with the same name are allowed. All imported clinics get the same sales rep; edit individuals afterward if needed."
          templateHeaders={CLINIC_CSV_HEADERS}
          templateFilename="clinics-template.csv"
          extraFields={
            <label className="field"><span>Sales rep for all imported clinics *</span>
              <select value={importRepId} onChange={(e) => setImportRepId(e.target.value)} required>
                <option value="">Select an admin user…</option>
                {(admins.data?.users || []).map((a) => (
                  <option key={a.id} value={a.id}>{formatRep(a)}</option>
                ))}
              </select>
            </label>
          }
          submitDisabled={!importRepId}
          parseRow={(r) => ({
            name: r.name || '',
            legal_name: r.legal_name || null,
            ein: r.ein || null,
            primary_contact_name: r.primary_contact_name || null,
            primary_contact_email: r.primary_contact_email || null,
            primary_contact_phone: r.primary_contact_phone || null,
            address_line1: r.address_line1 || null,
            city: r.city || null,
            state: r.state || null,
            postal_code: r.postal_code || null,
            notes: r.notes || null,
          })}
          previewColumns={[
            { key: 'name', label: 'Name' },
            { key: 'city', label: 'City' },
            { key: 'state', label: 'State' },
            { key: 'primary_contact_email', label: 'Email' },
          ]}
          onCancel={() => { setImporting(false); importCsv.reset(); }}
          onSubmit={(rows) => importCsv.mutate(rows)}
          busy={importCsv.isPending}
          error={importCsv.error}
          result={importCsv.data}
          renderResult={(r) => <p className="muted">✓ Imported {r.imported} clinic(s).</p>}
        />
      )}
    </div>
  );
}

export function ClinicForm({ initial = {}, onSubmit, onCancel, busy, error, title = 'New clinic' }) {
  const admins = useAdminUsers();
  const [f, setF] = useState({
    name: initial.name || '',
    legal_name: initial.legal_name || '',
    ein: initial.ein || '',
    sales_rep_id: initial.sales_rep_id || '',
    primary_contact_name: initial.primary_contact_name || '',
    primary_contact_email: initial.primary_contact_email || '',
    primary_contact_phone: initial.primary_contact_phone || '',
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
      sales_rep_id: f.sales_rep_id || null,
      primary_contact_name: f.primary_contact_name || null,
      primary_contact_email: f.primary_contact_email || null,
      primary_contact_phone: f.primary_contact_phone || null,
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
        <label className="field"><span>Sales rep *</span>
          <select value={f.sales_rep_id} onChange={u('sales_rep_id')} required>
            <option value="">Select an admin user…</option>
            {(admins.data?.users || []).map((a) => (
              <option key={a.id} value={a.id}>{formatRep(a)}</option>
            ))}
          </select>
          {admins.data && admins.data.users.length === 0 && (
            <span className="muted small">No admin users yet — create one in the Users tab first.</span>
          )}
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
          <label className="field grow"><span>Primary contact name</span>
            <input value={f.primary_contact_name} onChange={u('primary_contact_name')} />
          </label>
          <label className="field grow"><span>Contact email</span>
            <input type="email" value={f.primary_contact_email} onChange={u('primary_contact_email')} />
          </label>
        </div>
        <label className="field"><span>Phone</span>
          <input value={f.primary_contact_phone} onChange={u('primary_contact_phone')} />
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
          <textarea rows={3} value={f.notes} onChange={u('notes')} />
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
