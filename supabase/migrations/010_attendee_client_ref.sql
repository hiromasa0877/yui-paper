-- =============================================================================
-- 010_attendee_client_ref.sql
--
-- 撮影〜サーバー保存までの「二重送信」事故を防ぐための冪等性キー。
--
-- 課題:
--   - クライアントが scan エンドポイントに POST した直後にネットワークが切れる
--     場合、レスポンスを受け取れず再試行 → 同じ参列者を二度INSERTしてしまう
--   - オフラインキューに溜めたスキャンを後でフラッシュする際も同様
--
-- 対策:
--   - クライアント側で UUID を生成し client_ref として送信
--   - scan エンドポイント側で ON CONFLICT (client_ref) DO NOTHING を入れて
--     重複INSERTを安全にスキップ
-- =============================================================================

ALTER TABLE attendees
  ADD COLUMN IF NOT EXISTS client_ref UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_attendees_client_ref
  ON attendees (client_ref)
  WHERE client_ref IS NOT NULL;
