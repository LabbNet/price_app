import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../api';
import CsvImportModal from '../components/CsvImportModal';
import AddressLookup from '../components/AddressLookup';

export const ACCOUNT_CATEGORIES = ['Employment', 'Corrections', 'Treatment', 'Education'];
export const EMPLOYMENT_SUBCATEGORIES = [
  'Construction',
  'Manufacturing',
  'Staffing agencies',
  'Nursing homes & Home Health',
  'Hospitals',
  'Oil & Gas',
  'Mining',
  'Delivery & Transportation',
  'Food Processing',
  'Warehousing',
  'Other',
];

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
  const [typeFilter, setTypeFilter] = useState('all');
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const list = useQuery({
    queryKey: ['clinics', includeInactive, typeFilter],
    queryFn: () => {
      const q = new URLSearchParams();
      if (includeInactive) q.set('include_inactive', 'true');
      if (typeFilter !== 'all') q.set('account_type', typeFilter);
      const qs = q.toString();
      return apiGet(`/api/clinics${qs ? '?' + qs : ''}`);
    },
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
        <h1>Accounts</h1>
        <div className="row gap">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All types</option>
            <option value="pro">PRO only</option>
            <option value="standard">Standard only</option>
          </select>
          <label className="row gap muted">
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            Show inactive
          </label>
          <button className="btn ghost" onClick={() => setImporting(true)}>Import CSV</button>
          <button className="btn primary" onClick={() => setCreating(true)}>+ New account</button>
        </div>
      </div>

      <p className="muted"><strong>PRO</strong> accounts have one or more clients underneath (each client signs its own contract). <strong>Standard</strong> accounts are end-users directly — no clients.</p>

      {list.isLoading && <p className="muted">Loading…</p>}
      {list.isError && <p className="error">{String(list.error.message || list.error)}</p>}

      {list.data && (
        <div className="card no-pad">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Sales rep</th>
                <th>Contact</th>
                <th className="num">Clients</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.data.clinics.length === 0 && (
                <tr><td colSpan={7} className="muted center">No accounts yet.</td></tr>
              )}
              {list.data.clinics.map((c) => (
                <tr key={c.id} className={c.is_active ? '' : 'dim'}>
                  <td>
                    <Link to={`/clinics/${c.id}`}><strong>{c.name}</strong></Link>
                    {c.legal_name && c.legal_name !== c.name && <div className="muted small">{c.legal_name}</div>}
                  </td>
                  <td>
                    <span className={`badge ${c.account_type === 'pro' ? 'ok' : ''}`}>
                      {c.account_type === 'pro' ? 'PRO' : 'Standard'}
                    </span>
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
                    {c.account_type === 'standard' ? (
                      <span className="muted small">end-user</span>
                    ) : (
                      <>
                        {c.active_client_count}
                        {c.total_client_count !== c.active_client_count && (
                          <div className="muted small">/ {c.total_client_count} total</div>
                        )}
                      </>
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
          renderResult={(r) => <p className="muted">✓ Imported {r.imported} account(s).</p>}
        />
      )}
    </div>
  );
}

export function ClinicForm({ initial = {}, onSubmit, onCancel, busy, error, title = 'New account' }) {
  const admins = useAdminUsers();
  const [f, setF] = useState({
    name: initial.name || '',
    legal_name: initial.legal_name || '',
    ein: initial.ein || '',
    account_type: initial.account_type || 'pro',
    category: initial.category || '',
    subcategory: initial.subcategory || '',
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
  const u = (k) => (e) => setF((prev) => {
    const next = { ...prev, [k]: e.target.value };
    // Clear subcategory when category moves off Employment
    if (k === 'category' && next.category !== 'Employment') next.subcategory = '';
    // Clear category/subcategory when toggling back to PRO
    if (k === 'account_type' && next.account_type === 'pro') { next.category = ''; next.subcategory = ''; }
    return next;
  });

  const [duplicateMatches, setDuplicateMatches] = useState(null);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

  const buildPayload = () => ({
    name: f.name,
    legal_name: f.legal_name || null,
    ein: f.ein || null,
    account_type: f.account_type,
    category: f.account_type === 'standard' ? (f.category || null) : null,
    subcategory: f.account_type === 'standard' && f.category === 'Employment' ? (f.subcategory || null) : null,
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

  const submit = async (e) => {
    e.preventDefault();
    if (duplicateMatches) {
      // User already saw the warning; treat submit as "proceed anyway".
      onSubmit(buildPayload());
      return;
    }
    // Preflight duplicate check (manual add / edit only — skip if no address)
    if (f.address_line1 || f.postal_code) {
      setCheckingDuplicates(true);
      try {
        const q = new URLSearchParams();
        if (f.address_line1) q.set('address_line1', f.address_line1);
        if (f.city) q.set('city', f.city);
        if (f.state) q.set('state', f.state);
        if (f.postal_code) q.set('postal_code', f.postal_code);
        if (initial.id) q.set('exclude_id', initial.id);
        const { matches } = await apiGet(`/api/clinics/check-duplicate?${q.toString()}`);
        setCheckingDuplicates(false);
        if (matches.length > 0) {
          setDuplicateMatches(matches);
          return;
        }
      } catch {
        setCheckingDuplicates(false);
        // On check failure, fall through and submit anyway.
      }
    }
    onSubmit(buildPayload());
  };
  return (
    <div className="modal" role="dialog">
      <form className="card modal-card" onSubmit={submit}>
        <h2>{title}</h2>
        <label className="field"><span>Name *</span>
          <input value={f.name} onChange={u('name')} required autoFocus />
        </label>
        <label className="field">
          <span>Account type *</span>
          <div className="row gap" role="radiogroup">
            <label className="row gap">
              <input type="radio" name="account_type" value="pro" checked={f.account_type === 'pro'} onChange={u('account_type')} />
              <span><strong>PRO</strong> — has one or more clients underneath</span>
            </label>
            <label className="row gap">
              <input type="radio" name="account_type" value="standard" checked={f.account_type === 'standard'} onChange={u('account_type')} />
              <span><strong>Standard</strong> — end-user, no clients</span>
            </label>
          </div>
        </label>
        {f.account_type === 'standard' && (
          <div className="row gap">
            <label className="field grow"><span>Category *</span>
              <select value={f.category} onChange={u('category')} required>
                <option value="">Select category…</option>
                {ACCOUNT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            {f.category === 'Employment' && (
              <label className="field grow"><span>Sub-category *</span>
                <select value={f.subcategory} onChange={u('subcategory')} required>
                  <option value="">Select sub-category…</option>
                  {EMPLOYMENT_SUBCATEGORIES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            )}
          </div>
        )}
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
          <AddressLookup
            value={f.address_line1}
            onChange={(v) => setF((prev) => ({ ...prev, address_line1: v }))}
            onSelect={(parts) => setF((prev) => ({
              ...prev,
              address_line1: parts.address_line1 || prev.address_line1,
              city: parts.city || prev.city,
              state: parts.state || prev.state,
              postal_code: parts.postal_code || prev.postal_code,
            }))}
          />
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

        {duplicateMatches && duplicateMatches.length > 0 && (
          <div className="card" style={{ background: 'rgba(230,62,87,0.08)', borderColor: 'var(--labb-red)' }}>
            <h3 style={{ margin: 0, color: 'var(--labb-red)' }}>⚠ Possible duplicate</h3>
            <p className="muted small">
              {duplicateMatches.some((m) => m.match_score === 4)
                ? 'This address exactly matches an existing account. Saving will auto-delete the new one.'
                : `This address partially matches an existing account (${duplicateMatches[0].match_score}/4 fields). Save anyway to queue it for review.`}
            </p>
            <ul className="muted small">
              {duplicateMatches.map((m) => (
                <li key={m.id}>
                  <strong>{m.name}</strong> — {[m.address_line1, m.city, m.state, m.postal_code].filter(Boolean).join(', ')}
                  {' '}<span className="badge">{m.match_score}/4</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="row gap end">
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          <button
            type="submit"
            className="btn primary"
            disabled={busy || checkingDuplicates}
          >
            {busy ? 'Saving…' : checkingDuplicates ? 'Checking…' : duplicateMatches ? 'Save anyway' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
