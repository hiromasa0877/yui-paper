/**
 * GET /api/reception/resolve-token?token=rcp_xxxxxxxx
 *
 * 公開受付ページ /r/<token> が起動時に叩く軽量エンドポイント。
 * トークンが有効なら「式典の表示用情報（名前・故人名）」を返す。
 * 失効・期限切れ・不正形式はすべて 404。
 *
 * セキュリティ:
 *   - 認証ハードルゼロのまま叩けるが、token を持っていないと何も引けない
 *     ので token のエントロピがそのまま防御線になっている (128bit)。
 *   - 返す情報は「式典名・故人名・有効期限」のみ。参列者リストや住所、
 *     電話番号は一切含めない。
 *   - トークン文字列自体はログに残さない（漏洩防止）。
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveReceptionToken } from '@/lib/reception-token';

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

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 });
  }

  try {
    const admin = getSupabaseAdmin();
    const resolved = await resolveReceptionToken(admin, token);
    if (!resolved) {
      // 失効・期限切れ・不正トークンを区別せず 404。
      // 攻撃者にどこで失敗したか教えない。
      return NextResponse.json({ error: 'invalid or expired token' }, { status: 404 });
    }

    const { data: ceremony } = await admin
      .from('ceremonies')
      .select('id, name, deceased_name')
      .eq('id', resolved.ceremonyId)
      .maybeSingle();

    if (!ceremony) {
      return NextResponse.json({ error: 'ceremony not found' }, { status: 404 });
    }

    return NextResponse.json({
      ceremony_id: ceremony.id,
      ceremony_name: ceremony.name,
      deceased_name: ceremony.deceased_name,
      expires_at: resolved.expiresAt,
      display_name: resolved.displayName,
    });
  } catch (e: any) {
    console.error('[resolve-token] unexpected error:', e?.message || e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
