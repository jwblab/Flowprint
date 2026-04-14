import { useMemo, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

// ── Helpers ────────────────────────────────────────────────────────────────

function toCET(timeStr, fromTz) {
  if (!timeStr || !fromTz) return '—';
  try {
    const [h, m] = timeStr.split(':').map(Number);
    const today = new Date();
    const yyyy = today.getUTCFullYear();
    const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(today.getUTCDate()).padStart(2, '0');
    let guess = new Date(
      `${yyyy}-${mm}-${dd}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`
    );
    const srcFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: fromTz, hour: '2-digit', minute: '2-digit', hour12: false,
    });
    for (let i = 0; i < 4; i++) {
      const parts = srcFmt.formatToParts(guess);
      const lh = parseInt(parts.find(p => p.type === 'hour').value);
      const lm = parseInt(parts.find(p => p.type === 'minute').value);
      const diff = ((h - lh) * 60 + (m - lm)) * 60_000;
      if (diff === 0) break;
      guess = new Date(guess.getTime() + diff);
    }
    const cetFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const parts = cetFmt.formatToParts(guess);
    return `${parts.find(p => p.type === 'hour').value}:${parts.find(p => p.type === 'minute').value}`;
  } catch { return '—'; }
}

function cetMinutes(timeStr, fromTz) {
  const t = toCET(timeStr, fromTz);
  if (t === '—') return Infinity;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function formatFrequency(meta) {
  const freq = meta.recurrence_frequency;
  const interval = meta.recurrence_interval ?? 1;
  if (!freq) return '—';
  if (interval === 1) {
    const map = { Minute: 'Every minute', Hour: 'Hourly', Day: 'Daily', Week: 'Weekly', Month: 'Monthly' };
    return map[freq] || freq;
  }
  return `Every ${interval} ${freq.toLowerCase()}s`;
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

// ── Sub-reports ────────────────────────────────────────────────────────────

function SchedulesReport({ entities }) {
  const scheduled = useMemo(() =>
    entities
      .filter(e => e.type === 'power_automate_flow' && e.metadata?.trigger_type === 'scheduled')
      .map(e => ({ ...e, _cetMin: cetMinutes(e.metadata.recurrence_time, e.metadata.recurrence_timezone) }))
      .sort((a, b) => a._cetMin - b._cetMin),
    [entities]
  );

  if (scheduled.length === 0) return (
    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
      No scheduled flows found. Set Trigger Type to "Scheduled" on a Power Automate Flow to see it here.
    </p>
  );

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textAlign: 'left' }}>
          <th style={th}>Name</th>
          <th style={th}>Frequency</th>
          <th style={th}>Time</th>
          <th style={th}>Timezone</th>
          <th style={th}>CET</th>
          <th style={th}>Environment</th>
        </tr>
      </thead>
      <tbody>
        {scheduled.map(e => (
          <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={td}><Link to={`/entity/${e.id}`} style={{ fontWeight: 500 }}>{e.name}</Link></td>
            <td style={td}>{formatFrequency(e.metadata)}</td>
            <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{e.metadata.recurrence_time || '—'}</td>
            <td style={{ ...td, color: 'var(--text-muted)' }}>{e.metadata.recurrence_timezone || '—'}</td>
            <td style={{ ...td, fontVariantNumeric: 'tabular-nums', color: 'var(--accent-hover)' }}>
              {toCET(e.metadata.recurrence_time, e.metadata.recurrence_timezone)}
            </td>
            <td style={{ ...td, color: 'var(--text-muted)' }}>{e.metadata.environment || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ChangelogTable({ rows }) {
  if (rows.length === 0) return (
    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No changes recorded yet.</p>
  );
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textAlign: 'left' }}>
          <th style={th}>When</th>
          <th style={th}>Who</th>
          <th style={th}>Type</th>
          <th style={th}>Name</th>
          <th style={th}>Change</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ ...td, color: 'var(--text-muted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {formatDate(row.changed_at)}
            </td>
            <td style={{ ...td, color: 'var(--text-muted)' }}>{row.user_email || '—'}</td>
            <td style={{ ...td, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{row.kind}</td>
            <td style={td}>
              {row.kind === 'entity' && row.entity_id
                ? <Link to={`/entity/${row.entity_id}`} style={{ fontWeight: 500 }}>{row.entity_name || row.entity_id}</Link>
                : <span style={{ color: 'var(--text-muted)' }}>—</span>}
            </td>
            <td style={td}>{row.summary}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RecentChangesReport({ changelog }) {
  return <ChangelogTable rows={changelog} />;
}

function UserActivityReport({ changelog }) {
  const users = useMemo(() => {
    const seen = new Set();
    return changelog
      .map(r => r.user_email)
      .filter(e => e && !seen.has(e) && seen.add(e));
  }, [changelog]);

  const [selectedUser, setSelectedUser] = useState('');

  const filtered = useMemo(() =>
    selectedUser ? changelog.filter(r => r.user_email === selectedUser) : changelog,
    [changelog, selectedUser]
  );

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>Filter by user:</label>
        <select
          value={selectedUser}
          onChange={e => setSelectedUser(e.target.value)}
          style={{
            fontSize: 13,
            padding: '4px 8px',
            borderRadius: 4,
            border: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            color: 'var(--text)',
            cursor: 'pointer',
          }}
        >
          <option value=''>All users</option>
          {users.map(email => (
            <option key={email} value={email}>{email}</option>
          ))}
        </select>
        {selectedUser && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
          </span>
        )}
      </div>
      <ChangelogTable rows={filtered} />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

const REPORTS = [
  { id: 'schedules',      label: 'Schedules' },
  { id: 'recent-changes', label: 'Recent Changes' },
  { id: 'user-activity',  label: 'User Activity' },
];

export default function ReportView({ entities }) {
  const [active, setActive] = useState('schedules');
  const [changelog, setChangelog] = useState([]);

  useEffect(() => {
    api.getChangelog({ limit: 500 }).then(setChangelog).catch(() => {});
  }, []);

  return (
    <div style={{ padding: '24px 32px', maxWidth: 960 }}>
      <h2 style={{ marginBottom: 16 }}>Reports</h2>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {REPORTS.map(r => (
          <button
            key={r.id}
            onClick={() => setActive(r.id)}
            style={{
              padding: '7px 16px',
              fontSize: 13,
              fontWeight: active === r.id ? 600 : 400,
              background: 'none',
              border: 'none',
              borderBottom: active === r.id ? '2px solid var(--accent)' : '2px solid transparent',
              color: active === r.id ? 'var(--text)' : 'var(--text-muted)',
              cursor: 'pointer',
              marginBottom: -1,
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {active === 'schedules'      && <SchedulesReport entities={entities} />}
      {active === 'recent-changes' && <RecentChangesReport changelog={changelog} />}
      {active === 'user-activity'  && <UserActivityReport changelog={changelog} />}
    </div>
  );
}

const th = { padding: '6px 12px 8px 0', fontWeight: 600, fontSize: 11 };
const td = { padding: '9px 12px 9px 0' };
