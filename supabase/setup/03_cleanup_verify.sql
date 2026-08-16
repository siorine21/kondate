-- 仕様書 4.5 の手順4 — 検証用データの削除
-- 02_verify_rls.sql を実行したら、確認後に必ずこれを実行してください。

delete from recipes  where name like 'RLS検証用%';
delete from profiles where household_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
delete from households where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
drop table if exists _rls_check;

-- すべて0件になっていれば削除完了です。
select
  (select count(*) from recipes    where name like 'RLS検証用%')                                  as 残ったレシピ,
  (select count(*) from households where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd')             as 残ったダミー世帯,
  (select count(*) from profiles   where household_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd')   as 残ったダミープロフィール;

-- テストユーザー自体（auth.users の行）は、Supabase 管理画面の
-- Authentication → Users から削除してください。
