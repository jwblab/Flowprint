import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import TypeDot from './TypeDot';
import { TYPE_LABELS } from '../constants';

const STATUS_COLORS = { active: '#10b981', inactive: '#f59e0b', deprecated: '#ef4444' };

// mode: 'all' | 'pipelines' | 'entities'
export default function Sidebar({ entities, pipelines = [], onNewEntity, onNewPipeline, mode = 'all' }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [entityFilter, setEntityFilter] = useState('');
  const [pipelinesCollapsed, setPipelinesCollapsed] = useState(false);
  const [entitiesCollapsed, setEntitiesCollapsed] = useState(false);

  const usedTypes = [...new Set(entities.map(e => e.type))];
  const visibleEntities = entityFilter ? entities.filter(e => e.type === entityFilter) : entities;

  const showPipelines = mode === 'all' || mode === 'pipelines';
  const showEntities  = mode === 'all' || mode === 'entities';

  return (
    <div className="sidebar">
      {/* ── Pipelines section ────────────────────────────────────────────── */}
      {showPipelines && (
        <>
          <div className="sidebar-header" style={{ cursor: 'default' }}>
            <h3
              style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => setPipelinesCollapsed(c => !c)}
            >
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{pipelinesCollapsed ? '▶' : '▼'}</span>
              Pipelines
            </h3>
            <button className="btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onNewPipeline}>
              + New
            </button>
          </div>
          {!pipelinesCollapsed && (
            <div className="sidebar-list" style={{ borderBottom: '1px solid var(--border)' }}>
              {pipelines.length === 0 && (
                <p style={{ padding: '12px 10px', fontSize: 12, color: 'var(--text-muted)' }}>
                  No pipelines yet. Click + New to create one.
                </p>
              )}
              {pipelines.map(p => (
                <div
                  key={p.id}
                  className={`sidebar-item ${p.id === id ? 'active' : ''}`}
                  onClick={() => navigate(`/pipeline/${p.id}`)}
                >
                  <span style={{ fontSize: 14, lineHeight: 1 }}>▶</span>
                  <span className="sidebar-item-name">{p.name}</span>
                  <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', color: STATUS_COLORS[p.status] ?? 'var(--text-muted)' }}>
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Entities section ─────────────────────────────────────────────── */}
      {/* ── Entities section ─────────────────────────────────────────────── */}
      {showEntities && (
        <>
          <div className="sidebar-header" style={{ cursor: 'default' }}>
            <h3
              style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => setEntitiesCollapsed(c => !c)}
            >
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{entitiesCollapsed ? '▶' : '▼'}</span>
              Entities
            </h3>
            <button className="btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onNewEntity}>
              + New
            </button>
          </div>
          {!entitiesCollapsed && (
            <>
              {usedTypes.length > 1 && (
                <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
                  <select
                    value={entityFilter}
                    onChange={e => setEntityFilter(e.target.value)}
                    style={{ width: '100%', fontSize: 12, padding: '4px 8px' }}
                  >
                    <option value="">All types</option>
                    {usedTypes.map(type => (
                      <option key={type} value={type}>{TYPE_LABELS[type]}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="sidebar-list">
                {visibleEntities.length === 0 && (
                  <p style={{ padding: '16px 10px', fontSize: 12, color: 'var(--text-muted)' }}>
                    {entities.length === 0 ? 'No entities yet. Click + New to add one.' : 'No entities match this filter.'}
                  </p>
                )}
                {visibleEntities.map(e => (
                  <div
                    key={e.id}
                    className={`sidebar-item ${e.id === id ? 'active' : ''}`}
                    onClick={() => navigate(`/entity/${e.id}`)}
                  >
                    <TypeDot type={e.type} />
                    <span className="sidebar-item-name">{e.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {TYPE_LABELS[e.type]?.split(' ')[0]}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
