import { useEffect, useState } from 'react';
import { useEntityTypes } from '../context/EntityTypesContext';

function EntityPicker({ label, entities, value, onChange }) {
  const { allTypes } = useEntityTypes();
  const [type, setType] = useState(() => {
    const found = entities.find(e => e.id === value);
    return found?.type ?? '';
  });

  const filtered = type ? entities.filter(e => e.type === type) : [];

  function handleTypeChange(t) {
    setType(t);
    onChange(''); // reset entity when type changes
  }

  function handleEntityChange(id) {
    onChange(id);
  }

  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        <select value={type} onChange={e => handleTypeChange(e.target.value)} style={{ flex: 1 }}>
          <option value="">Select type…</option>
          {allTypes.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <select
        value={value}
        onChange={e => handleEntityChange(e.target.value)}
        disabled={!type}
        required
      >
        <option value="">{type ? 'Select entity…' : '← Pick a type first'}</option>
        {filtered.map(e => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>
    </div>
  );
}

export default function EdgeModal({ entities, pipelines = [], initial, error, onSave, onClose }) {
  const isEditing = !!initial?.id;

  useEffect(() => {
    const handle = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [onClose]);

  // Determine which pipelines already contain this edge (for edit mode)
  const initialPipelineIds = initial?.id
    ? pipelines.filter(p => p.edge_ids?.includes(initial.id)).map(p => p.id)
    : [];

  const [form, setForm] = useState({
    source_id:    initial?.source_id ?? '',
    target_id:    initial?.target_id ?? '',
    label:        initial?.label ?? '',
    pipeline_ids: initialPipelineIds,
  });

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  function togglePipeline(pid) {
    setForm(f => ({
      ...f,
      pipeline_ids: f.pipeline_ids.includes(pid)
        ? f.pipeline_ids.filter(id => id !== pid)
        : [...f.pipeline_ids, pid],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    await onSave(form);
  }

  const srcEntity = entities.find(e => e.id === form.source_id);
  const tgtEntity = entities.find(e => e.id === form.target_id);

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>{isEditing ? 'Edit Dependency' : 'Add Dependency'}</h2>
        {isEditing && srcEntity && tgtEntity && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
            <span style={{ fontWeight: 500 }}>{srcEntity.name}</span>
            <span style={{ color: 'var(--text-muted)' }}>→</span>
            <span style={{ fontWeight: 500 }}>{tgtEntity.name}</span>
          </div>
        )}
        <form onSubmit={handleSubmit}>
          {!isEditing && (
            <>
              <EntityPicker
                label="From (source) *"
                entities={entities}
                value={form.source_id}
                onChange={id => set('source_id', id)}
              />
              <EntityPicker
                label="To (target / depends on) *"
                entities={entities}
                value={form.target_id}
                onChange={id => set('target_id', id)}
              />
            </>
          )}
          <div className="field">
            <label>Label (optional)</label>
            <input
              value={form.label}
              onChange={e => set('label', e.target.value)}
              placeholder="e.g. reads from, triggers"
            />
          </div>

          {pipelines.length > 0 && (
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--accent)', marginBottom: 10 }}>
                Pipelines (optional)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {pipelines.map(p => {
                  const selected = form.pipeline_ids.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePipeline(p.id)}
                      style={{
                        padding: '3px 10px', fontSize: 12, borderRadius: 12, cursor: 'pointer',
                        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                        background: selected ? 'var(--accent)' : 'var(--surface)',
                        color: selected ? '#fff' : 'var(--text)',
                      }}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <p style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{error}</p>
          )}
          <div className="modal-footer">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">{isEditing ? 'Save Changes' : 'Add Dependency'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
