-- Add token column to session table for Better Auth
ALTER TABLE session ADD COLUMN token TEXT;

-- Create unique index on token
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_token ON session(token);
