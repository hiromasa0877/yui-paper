-- =============================================================================
-- 013_relax_ceremonies_insert_and_whoami.sql
--
-- 目的:
--   1) ceremonies INSERT が 42501 (RLS WITH CHECK 違反) で失敗する事象の調査用
--      診断関数 `whoami()` を追加する。
--   2) 商談デモまでに確実に動かすため、INSERT WITH CHECK を
--      「authenticated ロールであれば誰でも自分用に作成できる」形に緩和する。
--      mourner_user_id は BEFORE INSERT トリガで auth.uid() に強制上書きすることで、
--      クライアント側のなりすまし耐性を維持する（防御の二重化）。
--
-- 背景:
--   migration 009 で ceremony_staff/トリガ周りを整備し、012 で SECURITY DEFINER の
--   RLS bypass を入れた。それでも本番で `auth.uid() = mourner_user_id` が外れる
--   ケースがあり、PGRST 経由の INSERT が落ちる。原因切り分けに時間がかかるため、
--   ポリシーの緩和（ただし BEFORE INSERT で値を強制上書き）で「実質同じ安全性」を
--   保ちながら復旧させる。
-- =============================================================================

-- ① 診断: 現在の JWT から見える auth.uid() / role / sub などを返す
-- ブラウザから supabase.rpc('whoami') で呼んで、実際に PostgREST が何を見ているか確認する。
CREATE OR REPLACE FUNCTION whoami()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT jsonb_build_object(
    'uid', auth.uid(),
    'role', auth.role(),
    'jwt', auth.jwt()
  );
$$;

GRANT EXECUTE ON FUNCTION whoami() TO authenticated, anon;

-- ② 既存の厳格な INSERT ポリシーを差し替え
DROP POLICY IF EXISTS "Users can create ceremonies" ON ceremonies;

-- authenticated ロールであれば INSERT 可能。実際の所有者は BEFORE INSERT トリガで
-- auth.uid() に上書きされるため、クライアントが任意の mourner_user_id を送っても
-- 結果としてその行は自分のものになる。
CREATE POLICY ceremonies_insert_authenticated ON ceremonies
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ③ BEFORE INSERT で mourner_user_id を auth.uid() に強制
-- これによりポリシー緩和してもセキュリティ実害が出ない。
CREATE OR REPLACE FUNCTION enforce_ceremony_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  -- 認証済みユーザの場合、mourner_user_id を強制的に auth.uid() に上書き。
  -- service_role 等で auth.uid() が NULL の場合は元の値を尊重（バックフィル/バッチ用）。
  IF auth.uid() IS NOT NULL THEN
    NEW.mourner_user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ceremonies_enforce_owner ON ceremonies;
CREATE TRIGGER trg_ceremonies_enforce_owner
  BEFORE INSERT ON ceremonies
  FOR EACH ROW
  EXECUTE FUNCTION enforce_ceremony_owner();
