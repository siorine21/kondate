-- 仕様書 3.1 / 3.2
-- ENUM とテーブルの定義。一度だけ実行する。
-- RLS は次のマイグレーション（20260816120100_rls_policies.sql）で設定する。

-- ============================================================
-- 3.1 ENUM
-- ============================================================

create type recipe_category   as enum ('washoku','yoshoku','chuka','other');
create type dish_type         as enum ('main','side','soup','rice');
create type main_protein      as enum ('meat','fish','egg','soy','none');
create type cook_method       as enum ('grill','simmer','fry','stirfry','steam','raw','other');
create type recipe_status     as enum ('draft','active','archived');
create type recipe_source     as enum ('ai','manual');
create type plan_status       as enum ('draft','confirmed');
create type entry_type        as enum ('cook','eatout','batch','leftover');

-- 並び順がそのまま買い物リストの表示順（スーパーの売り場動線順）になる。
-- 値を追加するときは末尾ではなく動線上の正しい位置に入れること。
create type shop_category     as enum ('produce','meat','seafood','tofu','dairy_egg','dry','seasoning','other');

-- ============================================================
-- 3.2 テーブル
-- ============================================================

-- 世帯
create table households (
  id            uuid primary key default gen_random_uuid(),
  name          text not null default '我が家',
  servings      int  not null default 2,
  allergies     text[] not null default '{}',
  disliked      text[] not null default '{}',
  ratio_washoku int not null default 4,
  ratio_yoshoku int not null default 1,
  ratio_chuka   int not null default 2,
  repeat_gap_days int not null default 14,
  include_seasoning_in_shopping boolean not null default false,
  weekday_max_minutes int not null default 30,
  weekend_max_minutes int,                       -- null = 制限なし
  created_at    timestamptz not null default now()
);

-- ユーザープロフィール
create table profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now()
);
create index on profiles(household_id);

-- 食材マスタ（表記ゆれ吸収と売り場分類）
create table ingredient_master (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  name          text not null,
  aliases       text[] not null default '{}',
  shop_category shop_category not null,
  default_unit  text,
  is_pantry     boolean not null default false,  -- 常備品。買い物リストに出さない
  unique (household_id, name)
);

-- レシピ
create table recipes (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  name          text not null,
  category      recipe_category not null,
  dish_type     dish_type not null,
  main_protein  main_protein not null default 'none',
  method        cook_method not null default 'other',
  cook_time_min int not null,
  servings      int not null default 2,
  food_groups   int[] not null default '{}',     -- 1〜6
  tags          text[] not null default '{}',    -- 時短 / 作りおき可 / 揚げ物 など
  steps         text[] not null default '{}',
  memo          text,
  source        recipe_source not null default 'manual',
  status        recipe_status not null default 'draft',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on recipes(household_id, status, dish_type);

-- レシピ材料
-- 買い物リストの合算に使うため正規化する。jsonb に格納してはならない（仕様書 2.2-7）。
create table recipe_ingredients (
  id            uuid primary key default gen_random_uuid(),
  recipe_id     uuid not null references recipes(id) on delete cascade,
  name          text not null,
  qty           numeric,
  unit          text,
  shop_category shop_category not null default 'other',
  sort_order    int not null default 0
);
create index on recipe_ingredients(recipe_id);

-- 週間献立
create table meal_plans (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  week_start    date not null,                   -- 月曜日
  status        plan_status not null default 'draft',
  created_at    timestamptz not null default now(),
  unique (household_id, week_start)
);

-- 献立の各日・各品
create table meal_plan_items (
  id           uuid primary key default gen_random_uuid(),
  plan_id      uuid not null references meal_plans(id) on delete cascade,
  date         date not null,
  slot         dish_type not null,               -- main / side / soup
  recipe_id    uuid references recipes(id) on delete set null,
  entry_type   entry_type not null default 'cook',
  locked       boolean not null default false,   -- リクエストで固定
  note         text
);
create index on meal_plan_items(plan_id, date);

-- リクエスト
create table plan_requests (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references meal_plans(id) on delete cascade,
  free_text     text,
  parsed_tags   jsonb not null default '{}',
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

-- 買い物リスト
create table shopping_items (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references meal_plans(id) on delete cascade,
  name          text not null,
  total_qty     numeric,
  unit          text,
  shop_category shop_category not null,
  checked       boolean not null default false,
  checked_by    uuid references auth.users(id),
  checked_at    timestamptz,
  sort_order    int not null default 0
);
create index on shopping_items(plan_id, shop_category);

-- 評価
create table recipe_ratings (
  recipe_id  uuid not null references recipes(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  score      int not null check (score between 1 and 3),
  updated_at timestamptz not null default now(),
  primary key (recipe_id, user_id)
);
