import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../api';

export default function ContractTemplates() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);

  const list = useQuery({
    queryKey: ['contract-templates', includeInactive],
    queryFn: () => apiGet(`/api/contract-templates${includeInactive ? '?include_inactive=true' : ''}`),
  });

  const create = useMutation({
    mutationFn: (data) => apiPost('/api/contract-templates', data),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['contract-templates'] });
      setCreating(false);
      window.location.href = `/contract-templates/${r.template.id}`;
    },
  });

  const toggle = useMutation({
    mutationFn: ({ id, active }) => apiPost(`/api/contract-templates/${id}/${active ? 'deactivate' : 'activate'}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contract-templates'] }),
  });

  return (
    <div className="shell">
      <div className="row-between">
        <h1>Contract templates</h1>
        <div className="row gap">
          <label className="row gap muted">
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            Show inactive
          </label>
          <button className="btn primary" onClick={() => setCreating(true)}>+ New template</button>
        </div>
      </div>

      <p className="muted">
        Templates use <code>{'{{field_name}}'}</code> merge fields. <code>{'{{pricing_table}}'}</code> expands into the client's effective pricing when a contract is created.
      </p>

      {list.isLoading && <p className="muted">Loading…</p>}
      {list.isError && <p className="error">{String(list.error.message || list.error)}</p>}

      {list.data && (
        <div className="card no-pad">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th className="num">Version</th>
                <th>Status</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.data.templates.length === 0 && (
                <tr><td colSpan={5} className="muted center">No templates yet.</td></tr>
              )}
              {list.data.templates.map((t) => (
                <tr key={t.id} className={t.is_active ? '' : 'dim'}>
                  <td><Link to={`/contract-templates/${t.id}`}><strong>{t.name}</strong></Link></td>
                  <td className="num">v{t.version}</td>
                  <td><span className={`badge ${t.is_active ? 'ok' : 'err'}`}>{t.is_active ? 'active' : 'inactive'}</span></td>
                  <td className="muted small">{new Date(t.updated_at).toLocaleDateString()}</td>
                  <td className="right">
                    <Link className="btn ghost" to={`/contract-templates/${t.id}`}>Open</Link>
                    <button className="btn ghost" onClick={() => toggle.mutate({ id: t.id, active: t.is_active })}>
                      {t.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <NewTemplateForm
          onCancel={() => setCreating(false)}
          onSubmit={(data) => create.mutate(data)}
          busy={create.isPending}
          error={create.error}
        />
      )}
    </div>
  );
}

function NewTemplateForm({ onSubmit, onCancel, busy, error }) {
  const [name, setName] = useState('');
  const submit = (e) => {
    e.preventDefault();
    onSubmit({
      name,
      body: DEFAULT_BODY,
      merge_fields: [],
    });
  };
  return (
    <div className="modal" role="dialog">
      <form className="card modal-card" onSubmit={submit}>
        <h2>New template</h2>
        <p className="muted">Starts with a minimal boilerplate — you'll edit the body in the next screen.</p>
        <label className="field"><span>Template name *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="e.g. Labb Pricing Agreement — Standard" />
        </label>
        {error && <p className="error">{String(error.message || error)}</p>}
        <div className="row gap end">
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!name || busy}>{busy ? 'Creating…' : 'Create'}</button>
        </div>
      </form>
    </div>
  );
}

const DEFAULT_BODY = `LABB PRICING AGREEMENT

This Pricing Agreement ("Agreement") is entered into on {{today}} between Labb and {{client_legal_name}} ("Client"), a subsidiary or affiliate of {{clinic_legal_name}} ("Clinic").

1. PRICING

The Client agrees to the pricing set forth below for the products and services listed. Pricing is in effect as of the date of signing and remains in effect until terminated by either party.

{{pricing_table}}

2. TERM

This Agreement remains in effect on an evergreen basis until terminated in writing by either party.

3. SIGNATURES

By signing below, the parties acknowledge and accept the terms of this Agreement.

Client:  {{signer_name}}, {{signer_title}}
Labb:    {{labb_signer_name}}, {{labb_signer_title}}
`;
