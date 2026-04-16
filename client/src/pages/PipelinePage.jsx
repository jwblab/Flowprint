import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { api } from '../api';
import TypeDot from '../components/TypeDot';
import PipelineModal from '../components/PipelineModal';
import { TYPE_LABELS } from '../constants';

const STATUS_LABELS = { active: 'Active', inactive: 'Inactive', deprecated: 'Deprecated' };
const STATUS_COLORS = { active: '#10b981', inactive: '#f59e0b', deprecated: '#ef4444' };

function StatusBadge({ status }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 12,
      fontSize: 11,
      fontWeight: 600,
      background: STATUS_COLORS[status] + '22',
      color: STATUS_COLORS[status],
      border: `1px solid ${STATUS_COLORS[status]}44`,
    }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export default function PipelinePage({ pipelines, onRefresh }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const fromGraph = location.state?.from === 'graph';
  const [pipeline, setPipeline] = useState(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);

  // Add-member UI state
  const [addEntityId, setAddEntityId] = useState('');
  const [addEdgeId, setAddEdgeId] = useState('');
  const [allEntities, setAllEntities] = useState([]);
  const [allEdges, setAllEdges] = useState([]);

  async function load() {
    try {
      const [p, entities, edges] = await Promise.all([
        api.getPipeline(id),
        api.getEntities(),
        api.getEdges(),
      ]);
      setPipeline(p);
      setAllEntities(entities);
      setAllEdges(edges);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function handleSave(form) {
    await api.updatePipeline(id, form);
    await load();
    onRefresh();
    setEditing(false);
  }

  async function handleDelete() {
    if (!confirm(`Delete pipeline "${pipeline.name}"? This will not delete member entities or edges.`)) return;
    await api.deletePipeline(id);
    onRefresh();
    navigate('/list');
  }

  async function handleAddEntity(e) {
    e.preventDefault();
    if (!addEntityId) return;
    await api.addEntityToPipeline(id, addEntityId);
    setAddEntityId('');
    await load();
    onRefresh();
  }

  async function handleRemoveEntity(entityId) {
    await api.removeEntityFromPipeline(id, entityId);
    await load();
    onRefresh();
  }

  async function handleAddEdge(e) {
    e.preventDefault();
    if (!addEdgeId) return;
    await api.addEdgeToPipeline(id, addEdgeId);
    setAddEdgeId('');
    await load();
    onRefresh();
  }

  async function handleRemoveEdge(edgeId) {
    await api.removeEdgeFromPipeline(id, edgeId);
    await load();
    onRefresh();
  }

  if (error) return <div className="entity-page"><p style={{ color: 'var(--danger)' }}>{error}</p></div>;
  if (!pipeline) return <div className="entity-page"><p style={{ color: 'var(--text-muted)' }}>Loading…</p></div>;

  // Entities/edges not yet in this pipeline (for add dropdowns)
  const memberEntityIds = new Set(pipeline.entities.map(e => e.id));
  const memberEdgeIds   = new Set(pipeline.edges.map(e => e.id));
  const availableEntities = allEntities.filter(e => !memberEntityIds.has(e.id));
  const availableEdges    = allEdges.filter(e => !memberEdgeIds.has(e.id));

  const parentPipeline = pipelines?.find(p => p.id === pipeline.parent_pipeline_id);

  return (
    <div className="entity-page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pipeline</span>
            <StatusBadge status={pipeline.status} />
          </div>
          <h1 style={{ marginBottom: 4 }}>{pipeline.name}</h1>
          <div className="meta">
            {parentPipeline && (
              <>
                <span>Part of</span>
                <Link to={`/pipeline/${parentPipeline.id}`} style={{ color: 'var(--accent)' }}>{parentPipeline.name}</Link>
                <span>·</span>
              </>
            )}
            <span>Updated {new Date(pipeline.updated_at).toLocaleDateString()}</span>
            {pipeline.last_verified && (
              <><span>·</span><span>Verified {new Date(pipeline.last_verified).toLocaleDateString()}</span></>
            )}
          </div>
          {pipeline.tags?.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
              {pipeline.tags.map(t => (
                <span key={t} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', fontSize: 11, color: 'var(--text-muted)' }}>{t}</span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {fromGraph && (
            <button className="btn-ghost" onClick={() => navigate('/graph', { state: location.state })}>← Graph</button>
          )}
          <button className="btn-ghost" onClick={() => window.open(`/print/pipeline/${id}`, '_blank')}>Print / Export</button>
          <button className="btn-ghost" onClick={() => setEditing(true)}>Edit</button>
          <button className="btn-danger" onClick={handleDelete}>Delete</button>
        </div>
      </div>

      {/* Description */}
      <section>
        <h2>Description</h2>
        {pipeline.description
          ? <p>{pipeline.description}</p>
          : <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No description. Click Edit to add one.</p>}
      </section>

      {/* Ownership + Notes */}
      {(pipeline.business_owner || pipeline.notes) && (
        <section>
          <h2>Details</h2>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {pipeline.business_owner && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Business Owner</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{pipeline.business_owner}</div>
              </div>
            )}
            {pipeline.notes && (
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Notes</div>
                <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{pipeline.notes}</div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Nested Pipelines */}
      {pipeline.children?.length > 0 && (
        <section>
          <h2>Sub-Pipelines ({pipeline.children.length})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pipeline.children.map(child => (
              <Link
                key={child.id}
                to={`/pipeline/${child.id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 6, fontSize: 13 }}
              >
                <span style={{ fontSize: 16 }}>▶</span>
                <span style={{ flex: 1 }}>{child.name}</span>
                <StatusBadge status={child.status} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Member Entities */}
      <section>
        <h2>Entities ({pipeline.entities.length})</h2>
        {pipeline.entities.length > 0 && (
          <ul className="dep-list" style={{ marginBottom: 12 }}>
            {pipeline.entities.map(e => (
              <li key={e.id} className="dep-item">
                <TypeDot type={e.type} />
                <Link to={`/entity/${e.id}`}>{e.name}</Link>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{TYPE_LABELS[e.type]}</span>
                <button
                  className="btn-danger"
                  style={{ padding: '2px 8px', fontSize: 11, marginLeft: 'auto' }}
                  onClick={() => handleRemoveEntity(e.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {availableEntities.length > 0 && (
          <form onSubmit={handleAddEntity} style={{ display: 'flex', gap: 8 }}>
            <select
              value={addEntityId}
              onChange={e => setAddEntityId(e.target.value)}
              style={{ flex: 1, fontSize: 12, padding: '5px 8px' }}
            >
              <option value="">Add entity to pipeline…</option>
              {availableEntities.map(e => (
                <option key={e.id} value={e.id}>{e.name} ({TYPE_LABELS[e.type] ?? e.type})</option>
              ))}
            </select>
            <button type="submit" className="btn-primary" style={{ padding: '5px 14px', fontSize: 12 }} disabled={!addEntityId}>
              Add
            </button>
          </form>
        )}
      </section>

      {/* Member Edges */}
      <section>
        <h2>Dependencies ({pipeline.edges.length})</h2>
        {pipeline.edges.length > 0 && (
          <ul className="dep-list" style={{ marginBottom: 12 }}>
            {pipeline.edges.map(edge => {
              const src = allEntities.find(e => e.id === edge.source_id);
              const tgt = allEntities.find(e => e.id === edge.target_id);
              return (
                <li key={edge.id} className="dep-item">
                  <span style={{ fontSize: 13 }}>
                    {src?.name ?? edge.source_id}
                    <span style={{ color: 'var(--text-muted)', margin: '0 6px' }}>→</span>
                    {tgt?.name ?? edge.target_id}
                  </span>
                  {edge.label && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{edge.label}</span>
                  )}
                  {edge.cross_pipeline && (
                    <span style={{ fontSize: 10, color: 'var(--accent)', background: 'var(--surface2)', padding: '1px 6px', borderRadius: 4 }}>cross-pipeline</span>
                  )}
                  <button
                    className="btn-danger"
                    style={{ padding: '2px 8px', fontSize: 11, marginLeft: 'auto' }}
                    onClick={() => handleRemoveEdge(edge.id)}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {availableEdges.length > 0 && (
          <form onSubmit={handleAddEdge} style={{ display: 'flex', gap: 8 }}>
            <select
              value={addEdgeId}
              onChange={e => setAddEdgeId(e.target.value)}
              style={{ flex: 1, fontSize: 12, padding: '5px 8px' }}
            >
              <option value="">Add dependency to pipeline…</option>
              {availableEdges.map(edge => {
                const src = allEntities.find(e => e.id === edge.source_id);
                const tgt = allEntities.find(e => e.id === edge.target_id);
                const label = `${src?.name ?? '?'} → ${tgt?.name ?? '?'}${edge.label ? ' (' + edge.label + ')' : ''}`;
                return <option key={edge.id} value={edge.id}>{label}</option>;
              })}
            </select>
            <button type="submit" className="btn-primary" style={{ padding: '5px 14px', fontSize: 12 }} disabled={!addEdgeId}>
              Add
            </button>
          </form>
        )}
      </section>

      {editing && (
        <PipelineModal
          initial={pipeline}
          pipelines={pipelines}
          onSave={handleSave}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
