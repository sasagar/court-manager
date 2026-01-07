-- Add is_slot_based column to court_sessions table
-- This allows sessions to track whether they were created from a slot-based plan
ALTER TABLE court_sessions ADD COLUMN is_slot_based INTEGER DEFAULT 0;
