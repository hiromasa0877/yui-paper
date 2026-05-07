/**
 * 受付エンドポイント (/api/reception/scan, /api/reception/process-ocr) の
 * 認証ユーティリティ。
 *
 * 二系統の認証経路をサポートする:
 *
 *  ① 受付トークン認証
 *     X-Reception-Token: rcp_<32hex>
 *     reception_tokens テーブルに紐付き、対応する ceremony_id だけ書き込み可。
 *     公開URL `/r/<token>` から手伝い人が叩く想定。
 *
 *  ② Supabase JWT 認証
 *     Authorization: Bearer <jwt>
 *     ログイン中のユーザーが ceremony_staff のメンバーであることを確認。
 *     ダッシュボード経由のオーナー/スタッフ操作で使う。
 *
 *  どちらかが通っていれば authorized = true。両方無ければ 401。
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import {
  isValidTokenFormat,
  resolveReceptionToken,
} from './reception-token';

export type AuthContext = {
  authorized: boolean;
  // 認証方式の記録（ログ・監査用）
  method: 'token' | 'jwt' | 'none';
  // どの ceremony_id に対するアクセスが許可されたか（token認証時のみ自動取得）
  authorizedCeremonyId: string | null;
  userId: string | null;
};

const NO_AUTH: AuthContext = {
  authorized: false,
  method: 'none',
  authorizedCeremonyId: null,
  userId: null,
};

/**
 * リクエストから受付トークン or JWT を読み取り、対象 ceremony への書き込み権限があるか判定する。
 *
 * @param admin service-role の supabase client（呼び出し側で用意）
 * @param req Next.js リクエスト
 * @param targetCeremonyId 操作したい ceremony_id（scan の場合は body から、process-ocr の場合は attendees 経由で取得）
 */
export async function authorizeReceptionRequest(
  admin: SupabaseClient,
  req: NextRequest,
  targetCeremonyId: string
): Promise<AuthContext> {
  // ① 受付トークン認証
  const token = req.headers.get('x-reception-token');
  if (typeof token === 'string' && token.length > 0) {
    if (!isValidTokenFormat(token)) {
      // 形式不正は早期に弾く（ブルートフォース対策）
      return NO_AUTH;
    }
    const resolved = await resolveReceptionToken(admin, token);
    if (resolved && resolved.ceremonyId === targetCeremonyId) {
      return {
        authorized: true,
        method: 'token',
        authorizedCeremonyId: resolved.ceremonyId,
        userId: null,
      };
    }
    // トークンはあるが対象 ceremony と一致しない / 無効
    return NO_AUTH;
  }

  // ② Supabase JWT 認証
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const jwt = authHeader.slice(7).trim();
    if (jwt.length === 0) return NO_AUTH;
    const userId = await verifyUserJwt(jwt);
    if (!userId) return NO_AUTH;
    const isMember = await checkCeremonyMembership(
      admin,
      userId,
      targetCeremonyId
    );
    if (isMember) {
      return {
        authorized: true,
        method: 'jwt',
        authorizedCeremonyId: targetCeremonyId,
        userId,
      };
    }
  }

  return NO_AUTH;
}

/**
 * JWT を anon supabase client で検証して user.id を取り出す。
 * Supabase が公開する JWT は HS256 / RS256 で署名され、
 * supabase.auth.getUser() で検証できる。
 */
async function verifyUserJwt(jwt: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  try {
    const client = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser(jwt);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

/**
 * ユーザが指定 ceremony のメンバー（owner/staff/viewer のいずれか）か確認。
 * RLS 経由ではなく service-role で直接確認するので確実。
 */
async function checkCeremonyMembership(
  admin: SupabaseClient,
  userId: string,
  ceremonyId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from('ceremony_staff')
    .select('user_id')
    .eq('ceremony_id', ceremonyId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[auth] ceremony_staff lookup error:', error);
    return false;
  }
  return !!data;
}
