#!/usr/bin/env node
/**
 * シードレシピ20件を Supabase に投入する（仕様書 11.1）。
 *
 *   node scripts/seed-remote.mjs [--dry-run]
 *
 * アプリと同じ経路で入れる。ANON KEY でログインし、PostgREST を叩く。
 * service_role キーは使わない（仕様書 2.2-3）。したがって書き込みは
 * すべて RLS を通る。世帯の紐付けもポリシー任せで、こちらでは絞らない。
 *
 * ■ 必要な環境変数
 *   NEXT_PUBLIC_SUPABASE_URL       .env.local からも読む
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY  同上
 *   KONDATE_EMAIL                  ログインに使うメールアドレス
 *   KONDATE_PASSWORD               そのパスワード
 *
 * パスワードは環境変数からしか読まない。ファイルにも引数にも書かない。
 *
 * 何度実行しても結果は同じ。すでに同じ品名があるレシピは飛ばす。
 *
 * データは supabase/setup/seed-recipes.json から読む。これは
 * 04_seed_recipes.sql を PostgreSQL に流した結果を書き出したもので、
 * 手では書いていない。SQL とこちらで中身がずれない。
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DRY_RUN = process.argv.includes("--dry-run");

/* ---------- 設定 ---------- */

async function readEnvLocal() {
  try {
    const text = await readFile(path.join(ROOT, ".env.local"), "utf8");
    const out = {};
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

function required(value, name, hint) {
  if (value) return value;
  console.error(`${name} が設定されていません。`);
  console.error(hint);
  process.exit(1);
}

/* ---------- HTTP ---------- */

function describeNetworkError(error) {
  const text = String(error?.cause?.message ?? error?.message ?? error);
  if (/403|407|Proxy|tunneling socket/i.test(text)) {
    return (
      "接続が許可されていません。この環境の外向き通信は Supabase の\n" +
      "プロジェクトホストのみ許可されています。宛先を確認してください。"
    );
  }
  return null;
}

async function request(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    const hint = describeNetworkError(error);
    throw new Error(hint ?? `通信に失敗しました: ${error.message}`);
  }
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

/* ---------- 本体 ---------- */

async function main() {
  const env = { ...(await readEnvLocal()), ...process.env };

  const baseUrl = required(
    env.NEXT_PUBLIC_SUPABASE_URL,
    "NEXT_PUBLIC_SUPABASE_URL",
    ".env.local か環境変数に設定してください。",
  ).replace(/\/+$/, "");
  const anonKey = required(
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ".env.local か環境変数に設定してください。",
  );

  const seed = JSON.parse(
    await readFile(path.join(ROOT, "supabase/setup/seed-recipes.json"), "utf8"),
  );
  console.log(`シード ${seed.recipes.length} 件を読みました。`);

  if (DRY_RUN) {
    for (const r of seed.recipes) {
      console.log(
        `  ${r.dish_type.padEnd(4)} ${r.name}（材料 ${r.ingredients.length}）`,
      );
    }
    console.log("--dry-run のため通信しません。");
    return;
  }

  const email = required(
    env.KONDATE_EMAIL,
    "KONDATE_EMAIL",
    "ログインに使うメールアドレスを環境変数で渡してください。",
  );
  const password = required(
    env.KONDATE_PASSWORD,
    "KONDATE_PASSWORD",
    "パスワードを環境変数で渡してください。引数には書かないでください。",
  );

  /* 1) ログイン */
  const session = await request(
    `${baseUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
  ).catch((error) => {
    if (/400/.test(error.message)) {
      throw new Error("メールアドレスまたはパスワードが違います。");
    }
    throw error;
  });
  console.log("ログインしました。");

  const rest = (suffix, options = {}) =>
    request(`${baseUrl}/rest/v1/${suffix}`, {
      ...options,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

  /* 2) 世帯を引く。RLS が自世帯しか返さないので1行だけ返る。 */
  const profiles = await rest("profiles?select=household_id");
  if (!profiles.length) {
    throw new Error(
      "この利用者に profiles がありません。supabase/setup/01_household.sql を先に実行してください。",
    );
  }
  const householdId = profiles[0].household_id;

  /* 3) すでにある品名は飛ばす。手で登録したレシピを壊さないため。 */
  const existing = new Set(
    (await rest("recipes?select=name")).map((r) => r.name),
  );
  const todo = seed.recipes.filter((r) => !existing.has(r.name));
  console.log(
    `登録済み ${existing.size} 件。今回入れるのは ${todo.length} 件です。`,
  );

  /* 4) 投入 */
  let added = 0;
  for (const recipe of todo) {
    const [row] = await rest("recipes", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        household_id: householdId,
        name: recipe.name,
        category: recipe.category,
        dish_type: recipe.dish_type,
        main_protein: recipe.main_protein,
        method: recipe.method,
        cook_time_min: recipe.cook_time_min,
        servings: recipe.servings,
        food_groups: recipe.food_groups,
        tags: recipe.tags,
        steps: recipe.steps,
        source: "manual",
        status: "active",
      }),
    });

    try {
      await rest("recipe_ingredients", {
        method: "POST",
        body: JSON.stringify(
          recipe.ingredients.map((ing) => ({
            recipe_id: row.id,
            name: ing.name,
            qty: ing.qty,
            unit: ing.unit,
            shop_category: ing.shop_category,
            sort_order: ing.sort_order,
          })),
        ),
      });
    } catch (error) {
      /* 材料の無いレシピを残さない。画面側の登録と同じ扱い。 */
      await rest(`recipes?id=eq.${row.id}`, { method: "DELETE" });
      throw new Error(`${recipe.name} の材料を入れられませんでした: ${error.message}`);
    }

    added += 1;
    console.log(`  ${added}/${todo.length} ${recipe.name}`);
  }

  /* 5) 食材マスタ（仕様書 11.2）。調味料は常備品として買い物リストに出さない。 */
  const master = new Map();
  for (const recipe of seed.recipes) {
    for (const ing of recipe.ingredients) {
      if (master.has(ing.name)) continue;
      master.set(ing.name, {
        household_id: householdId,
        name: ing.name,
        shop_category: ing.shop_category,
        default_unit: ing.unit,
        is_pantry: ing.shop_category === "seasoning",
      });
    }
  }
  await rest("ingredient_master?on_conflict=household_id,name", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify([...master.values()]),
  });
  console.log(`食材マスタ ${master.size} 件を整えました。`);

  /* 6) 確認。入れたものが読み戻せるかを見る。 */
  const check = await rest(
    "recipes?select=name,dish_type,main_protein,cook_time_min&status=eq.active",
  );
  const count = (fn) => check.filter(fn).length;
  console.log("");
  console.log("読み戻した結果");
  console.log(`  レシピ      ${check.length} 件`);
  console.log(
    `  主菜 ${count((r) => r.dish_type === "main")} / ` +
      `副菜 ${count((r) => r.dish_type === "side")} / ` +
      `汁物 ${count((r) => r.dish_type === "soup")}`,
  );
  console.log(
    `  肉 ${count((r) => r.dish_type === "main" && r.main_protein === "meat")} / ` +
      `魚 ${count((r) => r.dish_type === "main" && r.main_protein === "fish")} / ` +
      `大豆 ${count((r) => r.dish_type === "main" && r.main_protein === "soy")} / ` +
      `卵 ${count((r) => r.dish_type === "main" && r.main_protein === "egg")}`,
  );
  console.log(
    `  30分以内の主菜 ${count((r) => r.dish_type === "main" && r.cook_time_min <= 30)} 件`,
  );

  /* 材料の入っていないレシピが無いこと。あれば買い物リストが組めない。 */
  const orphans = await rest(
    "recipes?select=name,recipe_ingredients(id)&status=eq.active",
  );
  const empty = orphans.filter((r) => r.recipe_ingredients.length === 0);
  console.log(
    empty.length === 0
      ? "  材料の欠け  なし"
      : `  材料の欠け  ${empty.map((r) => r.name).join(", ")}`,
  );
}

main().catch((error) => {
  console.error("");
  console.error(error.message);
  process.exit(1);
});
