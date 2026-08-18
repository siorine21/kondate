# Supabase のセットアップ手順

方法は2つあります。**A のほうが手数が少ないです。**

## A. コマンドで流す（推奨）

Management API 経由で SQL を流す `scripts/db-exec.mjs` を使います。
外部ライブラリは使っていないので `npm install` 以外の準備は要りません。

```bash
# 1. 個人アクセストークンを発行する
#    Supabase → 右上のアカウントメニュー → Access Tokens → Generate new token
export SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxx

# 2. メールアドレスを渡す（SQL 内のプレースホルダを置き換えます）
export KONDATE_USER_EMAIL=あなたのメールアドレス
export KONDATE_TEST_EMAIL=テストユーザーのメールアドレス

# 3. 順に実行する
npm run db:migrate   # スキーマと RLS
npm run db:setup     # 世帯とプロフィール
npm run db:verify    # RLS の検証。結果表が出ます
npm run db:cleanup   # 検証用データの削除
```

プロジェクト ref は `SUPABASE_PROJECT_REF` → 環境変数の URL →
`.env.local` の URL の順に探します。設定を取り違えても別経路で復元できます。

```bash
# 何が実行されるかだけ見る（通信しません）
node scripts/db-exec.mjs supabase/migrations --dry-run

# いまの状態を確認する（テーブル / RLS / ポリシー数）
node scripts/db-exec.mjs --inspect
```

> **個人アクセストークンはアカウント全体の管理者権限を持ちます。**
> service_role キーより強く、全プロジェクトを操作できます。
> 環境変数でのみ渡し、ファイルに保存せず、**用が済んだら失効させてください。**
> アプリコードからは決して読み込まないこと（仕様書 2.2-3 / 4.2）。

> **Claude Code のクラウドセッションから実行する場合**
> Node の組み込み `fetch` は `HTTPS_PROXY` を読まないため、そのままでは
> エグレスプロキシを迂回して「Host not in allowlist」で失敗します。
> `NODE_USE_ENV_PROXY=1` を付けて実行してください（Node 22.21 以降）。
> 手元の PC で実行する場合は不要です。

## A2. RLS の検証だけをアプリと同じ経路で行う

`scripts/verify-rls.mjs` は**管理者権限を一切使いません。**
実際にテストユーザーでログインし、アプリが叩くのと同じ REST API で確かめます。
仕様書 4.5 の「そのユーザーでログインし、`select * from recipes` を実行する」
をそのまま実施するものです。

```bash
npm run db:migrate     # スキーマと RLS（管理者権限が要る）
npm run db:setup       # 世帯とプロフィール（管理者権限が要る）
npm run db:fixtures    # 検証用の下ごしらえ（管理者権限が要る）

export KONDATE_TEST_EMAIL=テストユーザーのメールアドレス
export KONDATE_TEST_PASSWORD=テストユーザーのパスワード
npm run verify:rls     # 検証本体。個人アクセストークン不要

npm run db:cleanup     # 検証用データの削除
```

確認する内容は次の4つです。

| 確認 | 期待 | 何が分かるか |
| --- | --- | --- |
| サインアップ API | Supabase が明示的に拒否 | 画面に導線が無いだけでなく API も塞がっている（2.2-1） |
| 未ログインで全10テーブル | いずれも0件 | RLS が有効で、公開キーだけでは何も取れない |
| テストユーザー → 別世帯のレシピ | 見えない | 世帯をまたいで遮断できている |
| テストユーザー → 自世帯のレシピ | **見える** | ポリシー書き忘れで全員0件になっていない |

最後の1つが重要です。ポリシーを設定し忘れたテーブルは**誰から見ても0件**になり、
一見安全に見えて実際は本人すら読めない壊れた状態です。
「見えない」だけを確認すると、この失敗を見逃します。

## B. SQL Editor に貼る

Supabase 管理画面の **SQL Editor** で、下の表の順に貼って実行します。
`setup/01` と `setup/02` は、実行前にファイル冒頭のメールアドレスを
自分のものに書き換えてください。

| 順 | ファイル | 内容 | 実行回数 |
| --- | --- | --- | --- |
| 1 | `migrations/20260816120000_init_schema.sql` | ENUM とテーブル10件（仕様書 3.1 / 3.2） | 一度だけ |
| 2 | `migrations/20260816120100_rls_policies.sql` | RLS の有効化とポリシー（仕様書 3.3） | 何度でも可 |
| 3 | `setup/01_household.sql` | 世帯とプロフィールの作成（仕様書 4.4） | 何度でも可 |
| 4 | `setup/02_verify_rls.sql` | RLS の検証（仕様書 4.5） | 何度でも可 |
| 5 | `setup/03_cleanup_verify.sql` | 検証用データの削除 | 4 の後に必ず |

どちらの方法でも、UUID を手で写す必要はありません。
メールアドレスから `auth.users` を引く形にしてあります。

## 管理画面側の設定

SQL とは別に、管理画面で以下を設定します（仕様書 4.1）。

- `Authentication` → `Sign In / Providers` → `Email` → **Allow new users to sign up を OFF**
- `Authentication` → `Users` から利用者2名を手動で作成（Auto Confirm User にチェック）

アプリ側にサインアップの画面・API・導線は実装しません（仕様書 2.2-1）。

## RLS についての注意

**テーブルを追加したら、RLS の有効化とポリシーの設定を必ずセットで行ってください。**

ANON KEY はブラウザに必ず露出するため、RLS が唯一の実効的な防壁です。
ポリシーを設定し忘れたテーブルは開発中まったくエラーを出さず、
そのまま全世帯のデータが読める状態になります（仕様書 2.2-4）。

なお SQL Editor は `postgres` ロールで動き、**RLS を素通りします。**
`select * from recipes` が見えることは、RLS が正しい証拠にはなりません。
検証は必ず `setup/02_verify_rls.sql` の方式（JWT クレームの差し替え）で行ってください。
