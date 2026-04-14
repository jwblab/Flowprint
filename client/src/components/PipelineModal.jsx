import { useEffect, useState } from 'react';

const STATUS_OPTIONS = [
  { value: 'active',      label: 'Active' },
  { value: 'inactive',    label: 'Inactive' },
  { value: 'deprecated',  label: 'Deprecated' },
];

function TagInput({ tags, onChange }) {
  const [input, setInput] = useState('');

  function add(raw) {
    const tag = raw.trim().toLowerCase();
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setInput('');
  }

  function handleKey(e) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input); }
    if (e.key === 'Backspace' && !input && tags.length) onChange(tags.slice(0, -1));
  }

  return (
    <div
      style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'text' }}
      onClick={() => document.getElementById('pipeline-tag-input')?.focus()}
    >
      {tags.map(t => (
        <span key={t} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 7px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
          {t}
          <span style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => onChange(tags.filter(x => x !== t))}>×</span>
        </span>
      ))}
      <input
        id="pipeline-tag-input"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => input && add(input)}
        placeholder={tags.length ? '' : 'Type and press Enter…'}
        style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 12, minWidth: 120, padding: '2px 0' }}
      />
    </div>
  );
}

export default function PipelineModal({ initial, pipelines = [], onSave, onClose }) {
  useEffect(() => {
    const handle = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [onClose]);

  const [form, setForm] = useState({
    name:               initial?.name               ?? '',
    description:        initial?.description        ?? '',
    status:             initial?.status             ?? 'active',
    business_owner:     initial?.business_owner     ?? '',
    tags:               initial?.tags               ?? [],
    last_verified:      initial?.last_verified      ? initial.last_verified.split('T')[0] : '',
    notes:              initial?.notes              ?? '',
    parent_pipeline_id: initial?.parent_pipeline_id ?? '',
  });

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  async function handleSubmit(e) {
    e.preventDefault();
    await onSave({
      ...form,
      last_verified:      form.last_verified      || null,
      parent_pipeline_id: form.parent_pipeline_id || null,
    });
  }

  // Exclude self from parent options (and descendants, to prevent cycles — simple self-exclude for now)
  const parentOptions = pipelines.filter(p => p.id !== initial?.id);

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 520 }}>
        <h2>{initial ? 'Edit Pipeline' : 'New Pipeline'}</h2>
        <form onSubmit={handleSubmit}>

          <div className="field">
            <label>Name *</label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Order-to-Cash Pipeline"
              required
              autoFocus
            />
          </div>

          <div className="field">
            <label>Description</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="What end-to-end process does this pipeline represent?"
              rows={3}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
            <div className="field">
              <label>Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Business Owner</label>
              <input
                value={form.business_owner}
                onChange={e => set('business_owner', e.target.value)}
                placeholder="e.g. John Doe"
              />
            </div>

            <div className="field">
              <label>Last Verified</label>
              <input
                type="date"
                value={form.last_verified}
                onChange={e => set('last_verified', e.target.value)}
              />
            </div>

            <div className="field">
              <label>Parent Pipeline</label>
              <select value={form.parent_pipeline_id} onChange={e => set('parent_pipeline_id', e.target.value)}>
                <option value="">None (top-level)</option>
                {parentOptions.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>Tags (Enter or comma to add)</label>
            <TagInput tags={form.tags} onChange={v => set('tags', v)} />
          </div>

          <div className="field">
            <label>Notes</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Any additional notes, caveats, or context…"
              rows={3}
            />
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">{initial ? 'Save Changes' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
