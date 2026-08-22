import { useEffect, useRef } from 'react';
import { AppShell }   from './app/AppShell';
import { AuthModal }  from './components/AuthModal';
import { AuthHero }   from './components/AuthHero';
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

  // Show the animated diagram as loading screen while checking session
  if (!initialized) {
    return (
      <div className="splash-screen">
        <AuthHero />
        <div className="splash-bar">
          <div className="splash-bar-fill" />
        </div>
      </div>
    );
  }

  // Not authenticated → diagram stays as background, form overlays it
  if (!user) {
    return (
      <div className="splash-screen">
        {/* Diagram always visible as background */}
        <AuthHero />
        {/* Login form overlaid on top with fade-in */}
        <div className="login-overlay">
          <AuthModal />
        </div>
      </div>
    );
  }

  // Authenticated → show app
  return <AppShell />;
}

export default App;
