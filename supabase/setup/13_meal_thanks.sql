-- 今日のごはんにハートを贈る（変更記録 3.29）
--
-- 作ってくれた人へ、特に美味しかったことを伝えるための表。
-- レシピの★評価（recipe_ratings）とは別物で、献立の選ばれやすさには効かない。
-- あちらは好みの記録、こちらは相手へのひとこと。
--
-- 1日ひとり1回まで。連打できると「特に」が伝わらなくなる。
--
-- 何度実行しても結果は同じです。

create table if not exists meal_thanks (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  -- どの日のごはんに贈ったか。
  date         date not null,
  -- そのとき出ていた主菜。あとで「この料理は何回もらったか」を数えるため。
  -- レシピを消しても、贈った事実は残す。
  recipe_id    uuid references recipes(id) on delete set null,
  -- ひとこと。何が美味しかったかを書ける。
  note         text,
  created_by   uuid not null references auth.users(id),
  created_at   timestamptz not null default now(),
  -- 1日ひとり1回。
  unique (household_id, date, created_by)
);

create index if not exists meal_thanks_household_date
  on meal_thanks (household_id, date desc);

create index if not exists meal_thanks_recipe
  on meal_thanks (recipe_id);

-- RLS が唯一の防壁（仕様書 3.3）。世帯の外からは1行も見えない。
alter table meal_thanks enable row level security;

drop policy if exists "household access" on meal_thanks;
create policy "household access" on meal_thanks
  for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

-- 確認：この世帯のハートが新しい順に返る（まだ贈っていなければ 0 行）。
select t.date, r.name, t.note, p.display_name as "贈った人"
from meal_thanks t
left join recipes r on r.id = t.recipe_id
left join profiles p on p.user_id = t.created_by
where t.household_id = public.current_household_id()
order by t.date desc;
