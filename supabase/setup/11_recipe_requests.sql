-- 料理のリクエスト（変更記録 3.20）
--
-- 「今度これが食べたい」を出し合うための表。
-- 週には紐づけない。出しておくと、その料理が入るまで効き続ける。
--
-- 仕様書 3.1 の plan_requests（自由文＋AI でタグ変換）とは別物。
-- あちらは AI を凍結したため（変更記録 3.4）作っていない。
--
-- 何度実行しても結果は同じです。

create table if not exists recipe_requests (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  recipe_id    uuid not null references recipes(id) on delete cascade,
  note         text,
  -- open   まだ献立に入っていない
  -- done   献立に入って確定した
  status       text not null default 'open'
               check (status in ('open', 'done')),
  requested_by uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  fulfilled_at timestamptz
);

-- 同じ料理を二重にリクエストしない。叶ったあとなら、また出せる。
create unique index if not exists recipe_requests_open_uniq
  on recipe_requests (household_id, recipe_id)
  where status = 'open';

create index if not exists recipe_requests_household_status
  on recipe_requests (household_id, status);

-- RLS が唯一の防壁（仕様書 3.3）。世帯の外からは1行も見えない。
alter table recipe_requests enable row level security;

drop policy if exists "household access" on recipe_requests;
create policy "household access" on recipe_requests
  for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

-- 確認：この世帯のリクエストが返る（まだ出していなければ 0 行）。
select r.name, q.status, q.note, q.created_at
from recipe_requests q
join recipes r on r.id = q.recipe_id
where q.household_id = public.current_household_id()
order by q.created_at desc;
