-- Add court_name column to court_sessions for historical reference
-- This stores a snapshot of the court name at the time the session was created

ALTER TABLE court_sessions ADD COLUMN court_name TEXT;

-- Populate existing sessions with current court names
UPDATE court_sessions
SET court_name = (
  SELECT courts.name FROM courts WHERE courts.id = court_sessions.court_id
)
WHERE court_name IS NULL;
