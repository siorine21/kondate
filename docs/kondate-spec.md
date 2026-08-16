# Kondate — 週間夕食献立自動化ツール 開発仕様書

**バージョン** 1.0
**作成日** 2026-08-16
**リポジトリ名** `kondate`
**想定利用者** 2名（夫婦）／ 主利用者は妻

---

## 0. この仕様書の使い方

### 0.1 開発者（Claude Code）への前提

本書は Claude Code が単独で実装できるよう記述されている。実装前に**全章を通読**すること。特に以下は他章の内容を前提としているため、部分読みでは正しく実装できない。

- 第7章（生成アルゴリズム）は第3章のスキーマと第10章の評価ロジックに依存する
- 第9章（買い物リスト）は第3章の `ingredient_master` の名寄せ設計に依存する

### 0.2 フェーズ分割の厳守

本書は第12章で実装を8フェーズに分割している。**一度に全フェーズを実装してはならない。**

各フェーズの完了条件を満たした時点で作業を止め、何を実装したか・完了条件をどう検証したかを報告すること。次フェーズへは依頼者の指示を待つ。

理由：一括実装では RLS の適用漏れ、生成アルゴリズムの簡略化（決定論的処理をAI呼び出しに置き換えてしまう等）が起きやすく、いずれもツール全体の価値を損なう。

### 0.3 判断に迷った場合

仕様に記載のない判断が必要になった場合、**推測で実装せず質問すること**。特に以下は勝手に決めてはならない。

- スキーマの変更・カラムの追加
- 生成アルゴリズムのスコア重み付けの変更
- 画面の追加・統合
- 外部ライブラリの追加

---

## 1. プロジェクト概要

### 1.1 目的

毎週の夕食献立を考える負担をなくす。ユーザーは「今週の献立を作る」を1回押すだけで、栄養バランスの取れた7日分の夕食献立と、売り場順に整理された買い物リストを得られる。

### 1.2 スコープ

| 対象 | 内容 |
|---|---|
| 献立の対象 | **夕食のみ**（主菜・副菜・汁物の3品構成） |
| 期間単位 | 月曜始まりの7日間 |
| 人数 | 大人2人分固定（設定で変更可） |
| 利用者 | 招待済みの2アカウントのみ。新規登録は不可 |

### 1.3 設計上の最重要方針

**レシピ生成層とレシピ編成層を完全に分離する。**

- **レシピ生成層（AI）** — 品名を入力すると Claude API が構造化レシピを生成する。結果は必ず `draft` として保存され、人が承認するまで献立に使われない
- **献立編成層（決定論的アルゴリズム）** — DB上の承認済みレシピから、制約条件スコアリングで7日分を組む。**AIは使用しない**

この分離により、献立生成が高速・無料・再現可能になる。AIの利用は「レシピが不足したとき」と「自由文リクエストのタグ変換」に限定する。

### 1.4 栄養管理の方針

kcal・PFCの厳密計算は行わない。食材の重量入力が必須になり、継続利用が破綻するため。

代わりに、**6つの基礎食品群のカバレッジ**をレシピ単位でタグ付けし、週7食を1単位として充足度を評価する。

| 群 | 内容 | 主な役割 |
|---|---|---|
| 1群 | 魚・肉・卵・大豆製品 | たんぱく質 |
| 2群 | 牛乳・乳製品・小魚・海藻 | カルシウム |
| 3群 | 緑黄色野菜 | カロテン |
| 4群 | 淡色野菜・果物 | ビタミンC |
| 5群 | 穀類・いも・砂糖 | 糖質 |
| 6群 | 油脂 | 脂質 |

---

## 2. 技術スタック

| レイヤ | 採用技術 | 備考 |
|---|---|---|
| フレームワーク | Next.js 15 (App Router) | Server Components前提 |
| 言語 | TypeScript (strict) | |
| スタイル | Tailwind CSS v4 | デザイントークンはCSS変数で定義 |
| DB / 認証 | Supabase (PostgreSQL + Auth + Realtime) | |
| ORM | Supabase JS Client (`@supabase/ssr`) | Prismaは使わない |
| AI | Anthropic Claude API (`claude-sonnet-4-6`) | Route Handler経由でサーバ側のみ |
| グラフ | 自前SVG | ライブラリ不使用（レーダー1種のみのため） |
| ホスティング | Vercel | |
| フォント | Shippori Mincho B1 / Zen Kaku Gothic New / Roboto Mono | Google Fonts |

### 2.1 非機能要件

- **レスポンス** — 週間献立の生成は2秒以内（AIを介さないため達成可能）
- **対応端末** — スマートフォン優先（iPhone Safari / Android Chrome）。PCは副次
- **オフライン** — 非対応
- **可用性** — 個人利用のため冗長構成は不要
- **アクセシビリティ** — キーボードフォーカス可視、`prefers-reduced-motion` 尊重

### 2.2 実装時の禁止事項

以下はいずれも本ツールの根幹を損なう。例外なく守ること。

| # | 禁止事項 | 理由 |
|---|---|---|
| 1 | サインアップ画面・API・導線を実装する | 2名限定という要件の中核 |
| 2 | `ANTHROPIC_API_KEY` に `NEXT_PUBLIC_` を付ける | APIキーがブラウザに露出する |
| 3 | Service Role Key をアプリコードで使う | RLSを迂回でき、防壁が無意味になる |
| 4 | RLSを無効のまま、またはポリシー未設定でテーブルを作る | ANON KEYは必ず露出するため実質無防備になる |
| 5 | **週間献立の生成にAI（Claude API）を使う** | 遅い・課金される・結果が再現しない。決定論的アルゴリズムで実装すること |
| 6 | AI生成レシピを `status='active'` で直接保存する | 分量の誤りが検証されないまま食卓に出る |
| 7 | `recipe_ingredients` を正規化せず jsonb に格納する | 買い物リストの食材合算が実装不能になる |
| 8 | 献立生成ロジックをクライアント側で実行する | ロジックとレシピDBが露出する |
| 9 | UIコンポーネントライブラリ（MUI, Chakra等）を追加する | デザイントークンとの整合が崩れる。Tailwindのみで実装する |
| 10 | `any` や `as` による型の握りつぶし | strictモードの意味がなくなる |
| 11 | 完了条件を満たさないまま次のフェーズへ進む | 手戻りが指数的に増える |
| 12 | 仕様にない機能を追加する（朝食・昼食対応、カロリー計算、レシピ共有機能など） | スコープ外。必要なら依頼者が指示する |

### 2.3 ディレクトリ構成

```
kondate/
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (app)/
│   │   ├── page.tsx                 # 今日の献立
│   │   ├── week/page.tsx
│   │   ├── nutrition/page.tsx
│   │   ├── shopping/page.tsx
│   │   ├── request/page.tsx
│   │   ├── settings/page.tsx
│   │   ├── recipes/page.tsx
│   │   └── recipes/[id]/page.tsx
│   ├── api/
│   │   ├── plans/…
│   │   ├── recipes/…
│   │   ├── shopping/…
│   │   ├── requests/parse/route.ts
│   │   └── settings/route.ts
│   ├── layout.tsx
│   └── globals.css                  # デザイントークン定義
├── components/
│   ├── ui/                          # Button, Card, Tag, Chip, Checkbox
│   ├── ProteinRibbon.tsx            # 週間画面のたんぱく源リボン
│   ├── DayCard.tsx
│   ├── NutritionRadar.tsx           # SVGレーダー
│   └── TabBar.tsx
├── lib/
│   ├── supabase/{client,server,middleware}.ts
│   ├── planner/                     # 献立生成。純粋関数のみ。副作用禁止
│   │   ├── generate.ts
│   │   ├── score.ts
│   │   ├── validate.ts
│   │   ├── types.ts
│   │   └── __tests__/
│   ├── ai/{recipe.ts,request.ts}    # Claude API 呼び出し
│   ├── shopping/build.ts
│   └── nutrition/evaluate.ts
├── supabase/migrations/
├── scripts/seed-recipes.ts
├── docs/
│   ├── kondate-spec.md              # 本書
│   └── kondate-wireframe.html       # 画面モック
└── middleware.ts
```

`lib/planner/` は Supabase クライアントを import してはならない。データを引数で受け取り、結果を返す純粋関数として実装すること（単体テストのため）。

---

## 3. データモデル

### 3.1 ENUM定義

```sql
create type recipe_category   as enum ('washoku','yoshoku','chuka','other');
create type dish_type         as enum ('main','side','soup','rice');
create type main_protein      as enum ('meat','fish','egg','soy','none');
create type cook_method       as enum ('grill','simmer','fry','stirfry','steam','raw','other');
create type recipe_status     as enum ('draft','active','archived');
create type recipe_source     as enum ('ai','manual');
create type plan_status       as enum ('draft','confirmed');
create type entry_type        as enum ('cook','eatout','batch','leftover');
create type shop_category     as enum ('produce','meat','seafood','tofu','dairy_egg','dry','seasoning','other');
```

`shop_category` の並び順がそのまま買い物リストの表示順（スーパーの売り場動線順）になる。

### 3.2 テーブル定義

```sql
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

-- レシピ材料（正規化必須。買い物リストの合算に使う）
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
```

### 3.3 RLS（Row Level Security）

ANON KEY はブラウザに必ず露出するため、**RLSが唯一の実効的な防壁**である。全テーブルで有効化すること。

```sql
-- ヘルパー関数
create or replace function public.current_household_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select household_id from profiles where user_id = auth.uid()
$$;

-- 全テーブルで有効化
alter table households        enable row level security;
alter table profiles          enable row level security;
alter table ingredient_master enable row level security;
alter table recipes           enable row level security;
alter table recipe_ingredients enable row level security;
alter table meal_plans        enable row level security;
alter table meal_plan_items   enable row level security;
alter table plan_requests     enable row level security;
alter table shopping_items    enable row level security;
alter table recipe_ratings    enable row level security;

-- household_id を直接持つテーブル（例：recipes）
create policy "household access" on recipes
  for all
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

-- 同様のポリシーを households(id=), profiles, ingredient_master,
-- meal_plans に適用する

-- 親経由で判定するテーブル（例：recipe_ingredients）
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

-- 同様に meal_plan_items / plan_requests / shopping_items は meal_plans 経由、
-- recipe_ratings は recipes 経由で判定する
```

---

## 4. 認証・セキュリティ

### 4.1 アカウント方針

1. Supabase ダッシュボードで **Authentication → Providers → Email → Enable Signup を OFF** にする
2. 2名のユーザーを Supabase 管理画面から手動作成する
3. `households` に1レコード、`profiles` に2レコードを手動投入し、両者を同一 `household_id` に紐付ける
4. アプリ側にサインアップ画面・導線を**一切実装しない**

### 4.2 実装上の遵守事項

- `ANTHROPIC_API_KEY` はサーバ環境変数のみ。`NEXT_PUBLIC_` を絶対に付けない
- Claude API の呼び出しは Route Handler (`app/api/**/route.ts`) からのみ行う
- Service Role Key はアプリコードで使用しない（マイグレーション時のみ）
- 全 Route Handler の冒頭でセッション検証を行い、未認証は 401 を返す
- ミドルウェアでログイン画面以外を保護する

### 4.3 環境変数

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
ANTHROPIC_API_KEY=
```

### 4.4 初期アカウントの投入SQL

Supabase 管理画面で2ユーザーを作成した後、SQL Editor で以下を実行する。

```sql
-- 世帯を1件作成
insert into households (name) values ('我が家')
returning id;   -- ← 返却された UUID を控える

-- 2名を同一世帯に紐付ける
insert into profiles (user_id, household_id, display_name) values
  ('<ユーザー1のauth.users.id>', '<上記household_id>', 'ユーキ'),
  ('<ユーザー2のauth.users.id>', '<上記household_id>', '妻');
```

### 4.5 RLSの検証手順（Phase 1 の完了条件）

1. ダミーの第3の世帯とユーザーを一時的に作成する
2. そのユーザーでログインし、`select * from recipes` を実行する
3. **0件が返ること**を確認する（エラーではなく0件が正しい挙動）
4. 確認後、ダミーデータを削除する

この検証を行わずに Phase 1 を完了としてはならない。

### 4.6 追加の強化（任意）

Cloudflare Access を Vercel の前段に置き、許可メールアドレス以外は アプリに到達させない構成にできる。実装不要だが README に手順を記載すること。

---

## 5. 画面仕様

参照モック：`kondate-wireframe.html`（全9画面、遷移動作込み）

### 5.1 画面一覧

| # | 画面 | パス | 概要 |
|---|---|---|---|
| 1 | ログイン | `/login` | メール＋パスワード。新規登録導線なし |
| 2 | 今日の献立 | `/` | 起動時のトップ。今夜の3品を即表示 |
| 3 | 週間献立 | `/week` | 7日一覧。たんぱく源リボン表示 |
| 4 | 献立詳細 | `/recipes/[id]` | 材料・手順・評価 |
| 5 | 栄養サマリ | `/nutrition` | 食品群レーダー＋週次目標 |
| 6 | 買い物リスト | `/shopping` | 売り場順・チェック同期 |
| 7 | リクエスト | `/request` | 自由文＋条件タグ |
| 8 | レシピ管理 | `/recipes` | 一覧・AI生成・承認 |
| 9 | 設定 | `/settings` | 世帯・食の条件・献立方針 |

下部タブバーは 今日 / 週間 / 栄養 / 買い物 / レシピ の5つ。リクエストと設定は週間画面と設定アイコンから遷移する。

### 5.2 各画面の要件

#### 1. ログイン
- メール・パスワード入力、ログインボタンのみ
- 「このアプリは招待された2名のみが利用できます」の説明文を表示
- 認証失敗時は「メールアドレスまたはパスワードが違います」と表示（どちらが誤りかは示さない）

#### 2. 今日の献立（トップ）
- 当日の主菜・副菜・汁物を表示。各品タップで詳細へ
- 主菜のたんぱく源をドット＋ラベルで表示
- 「明日の下ごしらえ」カード（翌日の主菜と準備メモ）
- 「未購入 N 品」のサマリカード → 買い物リストへ
- 当日が `eatout` / `leftover` の場合はその旨を表示し、レシピは出さない
- 確定済みプランが存在しない場合は「今週の献立を作る」ボタンを中央に表示

#### 3. 週間献立
- 上部に7分割のたんぱく源リボン（signature要素）
- 各日カード：左端4pxの色スパイン、日付、カテゴリ・調理時間タグ、主菜名、副菜・汁物
- `locked` の日は 🔒 を表示
- タップで詳細、長押し（PCは右クリック）で「この日を差し替え」
- 下部に「週を再生成」「この内容で確定」

#### 4. 献立詳細
- ヘッダ：日付・品種・料理名・カテゴリ／時間／人数／出典タグ
- 材料（世帯人数に換算した分量）
- 手順（連番付き）
- 調理メモ
- ★評価（1〜3、タップで変更）
- 「レシピを編集」「もう作らない」「この日を差し替え」
- 戻るボタンは遷移元へ戻る

#### 5. 栄養サマリ
- 6軸レーダーチャート（SVG、食品群カバレッジ）
- 和洋中の配分を横積みバーで表示
- 週次目標の達成状況リスト（達成＝緑、未達＝赤）
- 未達項目は次回生成時に優先される旨の説明

#### 6. 買い物リスト
- `shop_category` 順にグルーピング、区切り線付き見出し
- チェックボックス、購入者バッジ（誰がチェックしたか）
- Supabase Realtime で2端末間を即時同期
- `is_pantry` の食材と、設定で除外された調味料は表示しない

#### 7. リクエスト
- 自由文テキストエリア
- よく使う条件のチップ（魚を多めに／揚げ物なし／時短week／作りおき多め など）
- 曜日ごとの調理時間設定の表示
- 「この日は自炊しない」の指定
- 「この条件で週を組み直す」ボタン
- 自由文はAIでタグ変換し、**変換結果を確認画面で提示してから**組み直す

#### 8. レシピ管理
- 品名入力＋「AIでレシピを生成」
- 承認待ち（`draft`）を最上部に強調表示。「内容を確認」「承認して使う」
- 登録済み一覧：たんぱく源色のアイコン、料理名、カテゴリ／品種／時間／★
- タップで詳細へ

#### 9. 設定
- 世帯：人数、メンバー、新規メンバー追加＝停止中（変更不可の表示）
- 食の条件：アレルギー、苦手な食材、もう作らない料理の一覧
- 献立の方針：同じ主菜を空ける日数、和洋中比率、調味料の買い物リスト表示、週の自動生成スケジュール

### 5.4 画面遷移

```
ログイン ─→ 今日の献立（起動時のトップ）
                │
   ┌────────────┼──────────────┬───────────┬──────────┐
   ↓            ↓              ↓           ↓          ↓
 週間献立     栄養サマリ     買い物リスト  レシピ管理   設定
   │                                        │      （週間画面の歯車から）
   ├─→ リクエスト ─→ 変換確認 ─→ 週間献立へ戻る
   │
   └────────────┬───────────────────────────┘
                ↓
            献立詳細 ── 戻る ──→ 遷移元の画面へ
```

**献立詳細は、今日の献立の各品・明日の下ごしらえカード・週間の各日カード・レシピ一覧の各行のすべてからタップで到達できること。** 戻る操作は遷移元へ返す（ブラウザバックに依存せず、遷移元を保持する）。

### 5.5 文言規約

言葉はUIの一部として設計する。以下を守ること。

- 敬体（です・ます）、簡潔に。感嘆符は使わない
- ボタンは「何が起きるか」を動詞で書く。「送信」ではなく「この内容で確定」
- 同じ操作は最初から最後まで同じ言葉で呼ぶ。「確定」ボタンを押したら「確定しました」と返す
- エラーは謝らない。何が起きたか、どうすればよいかを書く
- 空状態は次の行動を示す。「データがありません」で終わらせない

| 場面 | 良い文言 | 避ける文言 |
|---|---|---|
| プラン未作成 | 今週の献立はまだありません。作成すると7日分がまとめて決まります。 | データがありません |
| レシピ不足 | 主菜が7件しかありません。あと3件登録すると献立を作れます。 | エラーが発生しました |
| AI生成失敗 | レシピを作れませんでした。品名を具体的にするか、時間を置いて試してください。 | 申し訳ございません。エラーです |
| 買い物完了 | 全部買えました | おめでとうございます！ |
| ログイン失敗 | メールアドレスまたはパスワードが違います | パスワードが間違っています |

### 5.6 デザイントークン

```css
--paper:#F1F3EE;   /* 背景 */
--card:#FFFFFF;
--ink:#171C1A;     /* 本文 */
--ink-2:#5A635F;
--ink-3:#909791;
--line:#DEE2D9;
--ai:#2C4A54;      /* 主色：藍の器 */
--ai-soft:#E7EDEE;
--yuzu:#C08A24;    /* 差し色 */

/* たんぱく源 */
--meat:#A85751;
--fish:#3F7391;
--egg:#C08A24;
--soy:#6E8B5A;

--radius:14px;
```

書体：見出し `Shippori Mincho B1` / 本文 `Zen Kaku Gothic New` / 数値・ラベル `Roboto Mono`

---

## 6. API設計

すべて `app/api/**/route.ts` の Route Handler。認証必須。

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/plans/current` | 直近の確定プラン（なければdraft）を取得 |
| POST | `/api/plans/generate` | 週間献立を生成。body: `{ weekStart, requestId? }` |
| POST | `/api/plans/[id]/confirm` | 確定し、買い物リストを生成 |
| POST | `/api/plans/[id]/items/[itemId]/reroll` | 1日分（または1品）を差し替え |
| PATCH | `/api/plans/[id]/items/[itemId]` | 手動編集（レシピ変更・entry_type変更） |
| GET | `/api/plans/[id]/nutrition` | 食品群カバレッジと週次目標の判定結果 |
| GET | `/api/shopping/[planId]` | 買い物リスト取得 |
| PATCH | `/api/shopping/items/[id]` | チェック状態の更新 |
| GET | `/api/recipes` | 一覧（status・dish_typeでフィルタ） |
| POST | `/api/recipes` | 手動作成 |
| PATCH | `/api/recipes/[id]` | 編集 |
| POST | `/api/recipes/[id]/approve` | draft → active |
| POST | `/api/recipes/[id]/archive` | 「もう作らない」 |
| PUT | `/api/recipes/[id]/rating` | ★評価 |
| POST | `/api/recipes/generate` | **AI生成**。body: `{ name, dishType? }` → draft保存 |
| POST | `/api/requests/parse` | **AI変換**。自由文 → タグJSON |
| GET/PATCH | `/api/settings` | 世帯設定 |

---

## 7. 献立生成アルゴリズム

### 7.1 週次制約（ハード制約）

生成結果は以下をすべて満たすこと。満たせない場合は再試行し、10回試行しても不可なら緩和した上でその旨を返す。

| 制約 | 内容 |
|---|---|
| 魚 | 主菜で週2回以上 |
| 大豆製品 | 主菜または副菜で週2回以上 |
| 緑黄色野菜 | 全日で1品以上（食品群3を含む品が毎日ある） |
| 揚げ物 | 2日連続禁止 |
| 同一主菜 | 直近 `repeat_gap_days`（既定14日）以内の再登場禁止 |
| 同カテゴリ | 3日連続禁止 |
| アレルギー | 該当食材を含むレシピを完全除外 |
| 調理時間 | 曜日別上限を超えない |

### 7.2 スコアリング（ソフト制約）

```
generateWeek(household, weekStart, request):

  // 1. 固定枠の配置
  days = 月〜日の7日
  for each fixedRequest in request.fixedDays:
      assign(day, recipe) ; item.locked = true
  for each noCookDay in request.noCookDays:
      assign(day, entry_type) ; skip generation

  // 2. 候補プールの構築
  pool = recipes
      .where(status = 'active')
      .where(household_id = household.id)
      .exclude(アレルギー・苦手食材を含む)
      .exclude(直近 repeat_gap_days 以内に使用)

  if pool.mains.length < 10:
      → AIレシピ生成を促すエラーを返す（不足件数を明示）

  // 3. 主菜の決定（未確定の日を順に処理）
  for each openDay in days:
      for each candidate in pool.mains:
          score = 0

          // たんぱく源ローテーション（最重要）
          目標配分 = { meat:3, fish:2, egg:1, soy:1 }
          残り必要数 = 目標配分[candidate.main_protein] - 既配置数
          if 残り必要数 > 0:  score += 30 + 残り必要数 * 5
          else:               score -= 25

          // 連続性の回避
          if candidate.category == 前日.category:  score -= 20
          if candidate.method   == 前日.method:    score -= 15
          if candidate.method == 'fry' and 前日.method == 'fry': score = -Infinity

          // 曜日別の調理時間
          上限 = 平日 ? weekday_max_minutes : weekend_max_minutes
          if candidate.cook_time_min <= 上限:  score += 20
          else:                                score = -Infinity

          // 嗜好の反映
          score += avgRating(candidate) * 5        // ★1〜3 → 5〜15

          // 食材の使い切り
          共通食材数 = 前後2日以内の献立との食材重複数
          score += min(共通食材数, 3) * 10

          // リクエストタグ（例：魚を多めに → fish に +15）
          score += requestBonus(candidate, request.tags)

          // 単調化の防止
          score += random(0, 10)

      選択 = argmax(score)

  // 4. 副菜・汁物の決定
  for each day:
      不足群 = [1..6] - 主菜.food_groups
      副菜 = 不足群を最も多く埋める side を選択（同スコアなら調理時間が短い方）
      汁物 = 残る不足群を埋める soup を選択

  // 5. 週次ハード制約の検証
  violations = validateWeek(plan)
  if violations.length > 0 and attempts < 10:
      違反に関わる日をアンロックして 3 から再実行
  return plan
```

### 7.3 1日差し替え（reroll）

対象日の主菜のみを再抽選する。前後日との関係は維持したまま、7.2 のスコアリングを対象日に限定して適用し、**現在のレシピを候補から除外**する。副菜・汁物は主菜の食品群に応じて再計算する。

---

## 8. AIレシピ生成

### 8.1 エンドポイント

`POST /api/recipes/generate` — body: `{ name: string, dishType?: DishType }`

### 8.2 システムプロンプト

```
あなたは日本の家庭料理に精通した管理栄養士です。
指定された料理名について、家庭で再現可能なレシピをJSONで出力してください。

制約:
- 分量は2人分。単位はグラム・ミリリットル・大さじ・小さじ・個・本・束・丁を使う
- 手順は3〜6ステップ。1ステップは60文字以内
- 特別な調理器具を必要としない
- food_groups は以下から該当するものをすべて挙げる
  1=魚肉卵大豆 2=乳製品海藻小魚 3=緑黄色野菜 4=淡色野菜果物 5=穀類いも 6=油脂
- shop_category は produce/meat/seafood/tofu/dairy_egg/dry/seasoning/other から選ぶ
- memo には調理のコツか保存性に関する助言を1文入れる

出力はJSONオブジェクトのみ。前置き・説明・マークダウンのコードフェンスを一切含めない。
```

### 8.3 出力スキーマ

```json
{
  "name": "鶏むね肉の甘酢炒め",
  "category": "chuka",
  "dish_type": "main",
  "main_protein": "meat",
  "method": "stirfry",
  "cook_time_min": 15,
  "servings": 2,
  "food_groups": [1, 3, 4, 6],
  "tags": ["時短"],
  "ingredients": [
    { "name": "鶏むね肉", "qty": 250, "unit": "g", "shop_category": "meat" },
    { "name": "玉ねぎ", "qty": 0.5, "unit": "個", "shop_category": "produce" }
  ],
  "steps": [
    "鶏むね肉をひと口大のそぎ切りにし、片栗粉をまぶす。",
    "フライパンで鶏肉を両面焼き、玉ねぎとピーマンを加えて炒める。",
    "合わせた調味料を回し入れ、とろみがつくまで絡める。"
  ],
  "memo": "片栗粉をまぶすとむね肉でもぱさつきません。"
}
```

### 8.4 サーバ側の処理

1. Claude API を呼び出す（`max_tokens: 2000`）
2. レスポンスから ```` ``` ```` を除去し `JSON.parse`
3. Zod でスキーマ検証。失敗時は1回だけ再試行し、なお失敗ならエラーを返す
4. `source='ai'`, `status='draft'` で `recipes` と `recipe_ingredients` に保存
5. 各材料名を `ingredient_master` と照合し、未登録なら追加する
6. 生成したレシピIDを返す

**AIの出力を直接 `active` にしてはならない。** 分量ミスを人が止める工程を必ず経由させる。

### 8.5 自由文のタグ変換

`POST /api/requests/parse` — 自由文を以下の構造に変換する。

```json
{
  "fixedDays": [{ "weekday": "fri", "dishName": "カレー" }],
  "timeConstraints": [{ "weekday": "wed", "maxMinutes": 20 }],
  "useUpIngredients": ["なす"],
  "preferProteins": ["fish"],
  "avoidMethods": ["fry"],
  "noCookDays": []
}
```

変換結果は必ずUIに提示し、ユーザーの確認を経てから生成を実行する。

---

## 9. 買い物リスト生成

プラン確定時（`POST /api/plans/[id]/confirm`）に実行する。

```
buildShoppingList(plan):
  items = []
  for each meal_plan_item where entry_type = 'cook':
      recipe = item.recipe
      倍率 = household.servings / recipe.servings
      for each ing in recipe.ingredients:
          正規名 = resolveAlias(ing.name)          // ingredient_master で名寄せ
          if isPantry(正規名): continue
          if not include_seasoning and ing.shop_category = 'seasoning': continue
          items.push({ 正規名, ing.qty * 倍率, ing.unit, ing.shop_category })

  // 同一食材・同一単位を合算
  merged = groupBy(items, [正規名, unit]).map(sum)

  // 単位が異なる場合は合算せず別行にする（例：にんにく 1片 / 小さじ1）
  sort by shop_category の定義順, then 名前
  insert into shopping_items
```

チェック状態は Supabase Realtime の `postgres_changes` で購読し、2端末間で即時同期する。

---

## 10. 栄養評価ロジック

```
evaluateWeek(plan):
  coverage = {}
  for g in 1..6:
      該当日数 = plan の日のうち、いずれかの品が food_groups に g を含む日数
      coverage[g] = 該当日数 / 7

  goals = [
    { key:'fish',    label:'魚を週2回以上',       actual: 主菜がfishの日数,     target: 2 },
    { key:'soy',     label:'大豆製品を週2回以上', actual: soyを含む品がある日数, target: 2 },
    { key:'veg',     label:'緑黄色野菜を毎日',    actual: 食品群3を含む日数,     target: 7 },
    { key:'fry',     label:'揚げ物の連日なし',    actual: 連続日数 == 0,        target: true },
    { key:'dairy',   label:'乳製品を週3回以上',   actual: 食品群2を含む日数,     target: 3 }
  ]

  未達の goal は次回生成時に requestBonus として +20 を加算する
```

レーダーチャートは coverage を0〜1で6軸にプロットする。

---

## 11. 初期データ

### 11.1 レシピ20件のシード

`scripts/seed-recipes.ts` を用意し、以下の20品を第8章のプロンプトで AI 生成させる。生成後は `status='active'` で投入してよい（初期構築時のみの例外。生成結果は依頼者が目視確認する）。

**主菜12件**

| # | 品名 | カテゴリ | たんぱく源 |
|---|---|---|---|
| 1 | 鶏むね肉の甘酢炒め | 中 | 肉 |
| 2 | 豚肉と夏野菜の生姜焼き | 和 | 肉 |
| 3 | 鶏の照り焼き | 和 | 肉 |
| 4 | なすとひき肉のキーマカレー | 洋 | 肉 |
| 5 | 鶏肉のトマト煮込み | 洋 | 肉 |
| 6 | 鮭のちゃんちゃん焼き | 和 | 魚 |
| 7 | あじの南蛮漬け | 和 | 魚 |
| 8 | ぶりの照り焼き | 和 | 魚 |
| 9 | 白身魚のムニエル | 洋 | 魚 |
| 10 | 麻婆豆腐 | 中 | 大豆 |
| 11 | 厚揚げと豚肉の味噌炒め | 中 | 大豆 |
| 12 | だし巻き卵と鶏そぼろ丼 | 和 | 卵 |

**副菜5件** — 小松菜とにんじんのおひたし／ほうれん草の白和え／ブロッコリーのごま和え／きゅうりとわかめの酢の物／もやしのナムル

**汁物3件** — 豆腐とわかめの味噌汁／大根と油揚げの味噌汁／卵とトマトの中華スープ

配分の根拠：主菜12件は「同じ主菜を14日空ける」制約を満たす最小構成である。たんぱく源は 肉5・魚4・大豆2・卵1、カテゴリは 和6・洋3・中3 となり、週次目標（魚2回・大豆2回）を無理なく満たせる。運用開始後はユーザーが随時追加していく前提。

### 11.2 ingredient_master

シードレシピの材料から自動生成し、`shop_category` を付与する。調味料（醤油・味噌・砂糖・塩・油・酒・みりん・酢・片栗粉など）は `is_pantry = true` とする。

---

## 12. 実装フェーズ

Claude Code への指示は以下の単位で分割する。各フェーズ完了時に動作確認を行ってから次へ進む。

### Phase 0 — 基盤構築
- Next.js 15 + TypeScript + Tailwind v4 の初期化
- Supabase プロジェクト接続、`@supabase/ssr` のセットアップ
- デザイントークンを CSS 変数として定義、フォント読み込み
- **完了条件** ローカルで空のトップページが表示される

### Phase 1 — 認証とスキーマ
- 3.2 の DDL をマイグレーションとして適用
- 3.3 の RLS ポリシーを全テーブルに適用
- ログイン画面、ミドルウェアによる保護
- 手動で2アカウントと1世帯を作成
- **完了条件** 一方のユーザーで他方の世帯データが取得できないことを確認

### Phase 2 — レシピ管理
- レシピ一覧・詳細・編集画面
- `POST /api/recipes/generate`（Claude API + Zod検証）
- draft の承認フロー
- ★評価、アーカイブ
- **完了条件** 品名を入力してAI生成し、承認して一覧に載るまでが通る

### Phase 3 — 献立生成
- 7.2 のアルゴリズム実装（`lib/planner/` に切り出し、純粋関数として単体テスト可能にする）
- 週間献立画面（たんぱく源リボン含む）
- 1日差し替え、手動編集
- **完了条件** 20件のシードから7日分が生成され、7.1 のハード制約を全て満たす

### Phase 4 — 買い物リスト
- 確定時の自動生成、同一食材の合算
- 売り場順表示、チェック機能
- Realtime 同期
- **完了条件** 2つのブラウザで開き、片方のチェックが即座にもう片方へ反映される

### Phase 5 — 栄養サマリ
- 10章の評価ロジック
- SVGレーダーチャート、和洋中バー、週次目標リスト
- 未達項目の次回生成への反映
- **完了条件** 意図的に魚を減らした献立で未達判定が出る

### Phase 6 — リクエスト
- リクエスト入力画面、条件チップ
- `POST /api/requests/parse`（AI変換）と確認UI
- 固定枠を維持したままの再生成
- **完了条件** 「金曜はカレー」を指定して再生成しても金曜が変わらない

### Phase 7 — 仕上げ
- 今日の献立画面、明日の下ごしらえ
- 設定画面
- 空状態・エラー状態のメッセージ整備
- レスポンシブ確認、フォーカス可視、reduced-motion 対応
- **完了条件** スマートフォン実機で一連の操作が完結する

---

## 13. 単体テスト方針

献立生成アルゴリズムのみテストを書く。UIのテストは不要。

```
lib/planner/__tests__/
  - ハード制約が全て満たされること
  - アレルギー食材が完全に除外されること
  - locked な日が再生成で変化しないこと
  - 候補が不足した場合に適切なエラーを返すこと
  - 同一シードで同一結果になること（random にシードを渡せる設計にする）
```

---

## 15. 最終チェックリスト

全フェーズ完了時に、以下をすべて確認してから完了報告すること。

**セキュリティ**
- [ ] サインアップの画面・API・導線がコード上に存在しない
- [ ] Supabase 側で Signup が OFF になっている
- [ ] 全テーブルで RLS が有効かつポリシーが設定されている
- [ ] 4.5 の第三者アクセス検証で0件が返ることを確認した
- [ ] `ANTHROPIC_API_KEY` がクライアントバンドルに含まれていない（ビルド成果物を検索して確認）
- [ ] Service Role Key がアプリコードに存在しない

**機能**
- [ ] 20件のシードから7日分が生成され、7.1 のハード制約を全て満たす
- [ ] 献立生成に Claude API が使われていない
- [ ] AI生成レシピが承認前に献立へ使われない
- [ ] 買い物リストで同一食材が合算される
- [ ] 2端末で買い物リストのチェックが即時同期する
- [ ] リクエストで固定した日が再生成後も変わらない
- [ ] 献立詳細に4経路すべてから到達でき、戻ると遷移元に返る

**品質**
- [ ] `lib/planner/` の単体テストが全て通る
- [ ] TypeScript の型エラー・`any` が残っていない
- [ ] スマートフォン幅（375px）で全画面が破綻しない
- [ ] キーボードフォーカスが視認できる
- [ ] 空状態・エラー状態の文言が 5.5 の規約に沿っている

---

## 16. 用語集

| 用語 | 意味 |
|---|---|
| プラン | 1週間分の献立（月曜始まり） |
| スロット | 1日の中の主菜／副菜／汁物の枠 |
| ロック | リクエストで固定され、再生成でも変わらない状態 |
| ドラフト | AI生成直後の未承認レシピ |
| 常備品（pantry） | 買い物リストに出さない食材 |
| カバレッジ | 週7日のうち、その食品群を含む日の割合 |

---

## 付録 A — 参照ファイル

- `docs/kondate-wireframe.html` — 全9画面のインタラクティブモック。配色・書体・余白・遷移の実装基準とすること。ブラウザで開いて実際に操作し、画面ごとの情報量と階層を確認してから実装に入る

モックが手元にない場合は、5.6 のデザイントークンと各画面の要件（5.2）から構成すること。その際も以下の3点は必ず守る。

1. 週間画面上部の**たんぱく源リボン**（7分割の色帯）を実装する。本アプリの識別要素であり、栄養ルールの中核を視覚化したもの
2. 各日カードの左端に4pxの色スパインを置き、リボンと同じ配色で対応させる
3. 見出しは明朝体、数値・日付は等幅フォントで組む。3書体の役割分担が情報の性質を伝える

---

## 付録 B — 変更履歴

| バージョン | 日付 | 内容 |
|---|---|---|
| 1.0 | 2026-08-16 | 初版 |
