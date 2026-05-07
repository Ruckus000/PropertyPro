-- Enforce that OAuth tokens are encrypted before storage.
-- encryptToken() produces base64(iv + ciphertext + authTag), minimum ~40 chars.
-- This prevents accidental plaintext token storage via code paths that bypass
-- the service layer's encryptToken() call.

ALTER TABLE calendar_sync_tokens
  ADD CONSTRAINT calendar_sync_tokens_access_token_encrypted_ck
  CHECK (length(access_token) >= 40),
  ADD CONSTRAINT calendar_sync_tokens_refresh_token_encrypted_ck
  CHECK (length(refresh_token) >= 40);

ALTER TABLE accounting_connections
  ADD CONSTRAINT accounting_connections_access_token_encrypted_ck
  CHECK (length(access_token) >= 40),
  ADD CONSTRAINT accounting_connections_refresh_token_encrypted_ck
  CHECK (length(refresh_token) >= 40);
