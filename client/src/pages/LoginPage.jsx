import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api.login({ email: form.email, password: form.password });
      login(data.token);
      navigate('/graph', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        padding: '32px 36px', width: 380,
      }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>
            Flowprint
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            Sign in to your workspace
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>

          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={form.password}
              onChange={e => set('password', e.target.value)}
              required
            />
          </div>

          {error && (
            <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{ width: '100%', padding: '10px', marginTop: 4 }}
          >
            {loading ? '…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
