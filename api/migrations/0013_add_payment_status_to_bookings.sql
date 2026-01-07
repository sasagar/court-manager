-- Add payment_status column to session_bookings table
-- This allows tracking payment status for individual bookings within slot-based sessions
ALTER TABLE session_bookings ADD COLUMN payment_status TEXT DEFAULT 'unpaid';
