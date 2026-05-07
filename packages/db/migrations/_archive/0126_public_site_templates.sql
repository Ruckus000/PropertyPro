-- Migration 0126: public_site_templates library
-- Global public-template library for platform-admin demo creation.

CREATE TABLE public_site_templates (
  id bigserial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  community_type text NOT NULL CHECK (community_type IN ('condo_718', 'hoa_720', 'apartment')),
  sort_order integer NOT NULL DEFAULT 0,
  name text NOT NULL,
  summary text NOT NULL DEFAULT '',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  thumbnail_descriptor jsonb NOT NULL,
  draft_jsx_source text NOT NULL,
  published_snapshot jsonb,
  version integer NOT NULL DEFAULT 0,
  published_payload_hash text,
  published_at timestamptz,
  published_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT public_site_templates_type_sort_unique UNIQUE (community_type, sort_order)
);

ALTER TABLE public_site_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_site_templates FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public_site_templates FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public_site_templates TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public_site_templates_id_seq TO service_role;

ALTER TABLE demo_instances
  ADD COLUMN public_template_id bigint REFERENCES public_site_templates(id) ON DELETE SET NULL,
  ADD COLUMN public_template_version integer;
