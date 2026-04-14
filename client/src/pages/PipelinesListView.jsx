import { useNavigate } from 'react-router-dom';

const STATUS_COLORS = { active: '#10b981', inactive: '#f59e0b', deprecated: '#ef4444' };
const STATUS_LABELS = { active: 'Active', inactive: 'Inactive', deprecated: 'Deprecated' };

export default function PipelinesListView({ pipelines = [] }) {
  const navigate = useNavigate();

  const topLevel = pipelines.filter(p => !p.parent_pipeline_id);
  const childrenOf = {};
  for (const p of pipelines) {
    if (p.parent_pipeline_id) {
      (childrenOf[p.parent_pipeline_id] ??= []).push(p);
    }
  }

  function PipelineRow({ pipeline, depth = 0 }) {
    const color    = STATUS_COLORS[pipeline.status] ?? '#f59e0b';
    const children = childrenOf[pipeline.id] ?? [];
    return (
      <>
        <div
          className="entity-card"
          onClick={() => navigate(`/pipeline/${pipeline.id}`)}
          style={{ marginLeft: depth * 24, cursor: 'pointer' }}
        >
          <div className="entity-card-header">
            <span style={{ fontSize: 15, color }}>▶</span>
            <span className="entity-card-name">{pipeline.name}</span>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
              background: color + '22', color, border: `1px solid ${color}44`,
            }}>
              {STATUS_LABELS[pipeline.status] ?? pipeline.status}
            </span>
            {pipeline.entity_ids?.length > 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {pipeline.entity_ids.length} {pipeline.entity_ids.length === 1 ? 'entity' : 'entities'}
              </span>
            )}
          </div>
          {pipeline.description && (
            <div className="entity-card-desc">{pipeline.description}</div>
          )}
          {pipeline.tags?.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
              {pipeline.tags.map(t => (
                <span key={t} style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 4, padding: '1px 6px', fontSize: 10, color: 'var(--text-muted)',
                }}>{t}</span>
              ))}
            </div>
          )}
        </div>
        {children.map(child => <PipelineRow key={child.id} pipeline={child} depth={depth + 1} />)}
      </>
    );
  }

  return (
    <div className="list-view">
      <h1>All Pipelines <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>({pipelines.length})</span></h1>
      {pipelines.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No pipelines yet — click "+ Pipeline" in the graph.</p>
      ) : (
        <div className="entity-grid">
          {topLevel.map(p => <PipelineRow key={p.id} pipeline={p} />)}
        </div>
      )}
    </div>
  );
}
