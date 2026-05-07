/**
 * 受付モード専用URLで使うトークンの生成・検証ユーティリティ。
 *
 * トークン形式: `rcp_<32 hex chars>`（128bit のエントロピ）
 *  - `rcp_` プレフィクスでトークン用途を明示（他のキーと混同を避ける）
 *  - 32hex は推測困難（全列挙に 2^128 試行）
 *  - URL に置けるよう英数限定
 */

import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

const TOKEN_PREFIX = 'rcp_';
const TOKEN_REGEX = /^rcp_[0-9a-f]{32}$/i;

/**
 * 暗号論的乱数で新しいトークン文字列を生成。
 * DB に保存する前に、同じトークンが既に発行されていないか UNIQUE 制約で守られる。
 */
export function generateReceptionToken(): string {
  const random = crypto.randomBytes(16).toString('hex');
  return `${TOKEN_PREFIX}${random}`;
}

/**
 * 文字列がトークン形式に合致するか軽く確認。DBアクセス前のフィルタとして使う。
 */
export function isValidTokenFormat(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_REGEX.test(token);
}

export type ResolvedReceptionToken = {
  ceremonyId: string;
  expiresAt: string | null;
  displayName: string;
};

/**
 * トークン文字列から有効な reception_tokens 行を引く。
 * - 形式不正 → null
 * - revoked or expired → null
 * - 行なし → null
 *
 * @param admin service-role supabase client
 */
export async function resolveReceptionToken(
  admin: SupabaseClient,
  token: string
): Promise<ResolvedReceptionToken | null> {
  if (!isValidTokenFormat(token)) return null;

  const { data, error } = await admin
    .from('reception_tokens')
    .select('ceremony_id, expires_at, display_name, revoked_at')
    .eq('token', token)
    .maybeSingle();

  if (error || !data) return null;
  if (data.revoked_at) return null;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null;

  return {
    ceremonyId: data.ceremony_id,
    expiresAt: data.expires_at,
    displayName: data.display_name,
  };
}
