-- RLS 検証の下ごしらえ（仕様書 4.5 の手順1）
--
-- ▼ 実行前に1箇所書き換えてください
--     'TEST_EMAIL_HERE' → テストユーザーのメールアドレス
--
-- これは管理者権限が要る作業なので、あなたの手元で実行します。
-- 検証そのものは scripts/verify-rls.mjs が、管理者権限を使わずに
-- 実際のログイン経由で行います。
--
-- 検証用データには機械的に選べる印（'RLS検証用' の接頭辞と固定 UUID）を
-- 付けてあります。後片付けは必ずその印だけを条件にします。
--
-- 実行後、確認が済んだら 03_cleanup_verify.sql で削除してください。

-- 1) ダミー世帯を作る
insert into households (id, name)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'RLS検証用ダミー世帯')
on conflict (id) do nothing;

-- 2) テストユーザーをダミー世帯に紐付ける
insert into profiles (user_id, household_id, display_name)
select u.id, 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'RLS検証用'
from auth.users u
where u.email = 'TEST_EMAIL_HERE'
on conflict (user_id) do update
  set household_id = excluded.household_id;

-- 3) 両方の世帯にレシピを1件ずつ置く
--    テストユーザーから「ダミーの1件だけ」が見えるのが正解。
--    我が家の1件が見えたら遮断できていない。
--    どちらも見えなければポリシーの書き忘れ（誰からも見えない状態）。
insert into recipes (household_id, name, category, dish_type, cook_time_min)
select h.id, 'RLS検証用（我が家）', 'washoku', 'main', 10
from households h where h.name = '我が家';

insert into recipes (household_id, name, category, dish_type, cook_time_min)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'RLS検証用（ダミー）', 'washoku', 'main', 10);

-- 4) 下ごしらえの確認
--    2行返り、それぞれ別の世帯に属していれば準備完了です。
select r.name, h.name as household
from recipes r
join households h on h.id = r.household_id
where r.name like 'RLS検証用%'
order by r.name;
