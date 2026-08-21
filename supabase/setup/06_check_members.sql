-- いまの登録状況を見るだけの SQL。書き換えも変更もしません。
--
-- 05_add_member.sql が効かなかったときは、まずこれを実行して
-- 何がどうなっているかを確かめます。

-- 1) 利用者と、その紐付け
--    profile が「なし」の人は、RLS が全テーブルで0行を返します（3.3）。
select
  u.email,
  coalesce(p.display_name, '（profile なし）') as 表示名,
  coalesce(h.name, '—')                      as 世帯,
  p.household_id
from auth.users u
left join profiles p on p.user_id = u.id
left join households h on h.id = p.household_id
order by u.created_at;

-- 2) 世帯の数
--    2つ以上ある場合、2人が別々の世帯に入っている可能性があります。
select id, name, created_at from households order by created_at;
