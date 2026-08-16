-- 仕様書 3.3
-- ANON KEY はブラウザに必ず露出するため、RLS が唯一の実効的な防壁である。
-- 全10テーブルで有効化し、いずれにもポリシーを設定する（仕様書 2.2-4）。
--
-- 何度でも再実行できるよう、ポリシーは drop してから create する。

-- ============================================================
-- ヘルパー関数
-- ============================================================
-- security definer なので profiles の RLS を迂回して自世帯を引ける。
-- これがないとポリシー評価が profiles のポリシーを再帰的に呼び出す。
create or replace function public.current_household_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select household_id from profiles where user_id = auth.uid()
$$;

-- ============================================================
-- RLS の有効化（全10テーブル）
-- ============================================================
alter table households         enable row level security;
alter table profiles           enable row level security;
alter table ingredient_master  enable row level security;
alter table recipes            enable row level security;
alter table recipe_ingredients enable row level security;
alter table meal_plans         enable row level security;
alter table meal_plan_items    enable row level security;
alter table plan_requests      enable row level security;
alter table shopping_items     enable row level security;
alter table recipe_ratings     enable row level security;

-- ============================================================
-- household_id を直接持つテーブル
-- ============================================================

drop policy if exists "household access" on households;
create policy "household access" on households
  for all
  using (id = public.current_household_id())
  with check (id = public.current_household_id());

drop policy if exists "household access" on profiles;
create policy "household access" on profiles
  for all
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

drop policy if exists "household access" on ingredient_master;
create policy "household access" on ingredient_master
  for all
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

drop policy if exists "household access" on recipes;
create policy "household access" on recipes
  for all
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

drop policy if exists "household access" on meal_plans;
create policy "household access" on meal_plans
  for all
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

-- ============================================================
-- 親テーブル経由で判定するテーブル
-- ============================================================

drop policy if exists "household access via recipe" on recipe_ingredients;
create policy "household access via recipe" on recipe_ingredients
  for all
  using (exists (
    select 1 from recipes r
    where r.id = recipe_id and r.household_id = public.current_household_id()
  ))
  with check (exists (
    select 1 from recipes r
    where r.id = recipe_id and r.household_id = public.current_household_id()
  ));

drop policy if exists "household access via recipe" on recipe_ratings;
create policy "household access via recipe" on recipe_ratings
  for all
  using (exists (
    select 1 from recipes r
    where r.id = recipe_id and r.household_id = public.current_household_id()
  ))
  with check (exists (
    select 1 from recipes r
    where r.id = recipe_id and r.household_id = public.current_household_id()
  ));

drop policy if exists "household access via plan" on meal_plan_items;
create policy "household access via plan" on meal_plan_items
  for all
  using (exists (
    select 1 from meal_plans p
    where p.id = plan_id and p.household_id = public.current_household_id()
  ))
  with check (exists (
    select 1 from meal_plans p
    where p.id = plan_id and p.household_id = public.current_household_id()
  ));

drop policy if exists "household access via plan" on plan_requests;
create policy "household access via plan" on plan_requests
  for all
  using (exists (
    select 1 from meal_plans p
    where p.id = plan_id and p.household_id = public.current_household_id()
  ))
  with check (exists (
    select 1 from meal_plans p
    where p.id = plan_id and p.household_id = public.current_household_id()
  ));

drop policy if exists "household access via plan" on shopping_items;
create policy "household access via plan" on shopping_items
  for all
  using (exists (
    select 1 from meal_plans p
    where p.id = plan_id and p.household_id = public.current_household_id()
  ))
  with check (exists (
    select 1 from meal_plans p
    where p.id = plan_id and p.household_id = public.current_household_id()
  ));
