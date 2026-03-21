-- Migration 0110: Create public.user_search_index table synced from auth.users
-- Supabase does not allow indexing auth.users directly. This public table mirrors
-- the searchable fields and stays in sync via a SECURITY DEFINER trigger.

CREATE TABLE public.user_search_index (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text NOT NULL
);

-- Populate from existing users
INSERT INTO public.user_search_index (user_id, full_name, email)
SELECT id, raw_user_meta_data->>'fullName', email
FROM auth.users;

-- Trigger function to keep user_search_index in sync with auth.users
CREATE OR REPLACE FUNCTION sync_user_search_index() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_search_index (user_id, full_name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'fullName', NEW.email)
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_sync_user_search_index
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION sync_user_search_index();

-- GIN trigram indexes on the public table
CREATE INDEX idx_user_search_fullname_trgm ON public.user_search_index
  USING gin (full_name gin_trgm_ops);
CREATE INDEX idx_user_search_email_trgm ON public.user_search_index
  USING gin (email gin_trgm_ops);
