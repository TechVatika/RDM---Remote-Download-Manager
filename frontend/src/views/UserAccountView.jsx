import { useState } from 'react';
import { HiUserCircle, HiShieldCheck } from 'react-icons/hi2';
import { apiFetch, setToken } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { toastSuccess, toastError } from '../utils/swal.js';

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return '—';
  }
}

export default function UserAccountView() {
  const { user, refreshUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not change password');

      if (data.token) setToken(data.token);
      await refreshUser();

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toastSuccess('Password updated successfully');
    } catch (err) {
      setError(err.message);
      toastError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel settings-panel account-panel">
      <h2>
        <HiUserCircle size={24} aria-hidden />
        My account
      </h2>
      <p className="settings-desc">
        Manage your RDM login. Your session stays active after changing your password.
      </p>

      <div className="cookie-status-card account-info-card">
        <div className="cookie-status-row">
          <span>Display name</span>
          <strong>{user?.displayName || user?.username || '—'}</strong>
        </div>
        <div className="cookie-status-row">
          <span>Username</span>
          <strong>@{user?.username || '—'}</strong>
        </div>
        <div className="cookie-status-row">
          <span>Last login</span>
          <strong>{formatDate(user?.lastLoginAt)}</strong>
        </div>
        <div className="cookie-status-row">
          <span>Account created</span>
          <strong>{formatDate(user?.createdAt)}</strong>
        </div>
      </div>

      <div className="auth-form-block">
        <h3>
          <HiShieldCheck size={20} aria-hidden />
          Change password
        </h3>
        <p className="block-help">
          Enter your current password, then choose a new one (minimum 6 characters).
        </p>

        <form className="account-password-form" onSubmit={handleSubmit}>
          <label htmlFor="current-password">Current password</label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />

          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={6}
            required
          />

          <label htmlFor="confirm-password">Confirm new password</label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={6}
            required
          />

          {error && <p className="form-error">{error}</p>}

          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
