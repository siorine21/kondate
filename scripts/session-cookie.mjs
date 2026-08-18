#!/usr/bin/env node
/**
 * テスト用にログイン済みの Cookie を取り出す（開発時の動作確認専用）。
 *
 *   KONDATE_TEST_EMAIL=... KONDATE_TEST_PASSWORD=... node scripts/session-cookie.mjs
 *
 * アプリが使うのと同じ @supabase/ssr を通すので、
 * 実際のブラウザと同じ Cookie が得られる。
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { createServerClient } from "@supabase/ssr";

const text = await readFile(path.resolve(".env.local"), "utf8");
const read = (key) => {
  const line = text.split("\n").find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim() : null;
};

const url = read("NEXT_PUBLIC_SUPABASE_URL");
const key = read("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const email = process.env.KONDATE_TEST_EMAIL;
const password = process.env.KONDATE_TEST_PASSWORD;

if (!url || !key || !email || !password) {
  console.error("接続先・キー・メール・パスワードのいずれかが未設定です。");
  process.exit(1);
}

const captured = [];

const supabase = createServerClient(url, key, {
  cookies: {
    getAll: () => [],
    setAll: (cookiesToSet) => captured.push(...cookiesToSet),
  },
});

const { error } = await supabase.auth.signInWithPassword({ email, password });
if (error) {
  console.error(`ログインできませんでした: ${error.message}`);
  process.exit(1);
}

if (captured.length === 0) {
  console.error("Cookie が発行されませんでした。");
  process.exit(1);
}

/* curl の Cookie ヘッダ形式で1行にまとめて出す。 */
console.log(captured.map((c) => `${c.name}=${c.value}`).join("; "));
