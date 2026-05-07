-- =============================================================================
-- 011_reception_tokens.sql
--
-- 「受付モード専用URL」を発行するためのトークンテーブル。
--
-- 目的:
--   葬儀現場で受付を手伝う一般スタッフに、葬儀社オーナーアカウントを共有
--   させなくても、特定の式典だけスキャン受付できるようにする。
--
-- 仕組み:
--   1. オーナーがダッシュボードでトークンを発行（DBに INSERT）。
--   2. 発行された URL: https://yui-paper.vercel.app/r/<token>
--   3. 受付スタッフはその URL を iPad で開くだけで撮影 → 番号採番ができる。
--   4. 過去の参列者リスト・住所・金額は一切表示されない（公開ページの設計上）。
--   5. /api/reception/scan は X-Reception-Token ヘッダで認証し、トークンに
--      紐付いた ceremony_id 以外には書き込めない。
--   6. オーナーは revoked_at を立てて即時失効可能。expires_at で自動失効。
-- =============================================================================

CREATE TABLE IF NOT EXISTS reception_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- トークン本体。`rcp_` プレフィクス + 32 hex（128bit）。形式は src/lib/reception-token.ts で定義。
  token TEXT UNIQUE NOT NULL,
  ceremony_id UUID NOT NULL REFERENCES ceremonies(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 任意の有効期限。NULL なら revoked_at が立つまで永続。葬儀の翌日 23:59 などに設定するのが標準。
  expires_at TIMESTAMPTZ,
  -- 失効時刻。立っていたら無効化されている。
  revoked_at TIMESTAMPTZ,
  -- ダッシュボードで識別するための表示名（例: "山田次郎告別式・受付iPad1"）
  display_name TEXT NOT NULL DEFAULT '受付用URL'
);

CREATE INDEX IF NOT EXISTS idx_reception_tokens_ceremony
  ON reception_tokens(ceremony_id);

-- token 検索を高速化（revoked が立っていないもののみ）
CREATE INDEX IF NOT EXISTS idx_reception_tokens_active
  ON reception_tokens(token)
  WHERE revoked_at IS NULL;

-- ============================================================
-- RLS
--   発行・閲覧・失効はその式典の owner のみに制限。
--   トークンを使った scan API 側は service role で走るため
--   RLS をバイパスして resolve するが、DB から漏洩しない設計。
-- ============================================================
ALTER TABLE reception_tokens ENABLE ROW LEVEL SECURITY;

-- メンバーなら自分の式典のトークン一覧を見られる
CREATE POLICY reception_tokens_select_member ON reception_tokens FOR SELECT
USING (is_ceremony_member(ceremony_id));

-- 作成は owner のみ。created_by は本人。
CREATE POLICY reception_tokens_insert_owner ON reception_tokens FOR INSERT
WITH CHECK (
  ceremony_member_role(ceremony_id) = 'owner'
  AND created_by = auth.uid()
);

-- 失効や表示名変更は owner のみ
CREATE POLICY reception_tokens_update_owner ON reception_tokens FOR UPDATE
USING (ceremony_member_role(ceremony_id) = 'owner');

-- 削除は移行性が低いので使わない（revoked_at で論理失効）。
-- もし必要なら CASCADE で式典消去時のみ削除される。
