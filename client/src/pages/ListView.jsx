import { useNavigate } from 'react-router-dom';
import TypeDot from '../components/TypeDot';
import { TYPE_LABELS } from '../constants';

export default function ListView({ entities }) {
  const navigate = useNavigate();

  return (
    <div className="list-view">
      <h1>All Entities <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>({entities.length})</span></h1>
      {entities.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No entities yet — click "+ New" in the sidebar.</p>
      ) : (
        <div className="entity-grid">
          {entities.map(e => (
            <div key={e.id} className="entity-card" onClick={() => navigate(`/entity/${e.id}`)}>
              <div className="entity-card-header">
                <TypeDot type={e.type} />
                <span className="entity-card-name">{e.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{TYPE_LABELS[e.type]}</span>
              </div>
              {e.description && (
                <div className="entity-card-desc">{e.description}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
