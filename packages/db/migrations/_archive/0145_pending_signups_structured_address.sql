ALTER TABLE pending_signups
  ADD COLUMN address_line_1 TEXT,
  ADD COLUMN city TEXT,
  ADD COLUMN state TEXT,
  ADD COLUMN zip_code TEXT;
