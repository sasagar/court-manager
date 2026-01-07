-- Add public_view_token column to facilities table for QR code access
-- This token allows unauthenticated users to view today's schedule
ALTER TABLE facilities ADD COLUMN public_view_token TEXT;

-- Create index for fast token lookup
CREATE INDEX idx_facilities_public_view_token ON facilities(public_view_token);
