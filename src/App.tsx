import { useEffect } from 'react';
import { AppShell }   from './app/AppShell';
import { AuthModal }  from './components/AuthModal';
import { useAuthStore } from './stores/authStore';
import { useMultiSchemaStore } from './stores/multiSchemaStore';
import { useSchemaStore } from './stores/schemaStore';
import './index.css';

function App() {
  const { user, initialized, initialize } = useAuthStore();
  const { loadFromCloud, resetForSignOut: resetMultiSchema, cloudLoaded } = useMultiSchemaStore();
  const resetSchema = useSchemaStore((s) => s.resetForSignOut);

  // Initialize Supabase auth session on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // When user logs in → load their schemas from cloud
  useEffect(() => {
    if (user && !cloudLoaded) {
      loadFromCloud(user.id);
    }
  }, [user, cloudLoaded, loadFromCloud]);

  // When user logs out → wipe all local state so next user starts clean
  useEffect(() => {
    if (!user && initialized) {
      resetSchema();
      resetMultiSchema();
    }
  }, [user, initialized, resetSchema, resetMultiSchema]);

  // Show nothing while checking session
  if (!initialized) {
    return (
      <div className="app-loading">
        {/* Animated background blobs */}
        <div className="app-loading-blob app-loading-blob--1" />
        <div className="app-loading-blob app-loading-blob--2" />
        <div className="app-loading-blob app-loading-blob--3" />

        <div className="app-loading-content">
          {/* Logo */}
          <div className="app-loading-logo">
            <div className="app-loading-icon">⬡</div>
            <span className="app-loading-wordmark">
              Schema<span>AI</span>
            </span>
          </div>

          {/* Animated nodes preview */}
          <div className="app-loading-diagram">
            <div className="app-loading-node app-loading-node--1">
              <div className="aln-dot" />
              <div className="aln-lines">
                <div className="aln-line aln-line--pk" />
                <div className="aln-line" />
                <div className="aln-line aln-line--short" />
              </div>
            </div>
            <div className="app-loading-edge" />
            <div className="app-loading-node app-loading-node--2">
              <div className="aln-dot" />
              <div className="aln-lines">
                <div className="aln-line" />
                <div className="aln-line aln-line--pk" />
                <div className="aln-line aln-line--short" />
                <div className="aln-line" />
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="app-loading-bar">
            <div className="app-loading-bar-fill" />
          </div>

          <p className="app-loading-label">Loading your workspace…</p>
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
