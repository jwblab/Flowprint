import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useEntityTypes } from '../context/EntityTypesContext';
import { api } from '../api';

const ROLE_ORDER  = ['read_only', 'user', 'admin', 'superadmin'];
const ROLE_LABELS = { superadmin: 'Superadmin', admin: 'Admin', user: 'User', read_only: 'Read Only' };
const ROLE_COLORS = { superadmin: '#e67e22', admin: '#2980b9', user: '#27ae60', read_only: '#7f8c8d' };

function RoleBadge({ role }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
      background: ROLE_COLORS[role] + '22', color: ROLE_COLORS[role], border: `1px solid ${ROLE_COLORS[role]}44`,
    }}>
      {ROLE_LABELS[role] || role}
    </span>
  );
}

// ── Users tab ──────────────────────────────────────────────────────────────

function UsersTab({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.getUsers().then(setUsers).catch(e => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRoleChange(user, newRole) {
    setSaving(user.id);
    setError('');
    try {
      const updated = await api.setUserRole(user.id, newRole);
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  }

  const assignableRoles = currentUser.role === 'superadmin'
    ? ROLE_ORDER
    : ROLE_ORDER.filter(r => r !== 'superadmin');

  return (
    <div>
      {error && <p style={{ color: 'var(--danger, #e74c3c)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textAlign: 'left' }}>
            <th style={th}>Email</th>
            <th style={th}>Role</th>
            <th style={th}>Joined</th>
            <th style={th}>Change Role</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => {
            const isSelf = u.id === currentUser.userId;
            const cantEdit = isSelf || (u.role === 'superadmin' && currentUser.role !== 'superadmin');
            return (
              <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={td}>
                  {u.email}
                  {isSelf && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-muted)' }}>(you)</span>}
                </td>
                <td style={td}><RoleBadge role={u.role} /></td>
                <td style={{ ...td, color: 'var(--text-muted)' }}>
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td style={td}>
                  {cantEdit ? (
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                  ) : (
                    <select
                      value={u.role}
                      disabled={!!saving}
                      onChange={e => handleRoleChange(u, e.target.value)}
                      style={{ ...selectStyle, fontSize: 12, padding: '3px 6px', opacity: saving === u.id ? 0.5 : 1 }}
                    >
                      {assignableRoles.map(r => (
                        <option key={r} value={r} style={optStyle}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Permissions tab ────────────────────────────────────────────────────────

function PermissionsTab({ currentUser }) {
  const [resources, setResources] = useState([]);
  const [defaults, setDefaults]   = useState({});
  const [overrides, setOverrides] = useState([]);
  const [users, setUsers]         = useState([]);
  const [subject, setSubject]     = useState({ type: 'role', id: 'user' });
  const [saving, setSaving]       = useState(null);
  const [error, setError]         = useState('');

  useEffect(() => {
    Promise.all([api.getResources(), api.getUsers()]).then(([res, us]) => {
      setResources(res.resources);
      setDefaults(res.defaults);
      setUsers(us);
    }).catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    api.getPermissions({ subjectType: subject.type, subjectId: subject.id })
      .then(setOverrides)
      .catch(e => setError(e.message));
  }, [subject]);

  function getOverride(resourceId) {
    return overrides.find(o => o.resource === resourceId);
  }

  function getEffective(resourceId) {
    const ov = getOverride(resourceId);
    if (ov) return ov.granted;
    if (subject.type === 'role') return defaults[subject.id]?.[resourceId] ?? false;
    // For users, we'd need their role — simplify: show override only
    return null;
  }

  async function handleToggle(resourceId, currentGranted) {
    setSaving(resourceId);
    setError('');
    try {
      const ov = getOverride(resourceId);
      if (ov && ov.granted === !currentGranted) {
        // Already the opposite override — delete it to revert to default
        await api.deletePermission(ov.id);
      } else if (ov) {
        await api.deletePermission(ov.id);
        await api.setPermission({ subjectType: subject.type, subjectId: subject.id, resource: resourceId, granted: !currentGranted });
      } else {
        await api.setPermission({ subjectType: subject.type, subjectId: subject.id, resource: resourceId, granted: !currentGranted });
      }
      const updated = await api.getPermissions({ subjectType: subject.type, subjectId: subject.id });
      setOverrides(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  }

  async function handleResetOverride(resourceId) {
    const ov = getOverride(resourceId);
    if (!ov) return;
    setSaving(resourceId);
    try {
      await api.deletePermission(ov.id);
      setOverrides(prev => prev.filter(o => o.id !== ov.id));
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  }

  // Group resources by group
  const groups = [...new Set(resources.map(r => r.group))];

  return (
    <div>
      {error && <p style={{ color: 'var(--danger, #e74c3c)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      {/* Subject selector */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-secondary)', borderRadius: 6, padding: 3, border: '1px solid var(--border)' }}>
          {['role', 'user'].map(t => (
            <button
              key={t}
              onClick={() => setSubject({ type: t, id: t === 'role' ? 'user' : (users[0]?.id ?? '') })}
              style={{
                padding: '4px 12px', fontSize: 12, borderRadius: 4, border: 'none', cursor: 'pointer',
                background: subject.type === t ? 'var(--accent)' : 'transparent',
                color: subject.type === t ? '#fff' : 'var(--text-muted)',
                fontWeight: subject.type === t ? 600 : 400,
              }}
            >
              {t === 'role' ? 'By Role' : 'By User'}
            </button>
          ))}
        </div>

        {subject.type === 'role' ? (
          <select
            value={subject.id}
            onChange={e => setSubject({ type: 'role', id: e.target.value })}
            style={{ ...selectStyle }}
          >
            {ROLE_ORDER.map(r => <option key={r} value={r} style={optStyle}>{ROLE_LABELS[r]}</option>)}
          </select>
        ) : (
          <select
            value={subject.id}
            onChange={e => setSubject({ type: 'user', id: e.target.value })}
            style={{ ...selectStyle }}
          >
            {users.map(u => <option key={u.id} value={u.id} style={optStyle}>{u.email} ({ROLE_LABELS[u.role]})</option>)}
          </select>
        )}

        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {subject.type === 'role'
            ? 'Overrides apply to all users with this role'
            : 'User-level overrides take priority over role defaults'}
        </span>
      </div>

      {/* Permission matrix */}
      {groups.map(group => (
        <div key={group} style={{ marginBottom: 24 }}>
          <h4 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--accent)', marginBottom: 8 }}>
            {group}
          </h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={th}>Permission</th>
                <th style={th}>Default</th>
                <th style={th}>Override</th>
                <th style={th}>Effective</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {resources.filter(r => r.group === group).map(r => {
                const defaultVal   = subject.type === 'role' ? (defaults[subject.id]?.[r.id] ?? false) : null;
                const ov           = getOverride(r.id);
                const effective    = ov ? ov.granted : defaultVal;
                const isSaving     = saving === r.id;

                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={td}>{r.label}</td>
                    <td style={td}>
                      {defaultVal === null
                        ? <span style={{ color: 'var(--text-muted)' }}>—</span>
                        : <GrantBadge granted={defaultVal} />}
                    </td>
                    <td style={td}>
                      {ov
                        ? <GrantBadge granted={ov.granted} override />
                        : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>none</span>}
                    </td>
                    <td style={td}>
                      {effective === null
                        ? <span style={{ color: 'var(--text-muted)' }}>—</span>
                        : <GrantBadge granted={effective} />}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => handleToggle(r.id, effective ?? false)}
                          disabled={isSaving}
                          style={{ ...btnSmall, background: 'var(--bg-secondary)' }}
                        >
                          {effective ? 'Revoke' : 'Grant'}
                        </button>
                        {ov && (
                          <button
                            onClick={() => handleResetOverride(r.id)}
                            disabled={isSaving}
                            style={{ ...btnSmall, color: 'var(--text-muted)' }}
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function GrantBadge({ granted, override }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
      background: granted ? '#27ae6022' : '#e74c3c22',
      color: granted ? '#27ae60' : '#e74c3c',
      border: `1px solid ${granted ? '#27ae6044' : '#e74c3c44'}`,
      outline: override ? '1px dashed currentColor' : 'none',
      outlineOffset: 1,
    }}>
      {granted ? 'Allowed' : 'Denied'}{override ? ' *' : ''}
    </span>
  );
}

// ── Entity Types tab ───────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#6366f1', '#0ea5e9', '#10b981', '#22c55e', '#e11d48',
  '#a855f7', '#8b5cf6', '#06b6d4', '#0070f3', '#f59e0b',
  '#ef4444', '#ec4899', '#14b8a6', '#84cc16', '#64748b',
];

function EntityTypesTab() {
  const { customTypes, reload } = useEntityTypes();
  const [form, setForm] = useState({ value: '', label: '', color: '#6366f1' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function setF(key, val) { setForm(f => ({ ...f, [key]: val })); }

  // Auto-generate value from label
  function handleLabelChange(e) {
    const label = e.target.value;
    const value = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    setForm(f => ({ ...f, label, value }));
  }

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.createEntityType(form);
      setForm({ value: '', label: '', color: '#6366f1' });
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Remove this entity type? Existing entities with this type will keep their type value.')) return;
    try {
      await api.deleteEntityType(id);
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      {error && <p style={{ color: 'var(--danger, #e74c3c)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
        Add custom entity types for your workspace. They will appear in the type dropdown when creating or editing entities.
      </p>

      {/* Add form */}
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 28, flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Display Label *</label>
          <input
            value={form.label}
            onChange={handleLabelChange}
            placeholder="e.g. Power BI Report"
            required
            style={{ ...inputStyle, width: 200 }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Internal Value *</label>
          <input
            value={form.value}
            onChange={e => setF('value', e.target.value)}
            placeholder="e.g. power_bi_report"
            required
            pattern="[a-z0-9_]+"
            title="Lowercase letters, numbers, underscores only"
            style={{ ...inputStyle, width: 180 }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Color</label>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input
              type="color"
              value={form.color}
              onChange={e => setF('color', e.target.value)}
              style={{ width: 36, height: 32, padding: 2, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-secondary)', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', maxWidth: 180 }}>
              {PRESET_COLORS.map(c => (
                <div
                  key={c}
                  onClick={() => setF('color', c)}
                  style={{
                    width: 16, height: 16, borderRadius: 3, background: c, cursor: 'pointer',
                    outline: form.color === c ? '2px solid white' : 'none',
                    outlineOffset: 1,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
        <button type="submit" className="btn-primary" disabled={saving} style={{ height: 32, whiteSpace: 'nowrap' }}>
          + Add Type
        </button>
      </form>

      {/* Custom types list */}
      {customTypes.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>No custom types yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textAlign: 'left' }}>
              <th style={th}>Color</th>
              <th style={th}>Label</th>
              <th style={th}>Value</th>
              <th style={th}>Created</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {customTypes.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={td}>
                  <div style={{ width: 20, height: 20, borderRadius: 4, background: t.color }} />
                </td>
                <td style={{ ...td, fontWeight: 500 }}>{t.label}</td>
                <td style={{ ...td, color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 12 }}>{t.value}</td>
                <td style={{ ...td, color: 'var(--text-muted)' }}>{new Date(t.created_at).toLocaleDateString()}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <button
                    className="btn-danger"
                    style={{ padding: '3px 10px', fontSize: 12 }}
                    onClick={() => handleDelete(t.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'users',        label: 'Users' },
  { id: 'permissions',  label: 'Permissions' },
  { id: 'entity-types', label: 'Entity Types' },
];

export default function AdminPage() {
  const { user } = useAuth();
  const [active, setActive] = useState('users');

  if (!user) return null;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 960 }}>
      <h2 style={{ marginBottom: 4 }}>Admin</h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
        Manage users and permissions for your workspace.
      </p>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            style={{
              padding: '7px 16px', fontSize: 13, background: 'none', border: 'none',
              borderBottom: active === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              fontWeight: active === t.id ? 600 : 400,
              color: active === t.id ? 'var(--text)' : 'var(--text-muted)',
              cursor: 'pointer', marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === 'users'        && <UsersTab currentUser={user} />}
      {active === 'permissions'  && <PermissionsTab currentUser={user} />}
      {active === 'entity-types' && <EntityTypesTab />}
    </div>
  );
}

const th     = { padding: '6px 12px 8px 0', fontWeight: 600, fontSize: 11, color: 'var(--text-muted)' };
const td     = { padding: '10px 12px 10px 0', verticalAlign: 'middle' };
const btnSmall = {
  padding: '3px 10px', fontSize: 12, borderRadius: 4,
  border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text)',
};
// colorScheme: 'light' forces the native OS dropdown popup to render in light mode
// (dark text on white bg) regardless of the app's dark theme.
const selectStyle = {
  fontSize: 13, padding: '5px 10px', borderRadius: 4,
  border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text)',
  colorScheme: 'light',
};
const optStyle = { color: '#111', background: '#fff' };
const inputStyle = {
  fontSize: 13, padding: '5px 10px', borderRadius: 4,
  border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text)',
};
