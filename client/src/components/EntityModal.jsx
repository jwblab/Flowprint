import { useEffect, useRef, useState } from 'react';
import {
  TRIGGER_TYPES, ENVIRONMENTS,
  RECURRENCE_FREQUENCIES, SOURCE_SYSTEMS, TIMEZONES,
} from '../constants';
import { useEntityTypes } from '../context/EntityTypesContext';

// ── Shared helpers ──────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--accent)', marginBottom: 12 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children, half }) {
  return (
    <div className="field" style={{ marginBottom: 10, gridColumn: half ? 'span 1' : 'span 2' }}>
      <label>{label}</label>
      {children}
    </div>
  );
}

function Grid({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>{children}</div>;
}

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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'text' }}
      onClick={() => document.getElementById('tag-input')?.focus()}>
      {tags.map(t => (
        <span key={t} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 7px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
          {t}
          <span style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => onChange(tags.filter(x => x !== t))}>×</span>
        </span>
      ))}
      <input
        id="tag-input"
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

// ── Type-specific field blocks ───────────────────────────────────────────────

function FlowFields({ meta, set }) {
  const isScheduled = meta.trigger_type === 'scheduled';
  return (
    <Section title="Flow Details">
      <Grid>
        <Field label="Trigger Type" half>
          <select value={meta.trigger_type ?? ''} onChange={e => set('trigger_type', e.target.value)}>
            <option value="">— select —</option>
            {TRIGGER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Environment" half>
          <input list="environments" value={meta.environment ?? ''} onChange={e => set('environment', e.target.value)} placeholder="e.g. Production" />
          <datalist id="environments">{ENVIRONMENTS.map(e => <option key={e} value={e} />)}</datalist>
        </Field>
      </Grid>

      {isScheduled && (
        <div style={{ marginTop: 2 }}>
          <Grid>
            <Field label="Frequency" half>
              <select value={meta.recurrence_frequency ?? 'Day'} onChange={e => set('recurrence_frequency', e.target.value)}>
                {RECURRENCE_FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
            <Field label="Interval" half>
              <input type="number" min={1} value={meta.recurrence_interval ?? 1}
                onChange={e => set('recurrence_interval', parseInt(e.target.value) || 1)} />
            </Field>
            <Field label="Time" half>
              <input type="time" value={meta.recurrence_time ?? ''} onChange={e => set('recurrence_time', e.target.value)} />
            </Field>
            <Field label="Timezone" half>
              <select value={meta.recurrence_timezone ?? 'UTC'} onChange={e => set('recurrence_timezone', e.target.value)}>
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </Field>
          </Grid>
        </div>
      )}
    </Section>
  );
}

function SqlFields({ meta, set }) {
  return (
    <Section title="SQL Details">
      <Grid>
        <Field label="Database / Schema" half>
          <input value={meta.db_schema ?? ''} onChange={e => set('db_schema', e.target.value)} placeholder="e.g. dbo.Orders" />
        </Field>
        <Field label="Primary Key / Key Columns" half>
          <input value={meta.primary_key ?? ''} onChange={e => set('primary_key', e.target.value)} placeholder="e.g. order_id, cust_id" />
        </Field>
        <Field label="Table Type" half>
          <select value={meta.is_staging ?? ''} onChange={e => set('is_staging', e.target.value === '' ? '' : e.target.value === 'true')}>
            <option value="">— select —</option>
            <option value="false">Final / Permanent</option>
            <option value="true">Staging (overwritten)</option>
          </select>
        </Field>
      </Grid>
    </Section>
  );
}

function PowerAppFields({ meta, set }) {
  return (
    <Section title="Power App Details">
      <Field label="App Type">
        <select value={meta.app_type ?? ''} onChange={e => set('app_type', e.target.value)}>
          <option value="">— select —</option>
          <option value="canvas">Canvas</option>
          <option value="model_driven">Model-Driven</option>
        </select>
      </Field>
    </Section>
  );
}

function SapFields({ meta, set }) {
  return (
    <Section title="SAP Details">
      <Field label="SAP Table">
        <input value={meta.sap_table ?? ''} onChange={e => set('sap_table', e.target.value)} placeholder="e.g. VBAK, BSEG, LFA1" />
      </Field>
    </Section>
  );
}

function DataflowFields({ meta, set }) {
  const isScheduled = meta.trigger_type === 'scheduled';
  return (
    <Section title="Dataflow Details">
      <Grid>
        <Field label="Trigger Type" half>
          <select value={meta.trigger_type ?? ''} onChange={e => set('trigger_type', e.target.value)}>
            <option value="">— select —</option>
            {TRIGGER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Environment" half>
          <input list="environments-df" value={meta.environment ?? ''} onChange={e => set('environment', e.target.value)} placeholder="e.g. Production" />
          <datalist id="environments-df">{ENVIRONMENTS.map(e => <option key={e} value={e} />)}</datalist>
        </Field>
      </Grid>

      {isScheduled && (
        <div style={{ marginTop: 2 }}>
          <Grid>
            <Field label="Frequency" half>
              <select value={meta.recurrence_frequency ?? 'Day'} onChange={e => set('recurrence_frequency', e.target.value)}>
                {RECURRENCE_FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
            <Field label="Interval" half>
              <input type="number" min={1} value={meta.recurrence_interval ?? 1}
                onChange={e => set('recurrence_interval', parseInt(e.target.value) || 1)} />
            </Field>
            <Field label="Time" half>
              <input type="time" value={meta.recurrence_time ?? ''} onChange={e => set('recurrence_time', e.target.value)} />
            </Field>
            <Field label="Timezone" half>
              <select value={meta.recurrence_timezone ?? 'UTC'} onChange={e => set('recurrence_timezone', e.target.value)}>
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </Field>
          </Grid>
        </div>
      )}
    </Section>
  );
}

// ── Global meta ──────────────────────────────────────────────────────────────

function GlobalMeta({ meta, set }) {
  return (
    <Section title="Meta">
      <Grid>
        <Field label="Technical Owner" half>
          <input value={meta.technical_owner ?? ''} onChange={e => set('technical_owner', e.target.value)} placeholder="e.g. Jane Smith" />
        </Field>
        <Field label="Business Owner" half>
          <input value={meta.business_owner ?? ''} onChange={e => set('business_owner', e.target.value)} placeholder="e.g. John Doe" />
        </Field>
        <Field label="Last Verified" half>
          <input type="date" value={meta.last_verified ?? ''} onChange={e => set('last_verified', e.target.value)} />
        </Field>
        <Field label="Documentation URL" half>
          <input type="url" value={meta.doc_url ?? ''} onChange={e => set('doc_url', e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Tags (Enter or comma to add)">
          <TagInput tags={meta.tags ?? []} onChange={v => set('tags', v)} />
        </Field>
      </Grid>
    </Section>
  );
}

// ── Searchable multi-select for pipelines ────────────────────────────────────

function PipelineMultiSelect({ pipelines, selectedIds, onChange }) {
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState('');
  const containerRef        = useRef(null);
  const searchRef           = useRef(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Focus search when opening
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 0);
    else setQuery('');
  }, [open]);

  function toggle(pid) {
    onChange(selectedIds.includes(pid)
      ? selectedIds.filter(id => id !== pid)
      : [...selectedIds, pid]);
  }

  function removeChip(pid, e) {
    e.stopPropagation();
    onChange(selectedIds.filter(id => id !== pid));
  }

  const filtered = pipelines.filter(p =>
    p.name.toLowerCase().includes(query.toLowerCase())
  );
  const selected = pipelines.filter(p => selectedIds.includes(p.id));

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Trigger */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4,
          minHeight: 36, padding: '4px 8px',
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 6, cursor: 'pointer',
          borderColor: open ? 'var(--accent)' : 'var(--border)',
        }}
      >
        {selected.length === 0
          ? <span style={{ fontSize: 13, color: 'var(--text-muted)', padding: '0 2px' }}>— No pipeline —</span>
          : selected.map(p => (
            <span key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'var(--accent)', color: '#fff',
              borderRadius: 4, padding: '2px 8px', fontSize: 12,
            }}>
              {p.name}
              <span
                onMouseDown={e => removeChip(p.id, e)}
                style={{ cursor: 'pointer', lineHeight: 1, opacity: 0.8 }}
              >×</span>
            </span>
          ))
        }
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', paddingLeft: 4 }}>
          {open ? '▲' : '▼'}
        </span>
      </div>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
          zIndex: 200, overflow: 'hidden',
        }}>
          {/* Search */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
            <input
              ref={searchRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search pipelines…"
              style={{ width: '100%', fontSize: 12, padding: '4px 8px', boxSizing: 'border-box' }}
              onKeyDown={e => e.key === 'Escape' && setOpen(false)}
            />
          </div>
          {/* Options */}
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0
              ? <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-muted)' }}>No pipelines found</div>
              : filtered.map(p => {
                const checked = selectedIds.includes(p.id);
                return (
                  <label key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                    background: checked ? 'var(--accent)18' : 'transparent',
                  }}
                    onMouseEnter={e => { if (!checked) e.currentTarget.style.background = 'var(--surface2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = checked ? 'var(--accent)18' : 'transparent'; }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(p.id)}
                      style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
                    />
                    <span>{p.name}</span>
                    {p.status && (
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>
                        {p.status}
                      </span>
                    )}
                  </label>
                );
              })
            }
          </div>
          {selected.length > 0 && (
            <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)' }}>
              <button
                type="button"
                style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                onClick={() => onChange([])}
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main modal ───────────────────────────────────────────────────────────────

export default function EntityModal({ initial, pipelines = [], onSave, onClose }) {
  const { allTypes } = useEntityTypes();

  useEffect(() => {
    const handle = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [onClose]);

  // Determine which pipelines already contain this entity (for edit mode)
  const initialPipelineIds = initial?.id
    ? pipelines.filter(p => p.entity_ids?.includes(initial.id)).map(p => p.id)
    : [];

  const [form, setForm] = useState({
    name:         initial?.name ?? '',
    type:         initial?.type ?? 'power_automate_flow',
    description:  initial?.description ?? '',
    metadata:     initial?.metadata ?? {},
    pipeline_ids: initialPipelineIds,
  });

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }
  function setMeta(key, val) { setForm(f => ({ ...f, metadata: { ...f.metadata, [key]: val } })); }

  async function handleSubmit(e) {
    e.preventDefault();
    await onSave(form);
  }

  const isFlow     = form.type === 'power_automate_flow';
  const isDataflow = form.type === 'pp_dataflow';
  const isSql      = form.type === 'sql_table' || form.type === 'sql_stored_procedure';
  const isSap      = form.type === 'sap';
  const isPowerApp = form.type === 'power_app';

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 560 }}>
        <h2>{initial ? 'Edit Entity' : 'New Entity'}</h2>
        <form onSubmit={handleSubmit}>

          {pipelines.length > 0 && (
            <div className="field">
              <label>Pipelines</label>
              <PipelineMultiSelect
                pipelines={pipelines}
                selectedIds={form.pipeline_ids}
                onChange={ids => set('pipeline_ids', ids)}
              />
            </div>
          )}

          <div className="field">
            <label>Name *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="e.g. Sync Orders Flow" required autoFocus />
          </div>

          <div className="field">
            <label>Type *</label>
            <select value={form.type} onChange={e => set('type', e.target.value)}>
              {allTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div className="field">
            <label>Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="What does this entity do?" rows={3} />
          </div>

          {isFlow     && <FlowFields     meta={form.metadata} set={setMeta} />}
          {isDataflow && <DataflowFields meta={form.metadata} set={setMeta} />}
          {isSql      && <SqlFields      meta={form.metadata} set={setMeta} />}
          {isSap      && <SapFields      meta={form.metadata} set={setMeta} />}
          {isPowerApp && <PowerAppFields meta={form.metadata} set={setMeta} />}

          <GlobalMeta meta={form.metadata} set={setMeta} />

          <div className="modal-footer">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">{initial ? 'Save Changes' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
