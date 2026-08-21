import { useEffect, useRef } from 'react';
import { AppShell }   from './app/AppShell';
import { AuthModal }  from './components/AuthModal';
import { useAuthStore } from './stores/authStore';
import { useMultiSchemaStore } from './stores/multiSchemaStore';
import { useSchemaStore } from './stores/schemaStore';
import { useChatStore } from './stores/chatStore';
import './index.css';

function App() {
  const { user, initialized, initialize } = useAuthStore();
  const { loadFromCloud, resetForSignOut: resetMultiSchema } = useMultiSchemaStore();
  const resetSchema  = useSchemaStore((s) => s.resetForSignOut);
  const initChatUser = useChatStore((s) => s.initForUser);
  const resetChat    = useChatStore((s) => s.resetForSignOut);

  // Track the userId we last loaded cloud data for — prevents duplicate loads
  const loadedForRef = useRef<string | null>(null);
  // Track whether we already ran the sign-out cleanup
  const cleanedUpRef = useRef(false);

  // Initialize Supabase auth session exactly once on mount
  useEffect(() => {
    initialize();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When a user is authenticated, load their cloud data exactly once per user
  useEffect(() => {
    if (!user) return;
    if (loadedForRef.current === user.id) return; // already loaded for this user

    loadedForRef.current = user.id;
    cleanedUpRef.current  = false;   // reset cleanup flag for this user
    initChatUser(user.id);
    loadFromCloud(user.id);
  }, [user, loadFromCloud, initChatUser]);

  // When user signs out, wipe local state exactly once
  useEffect(() => {
    if (!initialized) return;       // wait until auth is resolved
    if (user) return;               // still signed in
    if (cleanedUpRef.current) return; // already cleaned up

    cleanedUpRef.current  = true;
    loadedForRef.current  = null;
    resetSchema();
    resetMultiSchema();
    resetChat();
  }, [user, initialized, resetSchema, resetMultiSchema, resetChat]);

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
