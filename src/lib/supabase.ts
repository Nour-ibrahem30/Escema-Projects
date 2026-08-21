import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseKey) {
  // Only warn in development — in production this is a deployment misconfiguration
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.error(
      '[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing.\n' +
      'Copy .env.example to .env.local and fill in your Supabase credentials.',
    );
  }
  // Throw in production so the broken state is immediately visible
  if (import.meta.env.PROD) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    );
  }
}

export const supabase = createClient<Database>(
  supabaseUrl!,
  supabaseKey!,
  {
    auth: {
      autoRefreshToken:    true,
      persistSession:      true,
      detectSessionInUrl:  true,
    },
  },
);
