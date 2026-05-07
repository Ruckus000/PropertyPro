ALTER TABLE notification_preferences
  ADD COLUMN calendar_reminder_preset TEXT NOT NULL DEFAULT '7_days_before',
  ADD COLUMN calendar_reminder_meetings BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN calendar_reminder_personal_assessments BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN calendar_reminder_community_assessments BOOLEAN NOT NULL DEFAULT FALSE,
  ADD CONSTRAINT notification_preferences_calendar_reminder_preset_check
    CHECK (calendar_reminder_preset IN ('morning_of', '1_day_before', '3_days_before', '7_days_before', 'off'));

CREATE TABLE calendar_event_reminder_log (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_kind TEXT NOT NULL,
  event_key TEXT NOT NULL,
  reminder_preset TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_started_at TIMESTAMPTZ,
  last_attempted_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  provider_message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT calendar_event_reminder_log_unique UNIQUE (community_id, user_id, event_kind, event_key, reminder_preset),
  CONSTRAINT calendar_event_reminder_log_event_kind_check
    CHECK (event_kind IN ('meeting', 'my_assessment_due', 'assessment_due')),
  CONSTRAINT calendar_event_reminder_log_reminder_preset_check
    CHECK (reminder_preset IN ('morning_of', '1_day_before', '3_days_before', '7_days_before', 'off')),
  CONSTRAINT calendar_event_reminder_log_status_check
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'discarded'))
);

CREATE INDEX calendar_event_reminder_log_due_scan_idx
  ON calendar_event_reminder_log (status, next_attempt_at, community_id, created_at);

CREATE INDEX calendar_event_reminder_log_user_scan_idx
  ON calendar_event_reminder_log (community_id, user_id, status, created_at);

ALTER TABLE calendar_event_reminder_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_event_reminder_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pp_service_select" ON calendar_event_reminder_log;
DROP POLICY IF EXISTS "pp_service_insert" ON calendar_event_reminder_log;
DROP POLICY IF EXISTS "pp_service_update" ON calendar_event_reminder_log;
DROP POLICY IF EXISTS "pp_service_delete" ON calendar_event_reminder_log;

CREATE POLICY "pp_service_select"
  ON calendar_event_reminder_log
  FOR SELECT
  USING ("public"."pp_rls_is_privileged"());

CREATE POLICY "pp_service_insert"
  ON calendar_event_reminder_log
  FOR INSERT
  WITH CHECK ("public"."pp_rls_is_privileged"());

CREATE POLICY "pp_service_update"
  ON calendar_event_reminder_log
  FOR UPDATE
  USING ("public"."pp_rls_is_privileged"())
  WITH CHECK ("public"."pp_rls_is_privileged"());

CREATE POLICY "pp_service_delete"
  ON calendar_event_reminder_log
  FOR DELETE
  USING ("public"."pp_rls_is_privileged"());
