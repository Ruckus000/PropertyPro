-- Migration 0121: conversion_events table
-- Append-only funnel analytics for the demo-to-paid conversion lifecycle.
-- Global table — not community-scoped. Events span demo→paid transitions.

CREATE TABLE conversion_events (
  id bigserial PRIMARY KEY,
  demo_id bigint REFERENCES demo_instances(id),
  community_id bigint REFERENCES communities(id),
  event_type text NOT NULL CHECK (event_type IN (
    'demo_created',
    'demo_entered',
    'conversion_initiated',
    'checkout_completed',
    'checkout_session_expired',
    'founding_user_created',
    'grace_started',
    'demo_soft_deleted',
    'self_service_upgrade_started'
  )),
  source text NOT NULL CHECK (source IN (
    'admin_app', 'web_app', 'stripe_webhook', 'cron'
  )),
  dedupe_key text NOT NULL UNIQUE,
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  stripe_event_id text,
  metadata jsonb NOT NULL DEFAULT '{}' CHECK (
    metadata->>'email' IS NULL AND
    metadata->>'customerEmail' IS NULL AND
    metadata->>'customer_id' IS NULL
  )
);

CREATE INDEX idx_ce_demo ON conversion_events(demo_id);
CREATE INDEX idx_ce_community ON conversion_events(community_id);
CREATE INDEX idx_ce_type_occurred ON conversion_events(event_type, occurred_at);

-- RLS: Global table — service_role only.
ALTER TABLE conversion_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversion_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON conversion_events FROM anon, authenticated;
GRANT SELECT, INSERT ON conversion_events TO service_role;
