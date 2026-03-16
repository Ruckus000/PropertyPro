-- Add customized_at column to demo_instances to track when a demo was first edited.
ALTER TABLE demo_instances
  ADD COLUMN customized_at timestamptz;
