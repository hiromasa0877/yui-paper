/**
 * /api/ceremony/staff
 *
 * 式典スタッフ（ceremony_staff）の管理エンドポイント。
 *
 *   GET    ?ceremony_id=...            メンバー一覧（owner / staff / viewer）
 *   POST   { ceremony_id, email, role } owner がメールで招待 → 既存ユーザを ceremony_staff に追加
 *   DELETE ?ceremony_id=...&user_id=... メンバーを除外（owner のみ。最後の owner は除外不可）
 *
 * 認証:
 *   Authorization: Bearer <Supabase JWT>
 *   - owner ロールでなければ操作 403
 *   - 一覧（GET）はメンバー全員許可
 *
 * メールでの招待は「既に Supabase でサインアップ済みのユーザ」を対象とする。
 *  → その人がまだサインアップしていない場合は 404 を返し、UI で
 *     「先に該当のメールでサインアップしてもらう」ように案内する。
 *  Supabase の Magic Link 経由の即時発行も技術的には可能だが、
 *  メール送信はサポートチケット系の運用負荷を上げるため最小実装に絞る。
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

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

async function requireAuth(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const jwt = authHeader.slice(7).trim();
  if (!jwt) return null;
  return getUserIdFromJwt(jwt);
}

async function getMemberRole(
  admin: ReturnType<typeof getSupabaseAdmin>,
  ceremonyId: string,
  userId: string
): Promise<string | null> {
  const { data } = await admin
    .from('ceremony_staff')
    .select('role')
    .eq('ceremony_id', ceremonyId)
    .eq('user_id', userId)
    .maybeSingle();
  if (data?.role) return data.role;

  // フォールバック: ceremony_staff バックフィル漏れ対策。
  // ceremonies.mourner_user_id == userId なら owner として扱い、
  // ついでに ceremony_staff に追加して以降のクエリを RLS が通るようにする。
  const { data: ceremony } = await admin
    .from('ceremonies')
    .select('mourner_user_id')
    .eq('id', ceremonyId)
    .maybeSingle();
  if (ceremony && ceremony.mourner_user_id === userId) {
    await admin
      .from('ceremony_staff')
      .upsert(
        {
          ceremony_id: ceremonyId,
          user_id: userId,
          role: 'owner',
          added_by: userId,
        },
        { onConflict: 'ceremony_id,user_id' }
      );
    return 'owner';
  }
  return null;
}

/**
 * GET: ceremony_staff + email を返す
 */
export async function GET(req: NextRequest) {
  const userId = await requireAuth(req);
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const ceremonyId = req.nextUrl.searchParams.get('ceremony_id');
  if (!ceremonyId) {
    return NextResponse.json({ error: 'ceremony_id required' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const myRole = await getMemberRole(admin, ceremonyId, userId);
  if (!myRole) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { data: staff, error } = await admin
    .from('ceremony_staff')
    .select('user_id, role, added_at')
    .eq('ceremony_id', ceremonyId)
    .order('added_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // user_id → email を一括解決（service role の auth.admin.getUserById を順次呼ぶ）
  const enriched = await Promise.all(
    (staff ?? []).map(async (row) => {
      try {
        const { data } = await admin.auth.admin.getUserById(row.user_id);
        return {
          user_id: row.user_id,
          email: data.user?.email ?? null,
          role: row.role,
          added_at: row.added_at,
        };
      } catch {
        return {
          user_id: row.user_id,
          email: null,
          role: row.role,
          added_at: row.added_at,
        };
      }
    })
  );

  return NextResponse.json({ staff: enriched, my_role: myRole });
}

/**
 * POST: メールでメンバーを追加
 * Body: { ceremony_id, email, role: 'staff' | 'viewer' | 'owner' }
 */
export async function POST(req: NextRequest) {
  const userId = await requireAuth(req);
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const ceremonyId = typeof body?.ceremony_id === 'string' ? body.ceremony_id : null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : null;
  const role = typeof body?.role === 'string' ? body.role : null;

  if (!ceremonyId || !email || !role) {
    return NextResponse.json(
      { error: 'ceremony_id, email, role are required' },
      { status: 400 }
    );
  }
  if (!['owner', 'staff', 'viewer'].includes(role)) {
    return NextResponse.json({ error: 'invalid role' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const myRole = await getMemberRole(admin, ceremonyId, userId);
  if (myRole !== 'owner') {
    return NextResponse.json({ error: 'forbidden: owner only' }, { status: 403 });
  }

  // メールから user を逆引き。Supabase Auth に listUsers してフィルタ。
  // 1ページ最大200件、まれに葬儀社が大量サインアップしているケースまで考慮し2ページ走査。
  let foundUser: { id: string; email: string | null } | null = null;
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const hit = data.users.find(
      (u) => (u.email ?? '').toLowerCase() === email
    );
    if (hit) {
      foundUser = { id: hit.id, email: hit.email ?? null };
      break;
    }
    if (data.users.length < 200) break;
  }

  if (!foundUser) {
    return NextResponse.json(
      {
        error: 'user_not_found',
        message:
          '該当メールのユーザーが見つかりません。先にそのメールでサインアップしてもらってください。',
      },
      { status: 404 }
    );
  }

  // 既に staff なら role を更新、なければ INSERT。UPSERT 相当。
  const { error: upsertError } = await admin
    .from('ceremony_staff')
    .upsert(
      {
        ceremony_id: ceremonyId,
        user_id: foundUser.id,
        role,
        added_by: userId,
      },
      { onConflict: 'ceremony_id,user_id' }
    );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    user_id: foundUser.id,
    email: foundUser.email,
    role,
  });
}

/**
 * DELETE: メンバー除外
 * Query: ceremony_id, user_id
 */
export async function DELETE(req: NextRequest) {
  const callerId = await requireAuth(req);
  if (!callerId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const ceremonyId = req.nextUrl.searchParams.get('ceremony_id');
  const targetUserId = req.nextUrl.searchParams.get('user_id');
  if (!ceremonyId || !targetUserId) {
    return NextResponse.json(
      { error: 'ceremony_id and user_id required' },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();
  const myRole = await getMemberRole(admin, ceremonyId, callerId);
  if (myRole !== 'owner') {
    return NextResponse.json({ error: 'forbidden: owner only' }, { status: 403 });
  }

  // 最後の owner を消すと誰も式典を管理できなくなるためブロック
  const { data: targetRow } = await admin
    .from('ceremony_staff')
    .select('role')
    .eq('ceremony_id', ceremonyId)
    .eq('user_id', targetUserId)
    .maybeSingle();
  if (targetRow?.role === 'owner') {
    const { count } = await admin
      .from('ceremony_staff')
      .select('user_id', { count: 'exact', head: true })
      .eq('ceremony_id', ceremonyId)
      .eq('role', 'owner');
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'cannot remove the last owner of the ceremony' },
        { status: 409 }
      );
    }
  }

  const { error } = await admin
    .from('ceremony_staff')
    .delete()
    .eq('ceremony_id', ceremonyId)
    .eq('user_id', targetUserId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
