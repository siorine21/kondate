-- 仕様書 4.5 — RLS の検証
--
-- ▼ 実行前に2箇所書き換えてください
--     'YOUR_EMAIL_HERE' → あなたのメールアドレス
--     'TEST_EMAIL_HERE' → テストユーザーのメールアドレス
--
-- ■ なぜこんな書き方をするのか
--   Supabase の SQL Editor は postgres ロールで動き、このロールは RLS を
--   素通りします。素朴に select * from recipes を実行しても、RLS が正しくても
--   壊れていても行が見えてしまい、検証になりません。
--   そこで JWT のクレームを差し替えて一般ユーザーになりすまして確認します。
--
-- ■ 2方向を確認する理由
--   「他人から見えない」だけでは不十分です。ポリシーを書き忘れたテーブルは
--   誰から見ても0件になり、一見安全に見えて実際は壊れているからです。
--   そのため「他人からは見えない」と「本人からは見える」の両方を確認します。
--
-- 実行後、必ず 03_cleanup_verify.sql で検証用データを削除してください。

drop table if exists _rls_check;
create temp table _rls_check (
  step     int,
  item     text,
  expected text,
  actual   text,
  ok       boolean
);
grant all on _rls_check to authenticated, anon;


-- ============================================================
-- 1. 前提：あなたのプロフィールが作られているか
-- ============================================================
insert into _rls_check
select 1,
       '前提: あなたのプロフィール',
       '1件',
       count(*)::text || '件',
       count(*) = 1
from profiles p
join auth.users u on u.id = p.user_id
where u.email = 'YOUR_EMAIL_HERE';


-- ============================================================
-- 2. 全テーブルで RLS が有効か／ポリシーがあるか（仕様書 2.2-4）
-- ============================================================
insert into _rls_check
select 2,
       'RLS: ' || c.relname,
       '有効 / ポリシー1件以上',
       case when c.relrowsecurity then '有効' else '無効' end
         || ' / ' || count(p.polname)::text || '件',
       c.relrowsecurity and count(p.polname) >= 1
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relnamespace = 'public'::regnamespace
  and c.relkind = 'r'
group by c.relname, c.relrowsecurity;


-- ============================================================
-- 3. 検証用のダミー世帯とレシピを作る（postgres ロールなので RLS は効かない）
-- ============================================================
insert into households (id, name)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'RLS検証用ダミー世帯')
on conflict (id) do nothing;

insert into profiles (user_id, household_id, display_name)
select u.id, 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'RLS検証用'
from auth.users u
where u.email = 'TEST_EMAIL_HERE'
on conflict (user_id) do update
  set household_id = excluded.household_id;

insert into recipes (household_id, name, category, dish_type, cook_time_min)
select h.id, 'RLS検証用（我が家）', 'washoku', 'main', 10
from households h where h.name = '我が家';

insert into recipes (household_id, name, category, dish_type, cook_time_min)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'RLS検証用（ダミー）', 'washoku', 'main', 10);


-- ============================================================
-- 4. 未ログイン（anon）から見えるか → 0件が正しい
-- ============================================================
select set_config('request.jwt.claims', '', false);
set role anon;

insert into _rls_check
select 4,
       '未ログインから見えるレシピ',
       '(0件)',
       coalesce(string_agg(name, ' / ' order by name), '(0件)'),
       count(*) = 0
from recipes;

reset role;


-- ============================================================
-- 5. テストユーザー（別世帯）から見えるか → 自分の世帯の1件だけが正しい
-- ============================================================
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub',  (select id from auth.users where email = 'TEST_EMAIL_HERE'),
    'role', 'authenticated'
  )::text,
  false
);
set role authenticated;

insert into _rls_check
select 5,
       'テストユーザーから見えるレシピ',
       'RLS検証用（ダミー）のみ',
       coalesce(string_agg(name, ' / ' order by name), '(0件)'),
       coalesce(string_agg(name, ' / ' order by name), '') = 'RLS検証用（ダミー）'
from recipes;

reset role;


-- ============================================================
-- 6. あなたから見えるか → 我が家の1件だけが正しい
-- ============================================================
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub',  (select id from auth.users where email = 'YOUR_EMAIL_HERE'),
    'role', 'authenticated'
  )::text,
  false
);
set role authenticated;

insert into _rls_check
select 6,
       'あなたから見えるレシピ',
       'RLS検証用（我が家）のみ',
       coalesce(string_agg(name, ' / ' order by name), '(0件)'),
       coalesce(string_agg(name, ' / ' order by name), '') = 'RLS検証用（我が家）'
from recipes;

reset role;
select set_config('request.jwt.claims', '', false);


-- ============================================================
-- 結果
-- ============================================================
-- result 列がすべて OK なら合格です。この表をそのまま貼ってください。
select step,
       item,
       expected,
       actual,
       case when ok then 'OK' else 'NG' end as result
from _rls_check
order by step, item;
