#!/usr/bin/env node
/**
 * RLS の検証（仕様書 4.5）を、アプリと同じ経路で行う。
 *
 *   node scripts/verify-rls.mjs
 *
 * 管理者権限を一切使わない。実際にログインし、アプリが叩くのと同じ
 * REST API を叩いて確かめる。仕様書 4.5 の「そのユーザーでログインし、
 * select * from recipes を実行する」をそのまま実施するもの。
 *
 * ■ 事前に必要なもの
 *   - マイグレーション適用済み（npm run db:migrate）
 *   - 世帯とプロフィール作成済み（npm run db:setup）
 *   - 検証用の下ごしらえ済み（supabase/setup/02_verify_fixtures.sql）
 *
 * ■ 必要な環境変数
 *   KONDATE_TEST_EMAIL      テストユーザーのメールアドレス
 *   KONDATE_TEST_PASSWORD   テストユーザーのパスワード
 *
 * 接続先と publishable キーは .env.local から読む。
 * 本物のアカウントのパスワードは不要。
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

/* RLS を掛けた全テーブル。未ログインでどれも見えないことを確認する。 */
const TABLES = [
  "households",
  "profiles",
  "ingredient_master",
  "recipes",
  "recipe_ingredients",
  "meal_plans",
  "meal_plan_items",
  "plan_requests",
  "shopping_items",
  "recipe_ratings",
];

const FIXTURE_OWN = "RLS検証用（ダミー）"; // テストユーザーの世帯のレシピ
const FIXTURE_OTHER = "RLS検証用（我が家）"; // 別世帯のレシピ。見えてはいけない

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

async function readEnvLocal() {
  const text = await readFile(path.resolve(".env.local"), "utf8").catch(() => {
    fail(".env.local が見つかりません。接続先と publishable キーが必要です。");
  });

  const read = (key) => {
    const line = text.split("\n").find((l) => l.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1).trim() : null;
  };

  const url = read("NEXT_PUBLIC_SUPABASE_URL");
  const key = read("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !key) {
    fail(".env.local に URL と publishable キーの両方を設定してください。");
  }
  return { url: url.replace(/\/$/, ""), key };
}

async function request(url, { key, token, method = "GET", body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token ?? key}`,
      "Content-Type": "application/json",
      "User-Agent": "kondate-verify-rls",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const raw = await response.text();

  /* エグレスプロキシの拒否は Supabase の応答ではない。
     これを Supabase からの答えとして扱うと、認証エラーや
     「サインアップ無効」と誤って解釈してしまう。即座に止める。 */
  if (/not in allowlist|agentproxy|egress/i.test(raw)) {
    fail(
      "接続先に到達できていません。Supabase ではなく、\n" +
        "ネットワークのエグレスポリシーが接続を拒否しています。\n\n" +
        `  ${raw.trim()}\n\n` +
        "環境設定でこのホストを許可してから、もう一度実行してください。\n" +
        "設定変更は新しいセッションから反映されることがあります。",
    );
  }

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  return { ok: response.ok, status: response.status, raw, parsed };
}

/* ---------- 検査 ---------- */

const checks = [];
const record = (item, expected, actual, ok) =>
  checks.push({ item, expected, actual, ok });

async function checkSignupDisabled({ url, key }) {
  /* 仕様書 2.2-1 / 4.1。
     サインアップを実際に試す方式は使わない。理由が2つある。
     1) Supabase はメール形式の検証をサインアップ可否の判定より先に行う。
        拒否されても「無効だから」か「アドレスが不正だから」か区別できない。
     2) もし有効だった場合、検査そのものがユーザーを作ってしまう。
     設定を読むほうが確実で、副作用もない。 */
  const result = await request(`${url}/auth/v1/settings`, { key });
  const value = result.parsed?.disable_signup;

  if (!result.ok || typeof value !== "boolean") {
    record(
      "サインアップが無効",
      "disable_signup: true",
      `判定できず (HTTP ${result.status}) ${result.raw.slice(0, 60)}`,
      false,
    );
    return;
  }

  record(
    "サインアップが無効",
    "disable_signup: true",
    `disable_signup: ${value}`,
    value === true,
  );

  if (value !== true) {
    console.error(
      "\n  警告: サインアップが有効です。" +
        "「招待された2名のみ」という要件（仕様書 2.2-1）を満たしていません。",
    );
    console.error(
      "  Authentication → Sign In / Providers → Email の",
    );
    console.error(
      "  「Allow new users to sign up」を無効にしてください。\n",
    );
  }
}

async function checkAnonSeesNothing({ url, key }) {
  for (const table of TABLES) {
    const result = await request(
      `${url}/rest/v1/${table}?select=*&limit=5`,
      { key },
    );

    if (!result.ok) {
      /* エラーではなく 0 件が正しい挙動（仕様書 4.5）。
         権限付与の問題ならここで分かる。 */
      record(
        `未ログイン: ${table}`,
        "0件",
        `HTTP ${result.status} ${result.raw.slice(0, 80)}`,
        false,
      );
      continue;
    }

    const rows = Array.isArray(result.parsed) ? result.parsed : [];
    record(
      `未ログイン: ${table}`,
      "0件",
      `${rows.length}件`,
      rows.length === 0,
    );
  }
}

async function signIn({ url, key, email, password }) {
  const result = await request(`${url}/auth/v1/token?grant_type=password`, {
    key,
    method: "POST",
    body: { email, password },
  });

  if (!result.ok) {
    fail(
      `テストユーザーでログインできませんでした (HTTP ${result.status})\n` +
        `  ${result.raw}\n` +
        "メールアドレスとパスワードを確認してください。",
    );
  }

  const token = result.parsed?.access_token;
  if (typeof token !== "string") {
    fail(`ログイン応答に access_token がありません:\n  ${result.raw}`);
  }
  return token;
}

async function checkTestUserIsolation({ url, key, token }) {
  const result = await request(`${url}/rest/v1/recipes?select=name`, {
    key,
    token,
  });

  if (!result.ok) {
    record(
      "テストユーザーから見えるレシピ",
      `${FIXTURE_OWN} のみ`,
      `HTTP ${result.status} ${result.raw.slice(0, 120)}`,
      false,
    );
    return;
  }

  const names = (Array.isArray(result.parsed) ? result.parsed : [])
    .map((row) => row.name)
    .sort();

  /* 2方向を同時に見る。
     - 別世帯の行が混ざっていない  … 遮断できている
     - 自分の世帯の行は見えている  … ポリシー書き忘れの空振りではない */
  const leaked = names.includes(FIXTURE_OTHER);
  const seesOwn = names.includes(FIXTURE_OWN);

  record(
    "テストユーザー: 別世帯のレシピ",
    "見えない",
    leaked ? `見えた（${FIXTURE_OTHER}）` : "見えない",
    !leaked,
  );
  record(
    "テストユーザー: 自世帯のレシピ",
    "見える",
    seesOwn ? "見える" : `見えない（取得: ${names.join(" / ") || "0件"}）`,
    seesOwn,
  );
}

/* ---------- 表示 ---------- */

function printResults() {
  const width = (text) =>
    [...text].reduce((n, ch) => n + (/[　-鿿！-｠]/.test(ch) ? 2 : 1), 0);
  const pad = (text, target) =>
    text + " ".repeat(Math.max(0, target - width(text)));

  const cols = ["item", "expected", "actual", "result"];
  const rows = checks.map((c) => ({
    item: c.item,
    expected: c.expected,
    actual: c.actual,
    result: c.ok ? "OK" : "NG",
  }));

  const widths = cols.map((col) =>
    Math.max(width(col), ...rows.map((r) => width(r[col]))),
  );
  const line = (cells) =>
    "  " + cells.map((t, i) => pad(t, widths[i])).join("  |  ");

  console.log(line(cols));
  console.log("  " + widths.map((w) => "-".repeat(w)).join("--+--"));
  for (const row of rows) console.log(line(cols.map((c) => row[c])));
}

/* ---------- 本体 ---------- */

async function main() {
  const email = process.env.KONDATE_TEST_EMAIL;
  const password = process.env.KONDATE_TEST_PASSWORD;
  if (!email || !password) {
    fail(
      "KONDATE_TEST_EMAIL と KONDATE_TEST_PASSWORD を設定してください。\n" +
        "検証用アカウントのものだけで十分です。本物のパスワードは不要です。",
    );
  }

  const { url, key } = await readEnvLocal();
  console.log(`接続先: ${url}\n`);

  await checkSignupDisabled({ url, key });
  await checkAnonSeesNothing({ url, key });

  const token = await signIn({ url, key, email, password });
  await checkTestUserIsolation({ url, key, token });

  console.log("");
  printResults();

  const failed = checks.filter((c) => !c.ok);
  console.log("");
  if (failed.length > 0) {
    fail(`${failed.length} 件が NG です。上の表をそのまま共有してください。`);
  }
  console.log("すべて OK です。");
  console.log(
    "確認が済んだら supabase/setup/03_cleanup_verify.sql で検証用データを削除してください。",
  );
}

main().catch((error) => {
  const hint =
    error instanceof TypeError
      ? "\n接続先に到達できませんでした。エグレス許可が反映されているか確認してください。"
      : "";
  fail(`予期しないエラー: ${error.message}${hint}`);
});
