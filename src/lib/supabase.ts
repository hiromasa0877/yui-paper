import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase configuration');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// For server-side operations (if needed)
export function getServerSupabaseClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or URL');
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

/**
 * Get the next koden management number (1, 2, 3, ...) for a given ceremony.
 * Runs in a single round-trip. On rare race conditions the UNIQUE index
 * `(ceremony_id, koden_number)` will reject a duplicate and the caller can retry.
 */
export async function getNextKodenNumber(ceremonyId: string): Promise<number> {
  const { data, error } = await supabase
    .from('attendees')
    .select('koden_number')
    .eq('ceremony_id', ceremonyId)
    .not('koden_number', 'is', null)
    .order('koden_number', { ascending: false })
    .limit(1);

  if (error) {
    console.error('getNextKodenNumber error:', error);
    return 1;
  }

  const max = data?.[0]?.koden_number ?? 0;
  return max + 1;
}
