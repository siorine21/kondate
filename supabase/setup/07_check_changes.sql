-- 変更が反映されたかを確かめるだけの SQL。書き換えはしません。
--
-- パスワードそのもの（auth.users.encrypted_password）は選びません。
-- 見る必要がなく、見てよいものでもないためです。

-- 1) 表示名と世帯
--    profiles に更新時刻の列はありません。いまの値が唯一の手がかりです。
select
  u.email,
  coalesce(p.display_name, '（profile なし）') as 表示名,
  coalesce(h.name, '—')                      as 世帯
from auth.users u
left join profiles p on p.user_id = u.id
left join households h on h.id = p.household_id
order by u.created_at;

-- 2) アカウントが最後に更新された時刻
--    パスワードを変えるとここが動きます。ただしメールアドレスの変更など
--    他の更新でも動くため、「パスワードだけが変わった証拠」にはなりません。
select
  email,
  created_at        as 作成,
  updated_at        as 最終更新,
  last_sign_in_at   as 最終ログイン
from auth.users
order by created_at;
