# 献立 / Kondate

週間の夕食献立（主菜・副菜・汁物）を自動で組み、売り場順の買い物リストを用意するツールです。
招待済みの 2 名のみが利用します。新規登録は受け付けません。

仕様書は [`docs/kondate-spec.md`](docs/kondate-spec.md)、画面モックは
[`docs/kondate-wireframe.html`](docs/kondate-wireframe.html) にあります。実装前に通読してください。

## 技術スタック

| レイヤ | 採用技術 |
| --- | --- |
| フレームワーク | Next.js 15 (App Router) |
| 言語 | TypeScript (strict) |
| スタイル | Tailwind CSS v4 |
| DB / 認証 | Supabase (PostgreSQL + Auth + Realtime) |
| AI | Anthropic Claude API（レシピ生成と自由文のタグ変換のみ） |
| ホスティング | Vercel |

週間献立の生成に AI は使いません。DB 上の承認済みレシピから、決定論的な
スコアリングで組みます（仕様書 1.3 / 7 章）。

## 開発環境の準備

```bash
npm install
cp .env.local.example .env.local   # 値を埋める
npm run dev                        # http://localhost:3000
```

### 環境変数

| 変数 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクトの URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ANON KEY。ブラウザに露出する前提 |
| `ANTHROPIC_API_KEY` | サーバ専用。`NEXT_PUBLIC_` を付けない |

ANON KEY はブラウザに必ず露出します。世帯外のデータを遮断するのは RLS だけです。
テーブルを追加したら、必ず RLS の有効化とポリシーの設定をセットで行ってください（仕様書 3.3）。

SERVICE ROLE KEY はアプリコードで使いません。マイグレーション時のみ使用します。

## スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバ |
| `npm run build` | 本番ビルド |
| `npm start` | 本番サーバ |
| `npm run lint` | ESLint |

## ディレクトリ

```
app/            画面と Route Handler
  (app)/        認証後の画面
  globals.css   デザイントークン（仕様書 5.6）
components/     UI 部品
lib/
  supabase/     クライアント生成
  planner/      献立生成。純粋関数のみ。Supabase を import しない
docs/           仕様書と画面モック
supabase/       マイグレーション
```

## 実装フェーズ

仕様書 12 章の 8 フェーズで進めます。**一度に全フェーズを実装しません。**
各フェーズの完了条件を満たした時点で作業を止め、報告してから次へ進みます。

- [x] Phase 0 — 基盤構築
- [x] Phase 1 — 認証とスキーマ
- [ ] Phase 2 — レシピ管理
- [ ] Phase 3 — 献立生成
- [ ] Phase 4 — 買い物リスト
- [ ] Phase 5 — 栄養サマリ
- [ ] Phase 6 — リクエスト
- [ ] Phase 7 — 仕上げ

## Vercel へのデプロイ

仕様書 2 章のホスティング指定に従い Vercel へ配信します。

### 1. プロジェクトを作る

1. [vercel.com](https://vercel.com) に GitHub アカウントでログイン
2. **Add New → Project** から `siorine21/kondate` を選ぶ
3. Framework は **Next.js** が自動検出されるのでそのまま

### 2. 環境変数を登録する

**Environment Variables** に 3 つ登録します。Production / Preview /
Development のすべてにチェックを入れてください。

| 変数 | Sensitive | 値 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 不可 | `.env.local` と同じ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 不可 | `.env.local` と同じ |
| `ANTHROPIC_API_KEY` | **必ず有効にする** | サーバ専用。`NEXT_PUBLIC_` を付けない（2.2-2） |

`ANTHROPIC_API_KEY` が未設定でもビルドは通ります。その状態では
レシピ生成だけが 503 を返し、他の画面は動きます。

#### `ANTHROPIC_API_KEY` は必ず Sensitive にする

2026 年 4 月の Vercel の侵害では、第三者ツール経由で OAuth トークンが
奪われ、**Sensitive 指定されていない環境変数が列挙・復号されました。**
Sensitive 指定されたものは侵害されていません。これが実際に持ちこたえた
唯一の制御なので、必ず有効にしてください。

`NEXT_PUBLIC_*` の 2 つは Sensitive にできません（ビルド時にクライアントへ
埋め込むため）。ただし、どちらももともとブラウザに露出する前提の値です。
世帯のデータを守っているのは RLS であって、これらのキーではありません（3.3）。

**この構成で同じ侵害が起きた場合、実害が及ぶのは `ANTHROPIC_API_KEY`
だけです。** service_role キーをアプリコードで使わないという仕様書 2.2-3 の
禁止事項が、被害範囲をここまで限定しています。使っていたら、同じ侵害で
全世帯のデータが RLS を素通りして抜かれていました。

あわせて次の 2 つも行ってください。

- **Anthropic 側で使用上限を設ける。** 漏れた場合の損害額が頭打ちになります
- **GitHub App のインストール範囲をこのリポジトリだけに絞る。**
  `All repositories` ではなく `Only select repositories` を選ぶ

なお、このリポジトリには秘密情報を一切コミットしていません
（`.env.local` は追跡外。全履歴を走査して確認済み）。

### 3. 本番ブランチを指定する

**Settings → Git → Production Branch** を、作業中のブランチ名に変更します。
`main` を作った場合はそちらを指定してください。

### 4. 配信リージョン

`vercel.json` で `hnd1`（東京）に固定しています。Supabase を
`ap-northeast-1` に置いているため、DB との往復が国内で閉じます。
仕様書 2.1 の「週間献立の生成は 2 秒以内」はこの前提で成立します。

### 5. デプロイ後に確認すること

- `/` を開くと `/login` にリダイレクトされる
- ログインすると `/` が表示される
- `/api/recipes` に未ログインでアクセスすると 401 が返る

## 任意：Cloudflare Access による多重防御

仕様書 4.6。実装は不要ですが、Vercel の前段に Cloudflare Access を置くと、
許可したメールアドレス以外はアプリに到達しなくなります。RLS の代わりではなく、
その手前にもう一枚追加する位置づけです。

1. 独自ドメインを Cloudflare に登録し、ネームサーバを Cloudflare に向ける
2. Vercel 側でそのドメインをプロジェクトに追加し、指示された DNS レコードを
   Cloudflare に登録する（プロキシは有効のまま）
3. Cloudflare Zero Trust → Access → Applications で Self-hosted アプリを追加し、
   対象をそのドメインにする
4. ポリシーを Action = Allow、条件を Emails に 2 名のメールアドレスのみとする
5. 認証方法に One-time PIN（またはメール認証）を設定する
6. Vercel の Deployment Protection で、Cloudflare を経由しない
   `*.vercel.app` の直接アクセスを塞ぐ

設定後、許可外のアドレスでアクセスするとログイン画面にすら到達しないことを確認します。
