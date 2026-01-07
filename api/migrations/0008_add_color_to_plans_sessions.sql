-- Add color_code to plans table for slot-based plan colors
ALTER TABLE plans ADD COLUMN color_code TEXT;

-- Add display_color to court_sessions for individual session colors (non-slot based)
ALTER TABLE court_sessions ADD COLUMN display_color TEXT;
