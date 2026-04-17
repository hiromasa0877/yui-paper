-- Add offering columns (供花/供物/その他)
ALTER TABLE attendees ADD COLUMN IF NOT EXISTS has_kuge BOOLEAN DEFAULT false;
ALTER TABLE attendees ADD COLUMN IF NOT EXISTS has_kumotsu BOOLEAN DEFAULT false;
ALTER TABLE attendees ADD COLUMN IF NOT EXISTS has_other_offering BOOLEAN DEFAULT false;
ALTER TABLE attendees ADD COLUMN IF NOT EXISTS other_offering_note TEXT;

-- Ensure koden_number is unique per ceremony so auto-increment is safe.
-- If duplicates exist from older data, reset them to NULL first so the index can be built.
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
