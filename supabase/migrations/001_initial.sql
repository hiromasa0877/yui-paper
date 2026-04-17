-- Create ceremonies table
CREATE TABLE ceremonies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  deceased_name TEXT NOT NULL,
  venue TEXT NOT NULL,
  ceremony_date TIMESTAMPTZ NOT NULL,
  mourner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  qr_code_url TEXT
);

-- Create attendees table
CREATE TABLE attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ceremony_id UUID NOT NULL REFERENCES ceremonies(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  postal_code TEXT,
  address TEXT,
  phone TEXT,
  koden_amount INTEGER,
  koden_number INTEGER,
  checked_in BOOLEAN DEFAULT false,
  check_in_method TEXT CHECK (check_in_method IN ('smart', 'paper_ocr', 'concierge')),
  relation TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  checked_in_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX idx_ceremonies_mourner_user_id ON ceremonies(mourner_user_id);
CREATE INDEX idx_ceremonies_created_at ON ceremonies(created_at DESC);
CREATE INDEX idx_attendees_ceremony_id ON attendees(ceremony_id);
CREATE INDEX idx_attendees_checked_in ON attendees(checked_in);
CREATE INDEX idx_attendees_full_name ON attendees(full_name);

-- Enable Row Level Security
ALTER TABLE ceremonies ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendees ENABLE ROW LEVEL SECURITY;

-- Ceremonies RLS Policies
-- Allow mourners to see their own ceremonies
CREATE POLICY "Users can view their own ceremonies"
  ON ceremonies FOR SELECT
  USING (auth.uid() = mourner_user_id);

-- Allow mourners to insert their own ceremonies
CREATE POLICY "Users can create ceremonies"
  ON ceremonies FOR INSERT
  WITH CHECK (auth.uid() = mourner_user_id);

-- Allow mourners to update their own ceremonies
CREATE POLICY "Users can update their own ceremonies"
  ON ceremonies FOR UPDATE
  USING (auth.uid() = mourner_user_id);

-- Attendees RLS Policies
-- Allow anyone to view attendees of a ceremony (for QR scanning)
CREATE POLICY "Anyone can view attendees in a ceremony"
  ON attendees FOR SELECT
  USING (true);

-- Allow anyone to insert attendees (smart reception)
CREATE POLICY "Anyone can create attendees"
  ON attendees FOR INSERT
  WITH CHECK (true);

-- Allow anyone to update attendees (staff check-in)
CREATE POLICY "Anyone can update attendees"
  ON attendees FOR UPDATE
  USING (true);

-- Enable Realtime on attendees table for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE attendees;

-- Create updated_at trigger for ceremonies
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ceremonies_updated_at
BEFORE UPDATE ON ceremonies
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_attendees_updated_at
BEFORE UPDATE ON attendees
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
