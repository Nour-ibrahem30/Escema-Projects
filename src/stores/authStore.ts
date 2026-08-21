import { create } from 'zustand';
import type { User, Session, Subscription } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type AuthState = {
  user:         User | null;
  session:      Session | null;
  loading:      boolean;
  initialized:  boolean;
};

type AuthActions = {
  initialize:    () => Promise<void>;
  signUp:        (email: string, password: string, fullName?: string) => Promise<void>;
  signIn:        (email: string, password: string) => Promise<void>;
  signInGoogle:  () => Promise<void>;
  signInGitHub:  () => Promise<void>;
  signOut:       () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
};

export type AuthStore = AuthState & AuthActions;

// Keep a single subscription reference so we never register duplicates
let _authSubscription: Subscription | null = null;

export const useAuthStore = create<AuthStore>((set) => ({
  user:        null,
  session:     null,
  loading:     false,
  initialized: false,

  // ── Initialize: restore session and listen for changes ──────────────
  initialize: async () => {
    // Guard: only initialize once — prevents duplicate listeners on StrictMode
    // double-invocation or multiple calls from different components.
    if (_authSubscription) return;

    const { data: { session } } = await supabase.auth.getSession();
    set({
      session,
      user:        session?.user ?? null,
      initialized: true,
    });

    // Register ONE global listener for the lifetime of the app
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      set({
        session:  newSession,
        user:     newSession?.user ?? null,
        // Mark initialized in case this fires before getSession resolves
        initialized: true,
      });
    });

    _authSubscription = subscription;
  },

  // ── Sign Up ──────────────────────────────────────────────────────────
  signUp: async (email, password, fullName) => {
    set({ loading: true });
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName ?? '' } },
      });
      if (error) throw error;
    } finally {
      set({ loading: false });
    }
  },

  // ── Sign In ──────────────────────────────────────────────────────────
  signIn: async (email, password) => {
    set({ loading: true });
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } finally {
      set({ loading: false });
    }
  },

  // ── Google OAuth ──────────────────────────────────────────────────────
  signInGoogle: async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options:  { redirectTo: window.location.origin },
    });
    if (error) throw error;
  },

  // ── GitHub OAuth ──────────────────────────────────────────────────────
  signInGitHub: async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options:  { redirectTo: window.location.origin },
    });
    if (error) throw error;
  },

  // ── Sign Out ──────────────────────────────────────────────────────────
  signOut: async () => {
    set({ loading: true });
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      // Clear local state only after Supabase confirms sign-out
      set({ user: null, session: null });
    } finally {
      set({ loading: false });
    }
  },

  // ── Reset Password ────────────────────────────────────────────────────
  resetPassword: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  },
}));
