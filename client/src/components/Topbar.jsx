import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../api';

export default function Topbar() {
  const { user, login, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaces, setWorkspaces] = useState([]);
  const [switching, setSwitching] = useState(false);

  const isSuperadmin = user?.role === 'superadmin';

  // Fetch current workspace name (all users)
  useEffect(() => {
    if (!user) return;
    api.getWorkspace().then(ws => setWorkspaceName(ws.name)).catch(() => {});
  }, [user]);

  // Fetch all workspaces for superadmin switcher
  useEffect(() => {
    if (!isSuperadmin) return;
    api.getTenants().then(setWorkspaces).catch(() => {});
  }, [isSuperadmin]);

  async function handleSwitchWorkspace(workspaceId) {
    if (workspaceId === user.workspaceId || switching) return;
    setSwitching(true);
    try {
      const { token } = await api.switchWorkspace(workspaceId);
      login(token); // updates localStorage + user state, triggers data reload in AppShell
    } catch (e) {
      console.error('Switch workspace failed:', e.message);
    } finally {
      setSwitching(false);
    }
  }

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
          {isSuperadmin && workspaces.length > 0 ? (
            <select
              value={user.workspaceId}
              disabled={switching}
              onChange={e => handleSwitchWorkspace(e.target.value)}
              title="Switch workspace"
              style={{
                fontSize: 12, padding: '3px 8px', borderRadius: 4,
                border: '1px solid var(--border)', background: 'var(--surface2)',
                color: 'var(--text)', cursor: 'pointer', opacity: switching ? 0.5 : 1,
                colorScheme: 'light',
              }}
            >
              {workspaces.map(ws => (
                <option key={ws.id} value={ws.id} style={{ color: '#111', background: '#fff' }}>
                  {ws.name}
                </option>
              ))}
            </select>
          ) : workspaceName ? (
            <span style={{
              fontSize: 12, color: 'var(--text-muted)',
              padding: '2px 8px', borderRadius: 4,
              background: 'var(--surface2)', border: '1px solid var(--border)',
            }}>
              {workspaceName}
            </span>
          ) : null}

          <span style={{ color: 'var(--text-muted)' }}>{user.email}</span>
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              padding: '3px 8px', fontSize: 15, lineHeight: 1,
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--text)', cursor: 'pointer',
            }}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <button className="btn-ghost" style={{ padding: '3px 10px', fontSize: 12 }} onClick={logout}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
