-- Add slot-based plan support
-- Allows plans to accept multiple individual bookings up to a max capacity

-- Add columns to plans table for slot-based functionality
ALTER TABLE plans ADD COLUMN is_slot_based INTEGER DEFAULT 0;
ALTER TABLE plans ADD COLUMN max_capacity INTEGER;

-- Create session_bookings table for individual bookings within a slot-based session
CREATE TABLE IF NOT EXISTS session_bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  customer_count INTEGER NOT NULL DEFAULT 1,
  customer_phone TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (session_id) REFERENCES court_sessions(id) ON DELETE CASCADE
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_session_bookings_session_id ON session_bookings(session_id);
CREATE INDEX IF NOT EXISTS idx_session_bookings_status ON session_bookings(status);
