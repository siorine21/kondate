-- 仕様書 4.4 — 世帯とプロフィールの作成
--
-- ▼ 実行前に1箇所だけ書き換えてください
--     'YOUR_EMAIL_HERE' → あなた（ユーキ）のメールアドレス
--
-- UUID を手で写す必要はありません。メールアドレスから auth.users を引きます。
-- 何度実行しても結果は同じです。

-- 1) 世帯を1件だけ作る
insert into households (name)
select '我が家'
where not exists (select 1 from households where name = '我が家');

-- 2) あなたを世帯に紐付ける
insert into profiles (user_id, household_id, display_name)
select u.id, h.id, 'ユーキ'
from auth.users u
cross join (select id from households where name = '我が家' limit 1) h
where u.email = 'YOUR_EMAIL_HERE'
on conflict (user_id) do update
  set household_id = excluded.household_id,
      display_name = excluded.display_name;

-- 3) 結果の確認
--    1行返り、display_name が「ユーキ」であれば成功です。
--    0行の場合はメールアドレスの綴りが auth.users と一致していません。
select p.display_name, h.name as household, h.servings, h.repeat_gap_days
from profiles p
join households h on h.id = p.household_id;


-- ============================================================
-- 2人目のアカウントを作った後は supabase/setup/05_add_member.sql を使ってください
-- ============================================================
-- 紐付けが無いと RLS が全テーブルで0行を返し、レシピが1件も見えません。
