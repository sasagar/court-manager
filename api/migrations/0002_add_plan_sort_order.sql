-- Add sort_order column to plans table
ALTER TABLE plans ADD COLUMN sort_order INTEGER DEFAULT 0;
