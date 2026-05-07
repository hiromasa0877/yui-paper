/**
 * POST /api/reception/issue-token
 *
 * 受付モード専用URLのトークンを発行する。
 *
 * Body (JSON):
 *   - ceremony_id: string
 *   - display_name?: string (例: "受付iPad1")
 *   - expires_at?: string ISO8601 (省略時は NULL = 永続)
 *
 * 認証:
 *   - Authorization: Bearer <jwt>
 *   - その JWT のユーザが ceremony の owner であること。
 *   - 上記が揃わなければ 401 / 403。
 *
 * 返り値:
 *   - { id, token, ceremony_id, display_name, expires_at, created_at }
 *   - token はこのレスポンスでしか返さない（DBに格納された後、画面で再表示する手段は無い）
 *
 * フロー:
 *   ダッシュボードの「受付URL発行」ボタン → このAPI叩く → 受け取った token を URL 化して
 *   QRコード等でiPadに渡す。
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateReceptionToken } from '@/lib/reception-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Supabase credentials missing');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getUserIdFromJwt(jwt: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  try {
    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser(jwt);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const jwt = authHeader.slice(7).trim();
  if (!jwt) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const userId = await getUserIdFromJwt(jwt);
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const ceremonyId = typeof body?.ceremony_id === 'string' ? body.ceremony_id : null;
  if (!ceremonyId) {
    return NextResponse.json({ error: 'ceremony_id required' }, { status: 400 });
  }
  const displayName =
    typeof body?.display_name === 'string' && body.display_name.length > 0
      ? body.display_name.slice(0, 100)
      : '受付用URL';
  const expiresAt =
    typeof body?.expires_at === 'string' && body.expires_at.length > 0
      ? body.expires_at
      : null;

  const admin = getSupabaseAdmin();

  // owner ロールか確認
  const { data: staff } = await admin
    .from('ceremony_staff')
    .select('role')
    .eq('ceremony_id', ceremonyId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!staff || staff.role !== 'owner') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // 衝突回避のため最大3回までリトライ
  let lastError: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = generateReceptionToken();
    const { data, error } = await admin
      .from('reception_tokens')
      .insert({
        token,
        ceremony_id: ceremonyId,
        created_by: userId,
        display_name: displayName,
        expires_at: expiresAt,
      })
      .select('id, token, ceremony_id, display_name, expires_at, created_at')
      .single();
    if (!error && data) {
      return NextResponse.json(data);
    }
    lastError = error;
    if (error?.code !== '23505') break; // UNIQUE違反以外なら即終了
  }

  console.error('[issue-token] failed:', lastError);
  return NextResponse.json(
    { error: lastError?.message ?? 'failed to issue token' },
    { status: 500 }
  );
}
