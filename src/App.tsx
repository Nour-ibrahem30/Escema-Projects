import { useEffect } from 'react';
import { AppShell }   from './app/AppShell';
import { AuthModal }  from './components/AuthModal';
import { useAuthStore } from './stores/authStore';
import { useMultiSchemaStore } from './stores/multiSchemaStore';
import './index.css';

function App() {
  const { user, initialized, initialize } = useAuthStore();
  const { loadFromCloud, clearCloudData, cloudLoaded } = useMultiSchemaStore();

  // Initialize Supabase auth session on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // When user logs in → load their schemas from cloud
  useEffect(() => {
    if (user && !cloudLoaded) {
      loadFromCloud();
    }
  }, [user, cloudLoaded, loadFromCloud]);

  // When user logs out → clear cloud data
  useEffect(() => {
    if (!user && initialized) {
      clearCloudData();
    }
  }, [user, initialized, clearCloudData]);

  // Show nothing while checking session
  if (!initialized) {
    return (
      <div className="app-loading">
        <div className="app-loading-logo">
          <div className="header-logo-icon" style={{ width: 48, height: 48, fontSize: '1.5rem' }}>⬡</div>
          <span className="spin" style={{ color: 'var(--brand-400)', fontSize: '1.25rem' }}>⟳</span>
        </div>
      </div>
    );
  }

  // Not authenticated → show auth screen
  if (!user) {
    return <AuthModal />;
  }

  // Authenticated → show app
  return <AppShell />;
}

export default App;
