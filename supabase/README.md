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
