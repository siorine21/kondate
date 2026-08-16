# Supabase のセットアップ手順

Supabase 管理画面の **SQL Editor** で、上から順に実行します。
`migrations/` は一度だけ、`setup/` は用途に応じて実行します。

| 順 | ファイル | 内容 | 実行回数 |
| --- | --- | --- | --- |
| 1 | `migrations/20260816120000_init_schema.sql` | ENUM とテーブル10件（仕様書 3.1 / 3.2） | 一度だけ |
| 2 | `migrations/20260816120100_rls_policies.sql` | RLS の有効化とポリシー（仕様書 3.3） | 何度でも可 |
| 3 | `setup/01_household.sql` | 世帯とプロフィールの作成（仕様書 4.4） | 何度でも可 |
| 4 | `setup/02_verify_rls.sql` | RLS の検証（仕様書 4.5） | 何度でも可 |
| 5 | `setup/03_cleanup_verify.sql` | 検証用データの削除 | 4 の後に必ず |

`setup/01` と `setup/02` は、実行前にファイル冒頭のメールアドレスを
自分のものに書き換えてください。UUID を手で写す必要はありません。

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
