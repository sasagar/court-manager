-- Add payment_status column to court_sessions table
-- Tracks whether a session has been paid for
-- Values: 'unpaid' (default), 'paid'
ALTER TABLE court_sessions ADD COLUMN payment_status TEXT DEFAULT 'unpaid';
