# 献立 / Kondate

週間の夕食献立（主菜・副菜・汁物）を自動で組み、売り場順の買い物リストを用意するツールです。
招待済みの 2 名のみが利用します。新規登録は受け付けません。

仕様書は [`docs/kondate-spec.md`](docs/kondate-spec.md)、画面モックは
[`docs/kondate-wireframe.html`](docs/kondate-wireframe.html) にあります。実装前に通読してください。

**仕様書 v1.0 からの変更点は [`docs/kondate-spec-amendment.md`](docs/kondate-spec-amendment.md)
にまとめています。** ホスティングを Vercel から GitHub Pages（静的配信）へ移したため、
サーバ側のコード（Route Handler・ミドルウェア）を持ちません。仕様書本体と食い違う箇所は
変更記録の方が新しいものとして扱ってください。

公開先： https://siorine21.github.io/kondate/

## 技術スタック

| レイヤ | 採用技術 |
| --- | --- |
| フレームワーク | Next.js 15 (App Router) / `output: "export"` による静的書き出し |
| 言語 | TypeScript (strict) |
| スタイル | Tailwind CSS v4 |
| DB / 認証 | Supabase (PostgreSQL + Auth + Realtime) |
| ホスティング | GitHub Pages（GitHub Actions で配信） |
| AI | 当面不使用（変更記録 3.4） |

週間献立の生成に AI は使いません。DB 上のレシピから、決定論的な
スコアリングで組みます（仕様書 1.3 / 7 章）。

## この構成での防壁は RLS だけです

サーバを持たないため、ブラウザが直接 Supabase を叩きます。
ANON KEY はブラウザに必ず露出します。**世帯外のデータを遮断しているのは
RLS のみです**（仕様書 3.3）。

- テーブルを追加したら、RLS の有効化とポリシー設定を必ずセットで行う
- SERVICE ROLE KEY はアプリコードで使わない。マイグレーション時のみ（2.2-3）
- `app/(app)/layout.tsx` のログイン判定は「見せない」ための措置であり、防壁ではない

## 開発環境の準備

```bash
npm install
cp .env.local.example .env.local   # 値を埋める
npm run dev                        # http://localhost:3000/kondate/
```

`basePath` を `/kondate` にしているため、開発時も `/kondate/` 配下で開きます。

### 環境変数

| 変数 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクトの URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ANON KEY。ブラウザに露出する前提 |

どちらも秘密ではありませんが、リポジトリにはコミットせず GitHub Secrets に置きます。

## スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバ |
| `npm run build` | 静的書き出し（`out/` に生成） |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | 献立生成の単体テスト（仕様書 13 章） |
| `npm run db:migrate` | マイグレーション適用（`supabase/README.md` 参照） |
| `npm run db:seed` | シードレシピ20件の投入（仕様書 11.1） |
| `npm run verify:rls` | RLS の検証 |

## ディレクトリ

```
app/
  manifest.ts     ホーム画面に置くための宣言
  (auth)/login/   ログイン画面
  (auth)/reset/   パスワードの再設定（メールのリンクから）
  (app)/          ログイン後の画面。layout.tsx が未ログインを弾く
  (app)/settings/ 設定（世帯・献立の方針・食の条件・アカウント）
  (app)/week/     週間献立（生成・差し替え・手動編集・確定）
  (app)/shopping/ 買い物リスト（売り場順・チェック・2端末の同期）
  globals.css     デザイントークン（仕様書 5.6）
lib/
  supabase/       クライアント生成と型
  labels.ts       ENUM の日本語表示
  planner/        献立生成。純粋関数のみ。Supabase を import しない
    __tests__/    npm test で走る。外部ライブラリを使わず node:test で動かす
docs/             仕様書・画面モック・変更記録
supabase/         マイグレーションと運用 SQL
public/           アイコン・Service Worker
scripts/          DB 操作と検証のスクリプト
.github/workflows/pages.yml   配信ワークフロー
```

## 実装フェーズ

仕様書 12 章の 8 フェーズで進めます。**一度に全フェーズを実装しません。**
各フェーズの完了条件を満たした時点で作業を止め、報告してから次へ進みます。

- [x] Phase 0 — 基盤構築
- [x] Phase 1 — 認証とスキーマ
- [x] Phase 2 — レシピ管理（完了条件は変更記録 2 章のとおり手入力に変更）
- [x] Phase 3 — 献立生成
- [x] Phase 4 — 買い物リスト
- [ ] Phase 5 — 栄養サマリ
- [ ] Phase 6 — リクエスト
- [ ] Phase 7 — 仕上げ

## GitHub Pages への配信

`.github/workflows/pages.yml` が push を受けて自動で配信します。
初回だけ、リポジトリ側で 2 つ設定してください。

### 1. Secrets を登録する

**Settings → Secrets and variables → Actions → New repository secret**

| 名前 | 値 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` と同じ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` と同じ |

未設定のままだと配信は止まります。ワークフローが、**Secrets が空でないこと**と、
**そのプロジェクト固有のホスト名と ANON KEY が `out/` に実際に埋め込まれたこと**を
検査しているためです。

> 最初はここを `grep "supabase.co"` で済ませていましたが、**この検査は無意味でした。**
> supabase-js のバンドルにこの文字列が元から含まれており、Secrets 未設定でも
> 素通りします。実際に初回の実行が通ってしまい、気づきました。
> 検査は「通ること」ではなく「落ちるべきときに落ちること」を確かめないと意味がありません。

### 2. Pages を有効にする

ワークフローの `configure-pages` に `enablement: true` を付けているので、
**通常は自動で有効になります。** 権限の都合で失敗した場合だけ、手動で
**Settings → Pages → Build and deployment → Source** を
**「GitHub Actions」** にしてください。「Deploy from a branch」ではありません。

### 配信の仕組み

1. 対象ブランチへ push
2. Actions が `npm ci` → `typecheck` → `lint` → `build` を実行
3. 型か Lint が通らなければ配信しない
4. 接続先と ANON KEY が `out/` に埋め込まれたかを検査
5. `actions/deploy-pages` が公開

`public/.nojekyll` は Jekyll による `_next/` の除外を止めるために必要です。
消さないでください。

### 2人目のアカウントを世帯に紐付ける

**紐付けが無い利用者には、レシピが1件も見えません。** `profiles` に行が無いと
`current_household_id()` が空になり、RLS が全テーブルで0行を返すためです
（仕様書 3.3）。画面上は「レシピがない」と区別がつかないので、アプリ側でも
「まだ世帯に紐付いていません」と出すようにしてあります。

Supabase の SQL Editor で
[`supabase/setup/05_add_member.sql`](supabase/setup/05_add_member.sql) を実行してください。
`WIFE_EMAIL_HERE` を書き換える1箇所だけです。

### 買い物リストの同期を有効にする

チェックを2端末で同期するには、`shopping_items` を Realtime の配信対象に
入れる必要があります。入れないと、片方でチェックしても相手の画面は変わりません。

Supabase の SQL Editor で
[`supabase/setup/08_enable_realtime.sql`](supabase/setup/08_enable_realtime.sql)
を実行してください。書き換える箇所はありません。

### パスワード再設定のための設定

Supabase の **Authentication → URL Configuration → Redirect URLs** に
次を追加してください。追加しないと、再設定メールのリンクを開いても
パスワードを決め直す画面に戻ってきません。

```
https://siorine21.github.io/kondate/reset/
```

### 配信後に確認すること

- `/kondate/` を開くと `/kondate/login/` に移動する
- ログインすると献立画面が表示される
- ログアウト後に `/kondate/recipes/` を直接開くとログイン画面に戻る
- 設定（トップ右上の歯車）が開き、世帯の値が保存できる
- ホーム画面に追加すると、アドレスバーのないアプリとして開く

## リポジトリを public にしている理由

無料アカウントの GitHub Pages は private リポジトリを配信できません。
このため public のままにしています。

秘密情報は一切コミットしていません（`.env.local` は追跡外。全履歴を走査して確認済み）。
公開されるのは画面のコードと仕様書で、世帯のデータは Supabase 側にあり RLS が守ります。

## 任意：Cloudflare Access による多重防御

仕様書 4.6。実装は不要ですが、独自ドメインを当てる場合は前段に
Cloudflare Access を置けます。RLS の代わりではなく、その手前にもう一枚
追加する位置づけです。GitHub Pages の `*.github.io` を直接塞ぐことはできないため、
この構成では効果が限定的です。
