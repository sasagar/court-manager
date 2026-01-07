-- Add max_capacity column to court_sessions for per-session capacity override
-- This allows changing the capacity for each slot-based session individually

ALTER TABLE court_sessions ADD COLUMN max_capacity INTEGER;
