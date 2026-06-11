import { useState } from 'react';
import { HiBolt } from 'react-icons/hi2';
import { useAuth } from '../context/AuthContext.jsx';
import { toastError } from '../utils/swal.js';
import PlatformIcon from '../components/PlatformIcon.jsx';
import { FEATURED_PLATFORMS } from '../utils/platformIcons.js';
import './Login.css';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      toastError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="dell-top-banner login-dell-banner" role="banner">
        <div className="dell-top-banner-copy">
          <strong>REMOTE DOWNLOAD MANAGER</strong>
          <span>Sign in to queue downloads on your home server.</span>
        </div>
        <span className="dell-buy-sticker">RDM 1996</span>
      </div>
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo">
            <HiBolt size={28} />
          </div>
          <h1>Remote Download Manager</h1>
          <p>Sign in to manage downloads on your home server</p>
          <div className="login-platforms">
            {FEATURED_PLATFORMS.slice(0, 6).map((p) => (
              <PlatformIcon key={p} name={p} size={18} />
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
