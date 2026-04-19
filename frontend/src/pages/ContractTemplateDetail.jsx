import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from '../api';

const STANDARD_FIELDS = [
  { key: 'clinic_name', desc: 'Parent clinic name' },
  { key: 'clinic_legal_name', desc: 'Parent clinic legal name' },
  { key: 'clinic_ein', desc: 'Parent clinic EIN' },
  { key: 'client_name', desc: 'Client display name' },
  { key: 'client_legal_name', desc: 'Client legal name' },
  { key: 'client_ein', desc: 'Client EIN' },
  { key: 'client_address', desc: 'Client full address' },
  { key: 'client_contact_name', desc: 'Client contact name' },
  { key: 'client_contact_email', desc: 'Client contact email' },
  { key: 'bucket_name', desc: 'Assigned bucket name' },
  { key: 'today', desc: "Today's date" },
  { key: 'effective_date', desc: 'Effective date (today)' },
  { key: 'pricing_table', desc: 'Full effective pricing table', special: true },
  { key: 'signer_name', desc: 'Clinic signer name (filled at sign)', special: true },
  { key: 'signer_title', desc: 'Clinic signer title', special: true },
  { key: 'signer_email', desc: 'Clinic signer email', special: true },
  { key: 'labb_signer_name', desc: 'Labb counter-signer name', special: true },
  { key: 'labb_signer_title', desc: 'Labb counter-signer title', special: true },
];

export default function ContractTemplateDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['contract-template', id], queryFn: () => apiGet(`/api/contract-templates/${id}`) });

  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (q.data?.template) {
      setName(q.data.template.name);
      setBody(q.data.template.body);
      setDirty(false);
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => apiPatch(`/api/contract-templates/${id}`, { name, body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contract-template', id] }); qc.invalidateQueries({ queryKey: ['contract-templates'] }); setDirty(false); },
  });

  if (q.isLoading) return <div className="shell"><p className="muted">Loading…</p></div>;
  if (q.isError) return <div className="shell"><p className="error">{String(q.error.message || q.error)}</p></div>;

  const template = q.data.template;

  const insert = (key) => {
    const token = `{{${key}}}`;
    const ta = document.getElementById('template-body');
    if (!ta) { setBody(body + token); setDirty(true); return; }
    const start = ta.selectionStart ?? body.length;
    const end = ta.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    setDirty(true);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + token.length, start + token.length); }, 0);
  };

  const usedFields = Array.from(new Set([...body.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g)].map((m) => m[1])));

  return (
    <div className="shell">
      <p className="muted"><Link to="/contract-templates">← All templates</Link></p>

      <div className="row-between">
        <div>
          <h1>{template.name}</h1>
          <p className="muted">v{template.version} · {template.is_active ? 'active' : 'inactive'}</p>
        </div>
        <button className="btn primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
        </button>
      </div>

      <div className="row gap" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <label className="field"><span>Template name</span>
            <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
          </label>
          <label className="field"><span>Body</span>
            <textarea
              id="template-body"
              rows={24}
              value={body}
              onChange={(e) => { setBody(e.target.value); setDirty(true); }}
              style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: '0.88rem' }}
            />
          </label>
          {save.error && <p className="error">{String(save.error.message || save.error)}</p>}
          <p className="muted small">
            Saving bumps the template version. Existing contracts keep the version they were rendered with.
          </p>
        </div>

        <div className="card" style={{ width: 320, position: 'sticky', top: '1rem' }}>
          <h2>Merge fields</h2>
          <p className="muted small">Click to insert at cursor.</p>
          {STANDARD_FIELDS.map((f) => (
            <div key={f.key} style={{ marginBottom: '0.35rem' }}>
              <button
                className="btn ghost"
                type="button"
                onClick={() => insert(f.key)}
                style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.8rem' }}
                title={f.desc}
              >
                {`{{${f.key}}}`}
              </button>
              <div className="muted small" style={{ marginLeft: '0.5rem', display: 'inline' }}>{f.special ? '★ ' : ''}{f.desc}</div>
            </div>
          ))}
          {usedFields.length > 0 && (
            <>
              <h2 style={{ marginTop: '0.75rem' }}>Used in body</h2>
              <p className="muted small">{usedFields.map((u) => `{{${u}}}`).join(', ')}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
