-- =============================================================================
-- 005_soft_delete_and_rls_hardening.sql
--
-- データ消失リスクへの対策:
--   1. attendees に deleted_at カラムを追加（論理削除化）
--   2. attendees への物理 DELETE を全面禁止
--      → これにより誰かが誤って本物削除することを防ぐ
--   3. UPDATE ポリシーは維持（スタッフの受付作業は認証なしで行う運用）
-- =============================================================================

-- 1. 論理削除用カラム
ALTER TABLE attendees
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 未削除だけを高速に引くためのパーシャルインデックス
CREATE INDEX IF NOT EXISTS idx_attendees_active
  ON attendees (ceremony_id)
  WHERE deleted_at IS NULL;

-- 2. 既存のゆるいDELETEポリシーがあれば撤去
DROP POLICY IF EXISTS "Anyone can delete attendees" ON attendees;
-- 念のため、昔の命名違いの可能性を拾う
DROP POLICY IF EXISTS "Allow delete attendees" ON attendees;

-- 3. 物理DELETEを完全禁止にするポリシー（誰にも許可しない）
-- PostgreSQL のRLSでは「DELETEに対する許可ポリシーが一つもない」＝不許可。
-- ここでは明示的な「拒否」として、条件が常に偽のポリシーを書く。
CREATE POLICY "No one can hard-delete attendees"
  ON attendees FOR DELETE
  USING (false);

-- 4. SELECT/INSERT/UPDATE は既存の運用を維持
-- （将来的に auth.uid() と ceremonies.mourner_user_id の突合に段階的に強化する）
