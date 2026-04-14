import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { api } from '../api';
import { TYPE_LABELS, TRIGGER_TYPES } from '../constants';
import TypeDot from '../components/TypeDot';
import EntityModal from '../components/EntityModal';

// ── Helpers ──────────────────────────────────────────────────────────────────

function tzOffset(timezone) {
  const now = new Date();
  const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  const local = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  return (utc - local) / 60000;
}

function convertTime(timeStr, fromTz, toTz = 'Europe/Amsterdam') {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + tzOffset(fromTz) - tzOffset(toTz);
  const norm = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(norm / 60)).padStart(2, '0')}:${String(norm % 60).padStart(2, '0')}`;
}

const CET_ZONES = new Set(['Europe/Amsterdam', 'Europe/Berlin', 'Europe/Paris', 'Europe/Stockholm', 'Europe/Warsaw']);

function Stat({ label, value }) {
  if (value == null || value === '' || value === false) return null;
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function MetaSection({ title, children }) {
  const nonNull = Array.isArray(children) ? children.filter(Boolean) : children;
  if (!nonNull || (Array.isArray(nonNull) && nonNull.length === 0)) return null;
  return (
    <section>
      <h2>{title}</h2>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>{children}</div>
    </section>
  );
}

// ── Dependency row ───────────────────────────────────────────────────────────

function DepItem({ edge, nameKey, typeKey, idKey, onRemove, onEditLabel }) {
  const [editingLabel, setEditingLabel] = useState(false);
  const [label, setLabel] = useState(edge.label || '');

  async function saveLabel() {
    await onEditLabel(edge.id, label);
    setEditingLabel(false);
  }

  return (
    <li className="dep-item">
      <TypeDot type={edge[typeKey]} />
      <Link to={`/entity/${edge[idKey]}`}>{edge[nameKey]}</Link>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{TYPE_LABELS[edge[typeKey]]}</span>
      {editingLabel ? (
        <form onSubmit={e => { e.preventDefault(); saveLabel(); }}
          style={{ display: 'flex', gap: 4, marginLeft: 'auto', alignItems: 'center' }}>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="label…"
            autoFocus style={{ width: 120, padding: '3px 7px', fontSize: 11 }} />
          <button type="submit" className="btn-primary" style={{ padding: '3px 8px', fontSize: 11 }}>Save</button>
          <button type="button" className="btn-ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setEditingLabel(false)}>✕</button>
        </form>
      ) : (
        <>
          <span className="dep-label" onClick={() => setEditingLabel(true)} title="Click to edit label"
            style={{ cursor: 'pointer', marginLeft: 'auto', color: 'var(--text-muted)' }}>
            {edge.label || <span>+ label</span>}
          </span>
          <button className="btn-danger" style={{ padding: '2px 8px', fontSize: 11, marginLeft: 8 }}
            onClick={() => onRemove(edge.id)}>
            Remove
          </button>
        </>
      )}
    </li>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function EntityPage({ pipelines = [], onRefresh }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const graphState = location.state?.from === 'graph' ? location.state : null;
  const [entity, setEntity] = useState(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    try { setEntity(await api.getEntity(id)); }
    catch (e) { setError(e.message); }
  }

  useEffect(() => { load(); }, [id]);

  async function handleSave(form) {
    await api.updateEntity(id, form);
    // Handle pipeline membership changes
    if (form.pipeline_ids !== undefined) {
      const before = new Set(pipelines.filter(p => p.entity_ids?.includes(id)).map(p => p.id));
      const after  = new Set(form.pipeline_ids ?? []);
      const toAdd    = [...after].filter(pid => !before.has(pid));
      const toRemove = [...before].filter(pid => !after.has(pid));
      await Promise.all([
        ...toAdd.map(pid    => api.addEntityToPipeline(pid, id)),
        ...toRemove.map(pid => api.removeEntityFromPipeline(pid, id)),
      ]);
    }
    await load();
    onRefresh();
    setEditing(false);
  }

  async function handleDelete() {
    if (!confirm(`Delete "${entity.name}"? This will also remove all its dependencies.`)) return;
    await api.deleteEntity(id);
    onRefresh();
    navigate('/list');
  }

  async function handleRemoveEdge(edgeId) { await api.deleteEdge(edgeId); await load(); }
  async function handleEditLabel(edgeId, label) { await api.updateEdge(edgeId, { label }); await load(); }

  if (error) return <div className="entity-page"><p style={{ color: 'var(--danger)' }}>{error}</p></div>;
  if (!entity) return <div className="entity-page"><p style={{ color: 'var(--text-muted)' }}>Loading…</p></div>;

  const m = entity.metadata ?? {};
  const isFlow     = entity.type === 'power_automate_flow';
  const isDataflow = entity.type === 'pp_dataflow';
  const isSql      = entity.type === 'sql_table' || entity.type === 'sql_stored_procedure';
  const isSap      = entity.type === 'sap';
  const isPowerApp = entity.type === 'power_app';
  const APP_TYPE_LABELS = { canvas: 'Canvas', model_driven: 'Model-Driven' };
  const triggerLabel = TRIGGER_TYPES.find(t => t.value === m.trigger_type)?.label;

  return (
    <div className="entity-page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <h1>{entity.name}</h1>
          <div className="meta">
            <TypeDot type={entity.type} />
            <span className={`type-${entity.type}`}>{TYPE_LABELS[entity.type]}</span>
            <span>·</span>
            <span>Updated {new Date(entity.updated_at).toLocaleDateString()}</span>
            {m.last_verified && <><span>·</span><span>Verified {new Date(m.last_verified).toLocaleDateString()}</span></>}
          </div>
          {m.tags?.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
              {m.tags.map(t => (
                <span key={t} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', fontSize: 11, color: 'var(--text-muted)' }}>{t}</span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {graphState && (
            <button className="btn-ghost"
              onClick={() => navigate('/graph', { state: graphState })}>
              ← Graph
            </button>
          )}
          <button className="btn-ghost" onClick={() => window.open(`/print/${id}`, '_blank')}>Print</button>
          <button className="btn-ghost" onClick={() => setEditing(true)}>Edit</button>
          <button className="btn-danger" onClick={handleDelete}>Delete</button>
        </div>
      </div>

      {/* Description */}
      <section>
        <h2>Description</h2>
        {entity.description
          ? <p>{entity.description}</p>
          : <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No description. Click Edit to add one.</p>}
      </section>

      {/* Flow details */}
      {isFlow && (triggerLabel || m.environment) && (
        <MetaSection title="Flow Details">
          <Stat label="Trigger" value={triggerLabel} />
          <Stat label="Environment" value={m.environment} />
        </MetaSection>
      )}

      {/* Flow recurrence */}
      {isFlow && m.trigger_type === 'scheduled' && m.recurrence_frequency && (
        <MetaSection title="Recurrence Schedule">
          <Stat label="Frequency" value={`Every ${m.recurrence_interval ?? 1} ${m.recurrence_frequency}(s)`} />
          {m.recurrence_time && (() => {
            const tz = m.recurrence_timezone ?? 'UTC';
            const cet = convertTime(m.recurrence_time, tz);
            return (
              <Stat label={`Time (${tz})`} value={
                <>
                  {m.recurrence_time}
                  {!CET_ZONES.has(tz) && cet && (
                    <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 10, fontSize: 12 }}>{cet} CET</span>
                  )}
                </>
              } />
            );
          })()}
        </MetaSection>
      )}

      {/* PP Dataflow details */}
      {isDataflow && (triggerLabel || m.environment) && (
        <MetaSection title="Dataflow Details">
          <Stat label="Trigger" value={triggerLabel} />
          <Stat label="Environment" value={m.environment} />
        </MetaSection>
      )}

      {/* PP Dataflow recurrence */}
      {isDataflow && m.trigger_type === 'scheduled' && m.recurrence_frequency && (
        <MetaSection title="Recurrence Schedule">
          <Stat label="Frequency" value={`Every ${m.recurrence_interval ?? 1} ${m.recurrence_frequency}(s)`} />
          {m.recurrence_time && (() => {
            const tz = m.recurrence_timezone ?? 'UTC';
            const cet = convertTime(m.recurrence_time, tz);
            return (
              <Stat label={`Time (${tz})`} value={
                <>
                  {m.recurrence_time}
                  {!CET_ZONES.has(tz) && cet && (
                    <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 10, fontSize: 12 }}>{cet} CET</span>
                  )}
                </>
              } />
            );
          })()}
        </MetaSection>
      )}

      {/* SQL details */}
      {isSql && (m.db_schema || m.primary_key || m.is_staging != null) && (
        <MetaSection title="SQL Details">
          <Stat label="Database / Schema" value={m.db_schema} />
          <Stat label="Primary Key" value={m.primary_key} />
          <Stat label="Table Type" value={m.is_staging === true ? 'Staging (overwritten)' : m.is_staging === false ? 'Final / Permanent' : null} />
        </MetaSection>
      )}

      {/* Power App details */}
      {isPowerApp && m.app_type && (
        <MetaSection title="Power App Details">
          <Stat label="App Type" value={APP_TYPE_LABELS[m.app_type] ?? m.app_type} />
        </MetaSection>
      )}

      {/* SAP details */}
      {isSap && m.sap_table && (
        <MetaSection title="SAP Details">
          <Stat label="SAP Table" value={m.sap_table} />
        </MetaSection>
      )}

      {/* Owners — shown for all types */}
      {(m.technical_owner || m.business_owner) && (
        <MetaSection title="Ownership">
          <Stat label="Technical Owner" value={m.technical_owner} />
          <Stat label="Business Owner" value={m.business_owner} />
        </MetaSection>
      )}

      {/* Documentation URL — shown for all types */}
      {m.doc_url && (
        <section>
          <h2>Documentation</h2>
          <a href={m.doc_url} target="_blank" rel="noreferrer" style={{ fontSize: 14 }}>
            {m.doc_url}
          </a>
        </section>
      )}

      {/* Dependencies */}
      {entity.outgoing?.length > 0 && (
        <section>
          <h2>Depends On ({entity.outgoing.length})</h2>
          <ul className="dep-list">
            {entity.outgoing.map(e => (
              <DepItem key={e.id} edge={e} nameKey="target_name" typeKey="target_type" idKey="target_id"
                onRemove={handleRemoveEdge} onEditLabel={handleEditLabel} />
            ))}
          </ul>
        </section>
      )}

      {entity.incoming?.length > 0 && (
        <section>
          <h2>Used By ({entity.incoming.length})</h2>
          <ul className="dep-list">
            {entity.incoming.map(e => (
              <DepItem key={e.id} edge={e} nameKey="source_name" typeKey="source_type" idKey="source_id"
                onRemove={handleRemoveEdge} onEditLabel={handleEditLabel} />
            ))}
          </ul>
        </section>
      )}

      {entity.outgoing?.length === 0 && entity.incoming?.length === 0 && (
        <section>
          <h2>Dependencies</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No dependencies yet. Use the Graph view to draw connections.</p>
        </section>
      )}

      {/* Change log */}
      {entity.changelog?.length > 0 && (
        <section>
          <h2>Change Log</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {entity.changelog.map(entry => (
              <div key={entry.id} style={{ display: 'flex', gap: 12, fontSize: 12, alignItems: 'baseline' }}>
                <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {new Date(entry.changed_at).toLocaleString()}
                </span>
                <span style={{ color: 'var(--text)' }}>{entry.summary}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {editing && (
        <EntityModal
          initial={entity}
          pipelines={pipelines}
          onSave={handleSave}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
