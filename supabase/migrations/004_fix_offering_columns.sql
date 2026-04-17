-- Idempotent fix for the "Could not find the 'has_*' column ... in the schema cache"
-- errors on the dashboard.
--
-- 1. Make sure every offering column exists (safe to re-run).
-- 2. Back-fill the UNIQUE index on (ceremony_id, koden_number).
-- 3. Tell PostgREST to reload its schema cache so the new columns become visible
--    to the Supabase client without waiting for the auto-reload.
--
-- Run this file in the Supabase SQL Editor → Run.

-- 1. Offering columns
ALTER TABLE attendees ADD COLUMN IF NOT EXISTS has_kuge BOOLEAN DEFAULT false;
ALTER TABLE attendees ADD COLUMN IF NOT EXISTS has_kumotsu BOOLEAN DEFAULT false;
ALTER TABLE attendees ADD COLUMN IF NOT EXISTS has_chouden BOOLEAN DEFAULT false;
ALTER TABLE attendees ADD COLUMN IF NOT EXISTS has_other_offering BOOLEAN DEFAULT false;
ALTER TABLE attendees ADD COLUMN IF NOT EXISTS other_offering_note TEXT;

-- Back-fill any NULLs left from older rows just in case.
UPDATE attendees SET has_kuge = false           WHERE has_kuge IS NULL;
UPDATE attendees SET has_kumotsu = false        WHERE has_kumotsu IS NULL;
UPDATE attendees SET has_chouden = false        WHERE has_chouden IS NULL;
UPDATE attendees SET has_other_offering = false WHERE has_other_offering IS NULL;

-- 2. UNIQUE index for auto-incrementing management numbers.
-- Clean up accidental duplicates first so the index can be built.
UPDATE attendees a
SET koden_number = NULL
WHERE koden_number IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM attendees b
    WHERE b.ceremony_id = a.ceremony_id
      AND b.koden_number = a.koden_number
      AND b.id <> a.id
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendees_ceremony_koden_number
  ON attendees(ceremony_id, koden_number)
  WHERE koden_number IS NOT NULL;

-- 3. Force PostgREST to reload its schema cache immediately.
NOTIFY pgrst, 'reload schema';
