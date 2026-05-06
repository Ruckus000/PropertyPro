-- 0104: Add soft-delete column to emergency_broadcast_recipients.
-- Aligns with project convention that all tenant-scoped tables have deletedAt.

ALTER TABLE emergency_broadcast_recipients
  ADD COLUMN deleted_at TIMESTAMPTZ;
