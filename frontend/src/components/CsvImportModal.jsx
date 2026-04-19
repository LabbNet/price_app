import { useState } from 'react';
import { parseCsvToObjects } from '../lib/csv';

/**
 * Reusable CSV import modal.
 *
 * Props:
 *   title: modal heading
 *   description: short explanation of what's being imported
 *   templateHeaders: array of {key, required?, hint?} — used to build the
 *     downloadable template and to surface missing required columns in preview
 *   templateFilename: name of the download ("clinics-template.csv")
 *   parseRow(raw): transform a parsed CSV object into the payload row; return
 *     null to drop the row, or throw for a per-row error message
 *   previewColumns: [{key, label}] — which keys to show in the preview table
 *   onSubmit(rows): called with the filtered row array; should return the
 *     mutation promise
 *   onCancel, busy, error, result
 *   renderResult(result): optional — return a summary JSX for the result payload
 */
export default function CsvImportModal({
  title,
  description,
  templateHeaders,
  templateFilename,
  parseRow,
  previewColumns,
  onSubmit,
  onCancel,
  busy,
  error,
  result,
  renderResult,
}) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [parseError, setParseError] = useState('');

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => setText(String(r.result || ''));
    r.readAsText(file);
  };

  const parse = () => {
    setParseError('');
    try {
      const raw = parseCsvToObjects(text);
      const rows = [];
      const invalid = [];
      raw.forEach((r, idx) => {
        try {
          const row = parseRow(r);
          if (row) rows.push({ row, raw: r, valid: true });
        } catch (err) {
          invalid.push({ raw: r, valid: false, reason: err.message, line: idx + 2 });
        }
      });
      setPreview([...rows, ...invalid]);
    } catch (err) {
      setParseError(err.message || String(err));
    }
  };

  const validRows = preview ? preview.filter((p) => p.valid).map((p) => p.row) : [];

  const downloadTemplate = () => {
    const headers = templateHeaders.map((h) => h.key).join(',');
    const blob = new Blob([headers + '\n'], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = templateFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const submit = () => {
    if (validRows.length === 0) return;
    onSubmit(validRows);
  };

  return (
    <div className="modal" role="dialog">
      <div className="card modal-card" style={{ maxWidth: 820 }}>
        <div className="row-between">
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button type="button" className="btn ghost" onClick={downloadTemplate}>↓ Download template</button>
        </div>
        {description && <p className="muted">{description}</p>}

        <div className="card" style={{ background: 'var(--bg)', margin: '0.5rem 0' }}>
          <div className="muted small" style={{ marginBottom: '0.35rem' }}>Expected columns (case-insensitive):</div>
          <div className="muted small" style={{ fontFamily: 'ui-monospace, monospace' }}>
            {templateHeaders.map((h) => (
              <span key={h.key} style={{ marginRight: '0.75rem' }}>
                {h.key}{h.required && <span style={{ color: 'var(--accent)' }}>*</span>}
                {h.hint && <span className="muted"> ({h.hint})</span>}
              </span>
            ))}
          </div>
        </div>

        <label className="field"><span>Choose file</span>
          <input type="file" accept=".csv,text/csv" onChange={onFile} />
        </label>
        <label className="field"><span>…or paste CSV</span>
          <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="header1,header2\nvalue,value" />
        </label>

        <div className="row gap">
          <button type="button" className="btn ghost" onClick={parse} disabled={!text}>Parse</button>
          {preview && (
            <span className="muted small">
              Parsed {preview.length} row(s) — {validRows.length} valid
              {preview.length - validRows.length > 0 && `, ${preview.length - validRows.length} invalid`}.
            </span>
          )}
        </div>

        {parseError && <p className="error">{parseError}</p>}

        {preview && preview.length > 0 && (
          <div className="card no-pad" style={{ maxHeight: 280, overflow: 'auto', margin: '0.5rem 0' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Line</th>
                  {previewColumns.map((c) => <th key={c.key}>{c.label}</th>)}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 50).map((p, i) => (
                  <tr key={i} className={p.valid ? '' : 'dim'}>
                    <td className="muted small">{i + 2}</td>
                    {previewColumns.map((c) => (
                      <td key={c.key} className="small">{String((p.row || p.raw)[c.key] ?? '') || <span className="muted">—</span>}</td>
                    ))}
                    <td>
                      {p.valid ? <span className="badge ok">ok</span> : <span className="badge err">{p.reason || 'invalid'}</span>}
                    </td>
                  </tr>
                ))}
                {preview.length > 50 && (
                  <tr><td colSpan={previewColumns.length + 2} className="muted center">…and {preview.length - 50} more</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {error && <p className="error">{String(error.message || error)}</p>}
        {result && (renderResult ? renderResult(result) : <p className="muted">✓ Import complete.</p>)}

        <div className="row gap end">
          <button type="button" className="btn ghost" onClick={onCancel}>Close</button>
          <button
            type="button"
            className="btn primary"
            disabled={validRows.length === 0 || busy}
            onClick={submit}
          >{busy ? 'Importing…' : `Import ${validRows.length}`}</button>
        </div>
      </div>
    </div>
  );
}
