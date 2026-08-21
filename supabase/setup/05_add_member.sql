-- 妻のアカウントを世帯に紐付ける（仕様書 4.4-3）
--
-- ▼ 実行前に1箇所だけ書き換えてください
--     'WIFE_EMAIL_HERE' → 妻のメールアドレス
--
-- 紐付けが無い利用者は current_household_id() が空になり、
-- RLS が全テーブルで1行も返しません（仕様書 3.3）。
-- レシピが「無い」ように見えるのはこれが理由です。
--
-- 何度実行しても結果は同じです。

insert into profiles (user_id, household_id, display_name)
select u.id, h.id, '妻'
from auth.users u
cross join (select id from households order by created_at limit 1) h
where u.email = 'WIFE_EMAIL_HERE'
on conflict (user_id) do update
  set household_id = excluded.household_id;

-- 確認：2行返り、household が同じであれば成功です。
-- 0行や1行の場合は、メールアドレスの綴りが auth.users と一致していません。
select p.display_name, u.email, h.name as household
from profiles p
join auth.users u on u.id = p.user_id
join households h on h.id = p.household_id
order by p.created_at;
