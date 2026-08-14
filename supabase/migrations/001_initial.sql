-- ================================================================
-- AI Schema Builder — Supabase Migration (idempotent)
-- Safe to run multiple times — uses IF NOT EXISTS / OR REPLACE
-- ================================================================

-- ── Profiles table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  full_name   TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles: own read"   ON public.profiles;
DROP POLICY IF EXISTS "profiles: own update" ON public.profiles;
DROP POLICY IF EXISTS "profiles: own insert" ON public.profiles;

CREATE POLICY "profiles: own read"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles: own update"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "profiles: own insert"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Schemas table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schemas (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL DEFAULT 'Untitled Schema',
  description TEXT,
  data        JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS schemas_user_id_idx    ON public.schemas(user_id);
CREATE INDEX IF NOT EXISTS schemas_updated_at_idx ON public.schemas(updated_at DESC);

ALTER TABLE public.schemas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schemas: own select" ON public.schemas;
DROP POLICY IF EXISTS "schemas: own insert" ON public.schemas;
DROP POLICY IF EXISTS "schemas: own update" ON public.schemas;
DROP POLICY IF EXISTS "schemas: own delete" ON public.schemas;

CREATE POLICY "schemas: own select"
  ON public.schemas FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "schemas: own insert"
  ON public.schemas FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "schemas: own update"
  ON public.schemas FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "schemas: own delete"
  ON public.schemas FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS schemas_updated_at ON public.schemas;
CREATE TRIGGER schemas_updated_at
  BEFORE UPDATE ON public.schemas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
