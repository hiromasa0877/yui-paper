-- =============================================================================
-- 008_unique_ceremony_koden.sql
--
-- (ceremony_id, koden_number) の一意性を強制する。
-- これまで attendees テーブルには UNIQUE制約も UNIQUE INDEX も無く、
-- 同時刻に複数のスタッフが受付スキャンすると、同一式典内で同じ koden_number が
-- 2件以上できてしまう競合状態が成立してしまう状態だった。
--
-- ここで UNIQUE 部分インデックスを追加することで、INSERT 競合時に PostgreSQL が
-- 23505 エラーを返し、scan ルートの assignNextNumber 内 retry ループが
-- 初めて意図通りに動作するようになる（新しい MAX を読んで番号を取り直す）。
--
-- WHERE deleted_at IS NULL の部分条件は、ソフト削除されたレコードが古い番号を
-- 保持し続けても、新規発番に支障が出ないようにするためのもの。
-- =============================================================================

-- 念のため: 重複が残っていれば INDEX 作成は失敗する。
-- 事前に確認していること（このマイグレーション適用前の重複行は0件）。
CREATE UNIQUE INDEX IF NOT EXISTS uniq_attendees_ceremony_koden
  ON attendees (ceremony_id, koden_number)
  WHERE deleted_at IS NULL AND koden_number IS NOT NULL;
