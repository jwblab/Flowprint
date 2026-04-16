import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import { TRIGGER_TYPES } from '../constants';
import TypeDot from './TypeDot';
import { useEntityTypes } from '../context/EntityTypesContext';

function Stat({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13 }}>{value}</div>
    </div>
  );
}

function PanelHeader({ title, subtitle, onOpen, onClose }) {
  return (
    <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {subtitle && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{subtitle}</div>}
        <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>{title}</div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {onOpen && (
          <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={onOpen}>Open</button>
        )}
        <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={onClose}>✕</button>
      </div>
    </div>
  );
}

// ── Entity panel ─────────────────────────────────────────────────────────────

function EntityPanel({ entityId, graphState, onClose }) {
  const [entity, setEntity] = useState(null);
  const navigate = useNavigate();
  const { typeLabels } = useEntityTypes();

  useEffect(() => {
    setEntity(null);
    api.getEntity(entityId).then(setEntity).catch(() => {});
  }, [entityId]);

  const m = entity?.metadata ?? {};
  const triggerLabel = TRIGGER_TYPES.find(t => t.value === m.trigger_type)?.label;
  const isFlow     = entity?.type === 'power_automate_flow';
  const isDataflow = entity?.type === 'pp_dataflow';
  const isSql      = entity?.type === 'sql_table' || entity?.type === 'sql_stored_procedure';
  const isSap      = entity?.type === 'sap';
  const isPowerApp = entity?.type === 'power_app';
  const APP_TYPE_LABELS = { canvas: 'Canvas', model_driven: 'Model-Driven' };

  if (!entity) {
    return (
      <>
        <PanelHeader title="Loading…" onClose={onClose} />
        <div style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
      </>
    );
  }

  return (
    <>
      <PanelHeader
        subtitle={
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <TypeDot type={entity.type} />
            {typeLabels[entity.type] || entity.type}
          </span>
        }
        title={entity.name}
        onOpen={() => navigate(`/entity/${entity.id}`, { state: { from: 'graph', ...graphState } })}
        onClose={onClose}
      />
      <div style={{ overflowY: 'auto', flex: 1, padding: '14px 16px' }}>
        {m.tags?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14 }}>
            {m.tags.map(t => (
              <span key={t} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 7px', fontSize: 11, color: 'var(--text-muted)' }}>{t}</span>
            ))}
          </div>
        )}

        {entity.description && (
          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text)', marginBottom: 14 }}>
            {entity.description}
          </p>
        )}

        {(isFlow || isDataflow) && (
          <>
            <Stat label="Trigger" value={triggerLabel} />
            {m.trigger_type === 'scheduled' && m.recurrence_frequency && (
              <Stat label="Schedule" value={`Every ${m.recurrence_interval ?? 1} ${m.recurrence_frequency}(s)${m.recurrence_time ? ' at ' + m.recurrence_time : ''}`} />
            )}
            <Stat label="Environment" value={m.environment} />
          </>
        )}

        {isSql && (
          <>
            <Stat label="Database / Schema" value={m.db_schema} />
            <Stat label="Primary Key" value={m.primary_key} />
            {m.is_staging != null && (
              <Stat label="Table Type" value={m.is_staging ? 'Staging (overwritten)' : 'Final / Permanent'} />
            )}
          </>
        )}

        {isSap && <Stat label="SAP Table" value={m.sap_table} />}

        {isPowerApp && m.app_type && (
          <Stat label="App Type" value={APP_TYPE_LABELS[m.app_type] ?? m.app_type} />
        )}

        <Stat label="Technical Owner" value={m.technical_owner} />
        <Stat label="Business Owner" value={m.business_owner} />
        {m.last_verified && (
          <Stat label="Last Verified" value={new Date(m.last_verified).toLocaleDateString()} />
        )}
        {m.doc_url && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Documentation</div>
            <a href={m.doc_url} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>{m.doc_url}</a>
          </div>
        )}

        {entity.outgoing?.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 8 }}>
              Depends On ({entity.outgoing.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {entity.outgoing.map(e => (
                <Link key={e.id} to={`/entity/${e.target_id}`} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, padding: '5px 8px', background: 'var(--surface2)', borderRadius: 6 }}>
                  <TypeDot type={e.target_type} />
                  {e.target_name}
                  {e.label && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{e.label}</span>}
                </Link>
              ))}
            </div>
          </div>
        )}

        {entity.incoming?.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 8 }}>
              Used By ({entity.incoming.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {entity.incoming.map(e => (
                <Link key={e.id} to={`/entity/${e.source_id}`} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, padding: '5px 8px', background: 'var(--surface2)', borderRadius: 6 }}>
                  <TypeDot type={e.source_type} />
                  {e.source_name}
                  {e.label && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{e.label}</span>}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Edge panel ────────────────────────────────────────────────────────────────

const STATUS_COLORS = { active: '#10b981', inactive: '#94a3b8', deprecated: '#ef4444' };

function EdgePanel({ edgeId, edges, entities, pipelines, onClose }) {
  const { typeLabels } = useEntityTypes();
  const edge     = edges.find(e => e.id === edgeId);
  const srcEntity = entities.find(e => e.id === edge?.source);
  const tgtEntity = entities.find(e => e.id === edge?.target);
  const memberPipelines = pipelines.filter(p => p.edge_ids?.includes(edgeId));

  if (!edge) return null;

  return (
    <>
      <PanelHeader
        subtitle="Dependency"
        title={edge.label || `${srcEntity?.name ?? '?'} → ${tgtEntity?.name ?? '?'}`}
        onClose={onClose}
      />
      <div style={{ overflowY: 'auto', flex: 1, padding: '14px 16px' }}>

        {/* Source → Target */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Connection</div>
          {srcEntity && (
            <Link to={`/entity/${srcEntity.id}`} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, padding: '6px 8px', background: 'var(--surface2)', borderRadius: 6, marginBottom: 4 }}>
              <TypeDot type={srcEntity.type} />
              <span>{srcEntity.name}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{typeLabels[srcEntity.type] || srcEntity.type}</span>
            </Link>
          )}
          <div style={{ paddingLeft: 16, fontSize: 12, color: 'var(--text-muted)', margin: '2px 0' }}>↓</div>
          {tgtEntity && (
            <Link to={`/entity/${tgtEntity.id}`} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, padding: '6px 8px', background: 'var(--surface2)', borderRadius: 6, marginTop: 4 }}>
              <TypeDot type={tgtEntity.type} />
              <span>{tgtEntity.name}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{typeLabels[tgtEntity.type] || tgtEntity.type}</span>
            </Link>
          )}
        </div>

        {edge.label && <Stat label="Label" value={edge.label} />}

        {memberPipelines.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 8 }}>
              Pipelines ({memberPipelines.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {memberPipelines.map(p => (
                <Link key={p.id} to={`/pipeline/${p.id}`} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, padding: '5px 8px', background: 'var(--surface2)', borderRadius: 6 }}>
                  <span style={{ flex: 1 }}>{p.name}</span>
                  {p.status && (
                    <span style={{ fontSize: 10, color: STATUS_COLORS[p.status] ?? 'var(--text-muted)' }}>{p.status}</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Pipeline panel ────────────────────────────────────────────────────────────

function PipelinePanel({ pipelineId, pipelines, entities, graphState, onClose }) {
  const navigate = useNavigate();
  const { typeLabels } = useEntityTypes();
  const pipeline = pipelines.find(p => p.id === pipelineId);
  const memberEntities = entities.filter(e => pipeline?.entity_ids?.includes(e.id));
  const childPipelines = pipelines.filter(p => p.parent_pipeline_id === pipelineId);

  if (!pipeline) return null;

  const statusColor = STATUS_COLORS[pipeline.status] ?? 'var(--text-muted)';

  return (
    <>
      <PanelHeader
        subtitle="Pipeline"
        title={pipeline.name}
        onOpen={() => navigate(`/pipeline/${pipelineId}`, { state: { from: 'graph', ...graphState } })}
        onClose={onClose}
      />
      <div style={{ overflowY: 'auto', flex: 1, padding: '14px 16px' }}>

        {pipeline.status && (
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 10, border: `1px solid ${statusColor}44`, background: `${statusColor}22`, color: statusColor }}>
              {pipeline.status}
            </span>
          </div>
        )}

        {pipeline.description && (
          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text)', marginBottom: 14 }}>
            {pipeline.description}
          </p>
        )}

        <Stat label="Business Owner" value={pipeline.business_owner} />
        {pipeline.last_verified && (
          <Stat label="Last Verified" value={new Date(pipeline.last_verified).toLocaleDateString()} />
        )}

        {pipeline.tags?.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Tags</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {pipeline.tags.map(t => (
                <span key={t} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 7px', fontSize: 11, color: 'var(--text-muted)' }}>{t}</span>
              ))}
            </div>
          </div>
        )}

        {childPipelines.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 8 }}>
              Sub-Pipelines ({childPipelines.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {childPipelines.map(p => (
                <Link key={p.id} to={`/pipeline/${p.id}`} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, padding: '5px 8px', background: 'var(--surface2)', borderRadius: 6 }}>
                  <span style={{ flex: 1 }}>{p.name}</span>
                  {p.status && <span style={{ fontSize: 10, color: STATUS_COLORS[p.status] ?? 'var(--text-muted)' }}>{p.status}</span>}
                </Link>
              ))}
            </div>
          </div>
        )}

        {memberEntities.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 8 }}>
              Entities ({memberEntities.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {memberEntities.map(e => (
                <Link key={e.id} to={`/entity/${e.id}`} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, padding: '5px 8px', background: 'var(--surface2)', borderRadius: 6 }}>
                  <TypeDot type={e.type} />
                  <span style={{ flex: 1 }}>{e.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{typeLabels[e.type] || e.type}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function GraphPanel({ item, entities = [], pipelines = [], edges = [], graphState = {}, onClose }) {
  if (!item) return null;

  return (
    <div style={{
      width: 300, flexShrink: 0,
      background: 'var(--surface)',
      borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {item.type === 'entity' && (
        <EntityPanel entityId={item.id} graphState={graphState} onClose={onClose} />
      )}
      {item.type === 'edge' && (
        <EdgePanel edgeId={item.id} edges={edges} entities={entities} pipelines={pipelines} onClose={onClose} />
      )}
      {item.type === 'pipeline' && (
        <PipelinePanel pipelineId={item.id} pipelines={pipelines} entities={entities} graphState={graphState} onClose={onClose} />
      )}
    </div>
  );
}
