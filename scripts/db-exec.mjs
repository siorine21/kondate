#!/usr/bin/env node
/**
 * Supabase Management API 経由で SQL ファイルを実行する運用スクリプト。
 *
 *   node scripts/db-exec.mjs <ファイルまたはディレクトリ> [...]
 *
 * ディレクトリを渡すと、その直下の *.sql をファイル名順に実行する。
 *
 * ■ 必要な環境変数
 *   SUPABASE_ACCESS_TOKEN   個人アクセストークン（sbp_ で始まる）
 *   SUPABASE_PROJECT_REF    プロジェクト ref。省略時は .env.local の URL から取る
 *   KONDATE_USER_EMAIL      SQL 内の YOUR_EMAIL_HERE を置き換える
 *   KONDATE_TEST_EMAIL      SQL 内の TEST_EMAIL_HERE を置き換える
 *
 * ■ トークンの取り扱い
 *   個人アクセストークンはアカウント全体の管理者権限を持つ。
 *   このスクリプトは環境変数からしか読まず、ファイルにも引数にも書かない。
 *   アプリコードからは決して読み込まないこと（仕様書 2.2-3 / 4.2）。
 *
 * 外部ライブラリは使わない（Node 18+ の fetch のみ）。
 */

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const API_ORIGIN = "https://api.supabase.com";

/* ---------- 設定の読み取り ---------- */

function refFromUrl(value) {
  if (!value) return null;
  try {
    const host = new URL(value).hostname; // <ref>.supabase.co
    const ref = host.split(".")[0];
    return ref || null;
  } catch {
    return null;
  }
}

/* 識別子は複数の経路から復元する。
   設定ミス（キーと識別子の取り違え、.env.local の置き忘れ）から立ち直れる。 */
async function readProjectRef() {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF;

  const fromEnvUrl =
    refFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) ??
    refFromUrl(process.env.SUPABASE_URL);
  if (fromEnvUrl) return fromEnvUrl;

  try {
    const text = await readFile(path.resolve(".env.local"), "utf8");
    for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"]) {
      const line = text.split("\n").find((l) => l.startsWith(`${key}=`));
      const ref = refFromUrl(line?.slice(key.length + 1).trim());
      if (ref) return ref;
    }
  } catch {
    // .env.local が無い場合は呼び出し側でエラーにする
  }
  return null;
}

/* テーブル・RLS・ポリシーの現況を一覧する（資料 4.3 の inspect 相当）。 */
const INSPECT_SQL = `
select
  c.relname                                        as table_name,
  case when c.relrowsecurity then 'RLS有効' else 'RLS無効' end as rls,
  count(p.polname)                                 as policies
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
group by c.relname, c.relrowsecurity
order by c.relname;
`;

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

/* ---------- SQL ファイルの収集 ---------- */

async function collectSqlFiles(targets) {
  const files = [];
  for (const target of targets) {
    const resolved = path.resolve(target);
    const info = await stat(resolved).catch(() => null);
    if (!info) fail(`見つかりません: ${target}`);

    if (info.isDirectory()) {
      const entries = await readdir(resolved);
      const sqlFiles = entries.filter((e) => e.endsWith(".sql")).sort();
      if (sqlFiles.length === 0) fail(`SQL ファイルがありません: ${target}`);
      for (const name of sqlFiles) files.push(path.join(resolved, name));
    } else {
      files.push(resolved);
    }
  }
  return files;
}

/* ---------- プレースホルダの置換 ---------- */

function quoteSqlLiteral(value) {
  return value.replace(/'/g, "''");
}

function substitutePlaceholders(sql, file) {
  const rules = [
    ["YOUR_EMAIL_HERE", process.env.KONDATE_USER_EMAIL, "KONDATE_USER_EMAIL"],
    ["TEST_EMAIL_HERE", process.env.KONDATE_TEST_EMAIL, "KONDATE_TEST_EMAIL"],
  ];

  let result = sql;
  for (const [placeholder, value, envName] of rules) {
    if (!result.includes(placeholder)) continue;
    if (!value) {
      fail(
        `${path.basename(file)} は ${placeholder} を含みますが、` +
          `環境変数 ${envName} が設定されていません。`,
      );
    }
    result = result.split(placeholder).join(quoteSqlLiteral(value));
  }
  return result;
}

/* ---------- 実行 ---------- */

async function runSql({ origin, ref, token, sql }) {
  const response = await fetch(`${origin}/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      /* 管理 API の前段の WAF が、HTTP クライアント既定の User-Agent を
         弾くことがある。名乗らないと 403 が返り、認証エラーと見分けがつかない。 */
      "User-Agent": "kondate-db-exec",
    },
    body: JSON.stringify({ query: sql }),
  });

  const raw = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  return { ok: response.ok, status: response.status, raw, parsed };
}

/* ---------- 結果の表示 ---------- */

function printRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log("  (結果行なし)");
    return;
  }
  if (typeof rows[0] !== "object" || rows[0] === null) {
    console.log(`  ${JSON.stringify(rows)}`);
    return;
  }

  const columns = Object.keys(rows[0]);
  const cell = (row, col) => {
    const value = row[col];
    if (value === null || value === undefined) return "";
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  };

  // 全角文字を2幅として数える
  const width = (text) =>
    [...text].reduce(
      (sum, ch) => sum + (/[　-鿿！-｠]/.test(ch) ? 2 : 1),
      0,
    );
  const pad = (text, target) => text + " ".repeat(Math.max(0, target - width(text)));

  const widths = columns.map((col) =>
    Math.max(width(col), ...rows.map((row) => width(cell(row, col)))),
  );

  const line = (cells) =>
    "  " + cells.map((text, i) => pad(text, widths[i])).join("  |  ");

  console.log(line(columns));
  console.log("  " + widths.map((w) => "-".repeat(w)).join("--+--"));
  for (const row of rows) {
    console.log(line(columns.map((col) => cell(row, col))));
  }
}

/* ---------- 本体 ---------- */

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const inspect = args.includes("--inspect");
  const targets = args.filter((a) => !a.startsWith("--"));

  if (targets.length === 0 && !inspect) {
    fail(
      "実行する SQL ファイルかディレクトリを指定してください。\n" +
        "  例: node scripts/db-exec.mjs supabase/migrations\n" +
        "      node scripts/db-exec.mjs supabase/migrations --dry-run\n" +
        "      node scripts/db-exec.mjs --inspect",
    );
  }

  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    fail(
      "環境変数 SUPABASE_ACCESS_TOKEN が設定されていません。\n" +
        "Supabase の Account → Access Tokens で発行し、\n" +
        "  export SUPABASE_ACCESS_TOKEN=sbp_xxxxx\n" +
        "のように渡してください。ファイルには保存しないでください。",
    );
  }

  const ref = await readProjectRef();
  if (!ref) {
    fail(
      "プロジェクト ref を特定できません。\n" +
        "SUPABASE_PROJECT_REF を設定するか、.env.local に\n" +
        "NEXT_PUBLIC_SUPABASE_URL を書いてください。",
    );
  }

  const origin = process.env.SUPABASE_API_ORIGIN ?? API_ORIGIN;

  console.log(`プロジェクト: ${ref}`);

  if (inspect) {
    console.log("現況（テーブル / RLS / ポリシー数）\n");
    const result = await runSql({ origin, ref, token, sql: INSPECT_SQL });
    if (!result.ok) {
      console.error(`  失敗 (HTTP ${result.status})`);
      console.error(`  ${result.raw}`);
      fail("上のレスポンスをそのまま共有してください。");
    }
    printRows(result.parsed);
    return;
  }

  const files = await collectSqlFiles(targets);
  console.log(`対象ファイル: ${files.length} 件`);
  if (dryRun) console.log("--dry-run: 実行せず対象を表示します");
  console.log("");

  if (dryRun) {
    for (const file of files) {
      const sql = substitutePlaceholders(await readFile(file, "utf8"), file);
      const statements = sql
        .split(";")
        .filter((s) => s.replace(/--[^\n]*/g, "").trim().length > 0).length;
      console.log(
        `  ${path.relative(process.cwd(), file)}  (約 ${statements} 文)`,
      );
    }
    console.log("\n実行はしていません。--dry-run を外すと適用されます。");
    return;
  }

  for (const file of files) {
    const label = path.relative(process.cwd(), file);
    console.log(`── ${label}`);

    const sql = substitutePlaceholders(await readFile(file, "utf8"), file);
    const result = await runSql({ origin, ref, token, sql });

    if (!result.ok) {
      console.error(`  失敗 (HTTP ${result.status})`);
      console.error(`  ${result.raw}`);
      fail(
        "ここで中断しました。上のレスポンスをそのまま共有してください。\n" +
          "後続のファイルは実行していません。",
      );
    }

    printRows(result.parsed);
    console.log("");
  }

  console.log("すべて完了しました。");
  console.log(
    "個人アクセストークンは用が済んだら Supabase の管理画面で失効させてください。",
  );
}

main().catch((error) => {
  const hint =
    error instanceof TypeError
      ? "\napi.supabase.com に到達できませんでした。ネットワークを確認してください。"
      : "";
  fail(`予期しないエラー: ${error.message}${hint}`);
});
