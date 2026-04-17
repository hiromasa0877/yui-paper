-- Add 弔電 (chouden / condolence telegram) offering column.
-- Safe to re-run.
ALTER TABLE attendees
  ADD COLUMN IF NOT EXISTS has_chouden BOOLEAN DEFAULT false;
