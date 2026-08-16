import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { AuthHero } from './AuthHero';

type Mode = 'signin' | 'signup' | 'reset';

export function AuthModal() {
  const { signIn, signUp, signInGoogle, signInGitHub, resetPassword, loading } = useAuthStore();

  const [mode, setMode]         = useState<Mode>('signin');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      if (mode === 'signin')       await signIn(email, password);
      else if (mode === 'signup') { await signUp(email, password, fullName); setSuccess('Account created! Check your email to confirm.'); }
      else                        { await resetPassword(email); setSuccess('Password reset email sent. Check your inbox.'); }
    } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong'); }
  };

  const handleGoogle = async () => { setError(''); try { await signInGoogle(); } catch (err) { setError(err instanceof Error ? err.message : 'Google sign-in failed'); } };
  const handleGitHub = async () => { setError(''); try { await signInGitHub(); } catch (err) { setError(err instanceof Error ? err.message : 'GitHub sign-in failed'); } };
  const reset = () => { setError(''); setSuccess(''); };

  // Detect which provider the current user signed up with
  const { user } = useAuthStore();
  const userProvider = user?.app_metadata?.provider as string | undefined;
  const showGoogle = !userProvider || userProvider === 'google' || userProvider === 'email';
  const showGitHub = !userProvider || userProvider === 'github';

  return (
    <div className="auth-screen">

      {/* ══ LEFT — code-drawn hero ══════════════════════════════ */}
      <AuthHero />

      {/* ══ RIGHT — sign-in form ════════════════════════════════ */}
      <div className="auth-panel">
        <div className="auth-card">

          {/* Brand */}
          <div className="auth-brand">
            <div className="auth-brand-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="auth-brand-name">Escema<em>AI</em></span>
          </div>

          {/* Mobile-only mini diagram strip */}
          <div className="auth-mobile-strip">
            <div className="auth-mobile-node" style={{ borderColor: '#3b82f6' }}>
              <span style={{ color: '#3b82f6' }}>▣</span> User
            </div>
            <div className="auth-mobile-edge" style={{ background: '#8b5cf6' }} />
            <div className="auth-mobile-node" style={{ borderColor: '#8b5cf6' }}>
              <span style={{ color: '#8b5cf6' }}>▣</span> Project
            </div>
            <div className="auth-mobile-edge" style={{ background: '#06b6d4' }} />
            <div className="auth-mobile-node" style={{ borderColor: '#06b6d4' }}>
              <span style={{ color: '#06b6d4' }}>▣</span> Schema
            </div>
            <div className="auth-mobile-edge" style={{ background: '#10b981' }} />
            <div className="auth-mobile-node" style={{ borderColor: '#10b981' }}>
              <span style={{ color: '#10b981' }}>▣</span> Entity
            </div>
          </div>

          <div className="auth-heading">
            <h2>
              {mode === 'signin' && 'Welcome back'}
              {mode === 'signup' && 'Get started'}
              {mode === 'reset'  && 'Reset password'}
            </h2>
            <p>
              {mode === 'signin' && 'Sign in to your workspace'}
              {mode === 'signup' && 'Create your free account'}
              {mode === 'reset'  && "We'll send you a reset link"}
            </p>
          </div>

          {/* OAuth */}
          {mode !== 'reset' && (
            <>
              <div className="auth-oauth-row">
                {showGoogle && (
                  <button type="button" className="auth-oauth-btn auth-oauth-btn--google" onClick={handleGoogle} disabled={loading}>
                    <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
                      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                    </svg>
                    Continue with Google
                  </button>
                )}

                {showGitHub && (
                  <button type="button" className="auth-oauth-btn auth-oauth-btn--github" onClick={handleGitHub} disabled={loading}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                    </svg>
                    Continue with GitHub
                  </button>
                )}
              </div>

              {(showGoogle || showGitHub) && <div className="auth-divider"><span>or</span></div>}
            </>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="auth-form">
            {mode === 'signup' && (
              <div className="auth-field">
                <label htmlFor="auth-name">Full Name</label>
                <input id="auth-name" type="text" placeholder="Jane Doe" value={fullName}
                  onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
              </div>
            )}

            <div className="auth-field">
              <label htmlFor="auth-email">Email</label>
              <input id="auth-email" type="email" placeholder="you@example.com" value={email}
                onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus />
            </div>

            {mode !== 'reset' && (
              <div className="auth-field">
                <label htmlFor="auth-pw">
                  Password
                  {mode === 'signin' && (
                    <button type="button" className="auth-forgot-inline"
                      onClick={() => { setMode('reset'); reset(); }}>
                      Forgot?
                    </button>
                  )}
                </label>
                <input id="auth-pw" type="password"
                  placeholder={mode === 'signup' ? 'Min 6 characters' : '••••••••'}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  required minLength={6}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
              </div>
            )}

            {error   && <div className="auth-error">  <span>✕</span><span>{error}</span>  </div>}
            {success && <div className="auth-success"><span>✓</span><span>{success}</span></div>}

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading
                ? <span className="spin">⟳</span>
                : mode === 'signin'  ? 'Sign In'
                : mode === 'signup'  ? 'Create Account'
                :                     'Send Reset Link'}
            </button>
          </form>

          {/* Footer */}
          <p className="auth-switch">
            {mode === 'signin' && <>No account?{' '}<button type="button" onClick={() => { setMode('signup'); reset(); }}>Sign up free</button></>}
            {mode === 'signup' && <>Already have an account?{' '}<button type="button" onClick={() => { setMode('signin'); reset(); }}>Sign in</button></>}
            {mode === 'reset'  && <><button type="button" onClick={() => { setMode('signin'); reset(); }}>← Back to sign in</button></>}
          </p>

        </div>
      </div>

    </div>
  );
}
