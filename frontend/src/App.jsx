import { HiBolt } from 'react-icons/hi2';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import LoginPage from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import './index.css';

function AppShell() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-screen-inner">
          <div className="loading-logo-wrap">
            <div className="loading-ring" />
            <div className="loading-logo-icon">
              <HiBolt size={32} />
            </div>
          </div>
          <p>Loading RDM<span className="loading-dots">…</span></p>
        </div>
      </div>
    );
  }

  if (!user) return <LoginPage />;
  return <Dashboard />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ThemeProvider>
  );
}
