import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Topbar() {
  const { user, logout } = useAuth();

  return (
    <div className="topbar">
      <span className="topbar-logo">Flowprint</span>
      <nav className="topbar-nav">
        <NavLink to="/graph"     className={({ isActive }) => isActive ? 'active' : ''}>Graph</NavLink>
        <NavLink to="/pipelines" className={({ isActive }) => isActive ? 'active' : ''}>Pipelines</NavLink>
        <NavLink to="/list"      className={({ isActive }) => isActive ? 'active' : ''}>Entities</NavLink>
        <NavLink to="/reports"   className={({ isActive }) => isActive ? 'active' : ''}>Reports</NavLink>
        {user && (user.role === 'admin' || user.role === 'superadmin') && (
          <NavLink to="/admin" className={({ isActive }) => isActive ? 'active' : ''}>Admin</NavLink>
        )}
      </nav>
      {user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto', fontSize: 13 }}>
          <span style={{ color: 'var(--text-muted)' }}>{user.email}</span>
          <button className="btn-ghost" style={{ padding: '3px 10px', fontSize: 12 }} onClick={logout}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
