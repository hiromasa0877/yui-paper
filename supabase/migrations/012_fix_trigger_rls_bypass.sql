-- =============================================================================
-- 012_fix_trigger_rls_bypass.sql
--
-- 緊急修正: SECURITY DEFINER 関数が ceremony_staff の RLS WITH CHECK に
-- 弾かれて INSERT に失敗するバグの修正。
--
-- 症状:
--   新規ユーザがサインアップ後に「式典を作成」しても
--   "式典の作成に失敗しました" というエラーが出る。
--
-- 原因:
--   migration 009 で trg_ceremonies_add_creator_owner トリガーが
--   ceremony_staff に owner レコードを INSERT する設計だが、Supabase の
--   postgres ロールには BYPASSRLS 属性がついていない。SECURITY DEFINER
--   だけでは RLS をすり抜けず、ceremony_staff の WITH CHECK ポリシー
--   (`ceremony_member_role(ceremony_id) = 'owner'`) に弾かれていた。
--   結果として ceremony_staff 行が作られず、続く SELECT が `is_ceremony_member`
--   で false を返して INSERT...RETURNING が 0 行になり、PGRST116 で失敗。
--
-- 修正:
--   関数定義に `SET row_security = off` を追加することで関数実行中だけ
--   RLS を一時的にオフにする。これは PostgreSQL 標準の挙動で、関数
--   スコープ内のクエリだけ RLS をスキップできる。
--
--   同じ理由で is_ceremony_member / ceremony_member_role も自己参照
--   ループ防止のため row_security off を追加。
-- =============================================================================

CREATE OR REPLACE FUNCTION add_creator_as_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF NEW.mourner_user_id IS NOT NULL THEN
    INSERT INTO ceremony_staff (ceremony_id, user_id, role, added_by)
    VALUES (NEW.id, NEW.mourner_user_id, 'owner', NEW.mourner_user_id)
    ON CONFLICT (ceremony_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION is_ceremony_member(p_ceremony_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM ceremony_staff
    WHERE ceremony_id = p_ceremony_id
      AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION ceremony_member_role(p_ceremony_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
SET row_security = off
AS $$
  SELECT role
  FROM ceremony_staff
  WHERE ceremony_id = p_ceremony_id
    AND user_id = auth.uid()
  LIMIT 1;
$$;

-- バックフィル: トリガー破損期間中（migration 009 適用後〜012 適用前）に
-- INSERT された ceremonies は ceremony_staff の owner 行が無く「孤児」になる。
-- mourner には自分の式典が見えなくなる。再走しても安全（ON CONFLICT DO NOTHING）。
INSERT INTO ceremony_staff (ceremony_id, user_id, role, added_by)
SELECT id, mourner_user_id, 'owner', mourner_user_id
FROM ceremonies
WHERE mourner_user_id IS NOT NULL
ON CONFLICT (ceremony_id, user_id) DO NOTHING;
