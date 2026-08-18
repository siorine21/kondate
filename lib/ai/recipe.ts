import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import type { ShopCategory } from "@/lib/supabase/types";

/* 仕様書 8章 — AIレシピ生成。
   生成物は必ず draft として保存する。active にしてはならない（2.2-6）。

   この処理は Route Handler からのみ呼ぶ。ANTHROPIC_API_KEY を
   クライアントに出さないため（2.2-2 / 4.2）。 */

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2000;

/* 思考は有効にしない。構造化 JSON を1件返すだけの処理で、
   仕様書 8.4 が指定する max_tokens: 2000 を出力に使い切りたいため。 */

/* ---------- 8.3 出力スキーマ ---------- */

const SHOP_CATEGORIES = [
  "produce",
  "meat",
  "seafood",
  "tofu",
  "dairy_egg",
  "dry",
  "seasoning",
  "other",
] as const;

const ingredientSchema = z.object({
  name: z.string().min(1),
  qty: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  shop_category: z.enum(SHOP_CATEGORIES),
});

export const generatedRecipeSchema = z.object({
  name: z.string().min(1),
  category: z.enum(["washoku", "yoshoku", "chuka", "other"]),
  dish_type: z.enum(["main", "side", "soup", "rice"]),
  main_protein: z.enum(["meat", "fish", "egg", "soy", "none"]),
  method: z.enum([
    "grill",
    "simmer",
    "fry",
    "stirfry",
    "steam",
    "raw",
    "other",
  ]),
  cook_time_min: z.number().int().positive().max(240),
  servings: z.number().int().positive().max(12),
  /* 食品群は 1〜6。ここが壊れると栄養評価（10章）が静かに狂うため厳しく見る。 */
  food_groups: z.array(z.number().int().min(1).max(6)).min(1),
  tags: z.array(z.string()),
  ingredients: z.array(ingredientSchema).min(1),
  /* 仕様書 8.2 の「手順は3〜6ステップ」に合わせる。 */
  steps: z.array(z.string().min(1)).min(3).max(6),
  memo: z.string().min(1),
});

export type GeneratedRecipe = z.infer<typeof generatedRecipeSchema>;

/* ---------- 8.2 システムプロンプト ---------- */

const SYSTEM_PROMPT = `あなたは日本の家庭料理に精通した管理栄養士です。
指定された料理名について、家庭で再現可能なレシピをJSONで出力してください。

制約:
- 分量は2人分。単位はグラム・ミリリットル・大さじ・小さじ・個・本・束・丁を使う
- 手順は3〜6ステップ。1ステップは60文字以内
- 特別な調理器具を必要としない
- food_groups は以下から該当するものをすべて挙げる
  1=魚肉卵大豆 2=乳製品海藻小魚 3=緑黄色野菜 4=淡色野菜果物 5=穀類いも 6=油脂
- shop_category は produce/meat/seafood/tofu/dairy_egg/dry/seasoning/other から選ぶ
- memo には調理のコツか保存性に関する助言を1文入れる

出力はJSONオブジェクトのみ。前置き・説明・マークダウンのコードフェンスを一切含めない。`;

/* ---------- エラー ---------- */

export type RecipeGenerationFailure =
  | "missing_api_key"
  | "api_error"
  | "invalid_output";

export class RecipeGenerationError extends Error {
  readonly reason: RecipeGenerationFailure;
  readonly detail: string;

  constructor(reason: RecipeGenerationFailure, detail: string) {
    super(detail);
    this.name = "RecipeGenerationError";
    this.reason = reason;
    this.detail = detail;
  }
}

/* ---------- 応答の取り出し ---------- */

/* 「コードフェンスを含めない」と指示していても混ざることがある。
   仕様書 8.4 の手順2どおり、除去してから JSON.parse する。 */
export function extractJson(raw: string): string {
  let text = raw.trim();

  const fence = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/);
  if (fence?.[1]) text = fence[1].trim();

  /* 前後に文が付いた場合に備えて、最も外側の波括弧だけを取る。 */
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }
  return text;
}

function textFromResponse(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/* ---------- 生成本体 ---------- */

export type GenerateOptions = {
  name: string;
  dishType?: "main" | "side" | "soup" | "rice";
};

const DISH_TYPE_LABEL: Record<string, string> = {
  main: "主菜",
  side: "副菜",
  soup: "汁物",
  rice: "主食",
};

function buildUserPrompt({ name, dishType }: GenerateOptions): string {
  const hint = dishType
    ? `\nこの料理は「${DISH_TYPE_LABEL[dishType] ?? dishType}」として登録します。`
    : "";
  return `料理名: ${name}${hint}`;
}

async function requestOnce(
  client: Anthropic,
  options: GenerateOptions,
): Promise<string> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(options) }],
  });
  return textFromResponse(message);
}

/* 仕様書 8.4
   1. Claude API を呼ぶ
   2. コードフェンスを除去し JSON.parse
   3. Zod で検証。失敗時は1回だけ再試行し、なお失敗ならエラー */
export async function generateRecipe(
  options: GenerateOptions,
): Promise<GeneratedRecipe> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new RecipeGenerationError(
      "missing_api_key",
      "ANTHROPIC_API_KEY が設定されていません。",
    );
  }

  const client = new Anthropic({ apiKey });
  let lastDetail = "";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let raw: string;
    try {
      raw = await requestOnce(client, options);
    } catch (error) {
      /* 通信・認証・レート制限。再試行しても同じなので即座に返す。 */
      const detail =
        error instanceof Anthropic.APIError
          ? `Claude API エラー (${error.status}): ${error.message}`
          : `Claude API の呼び出しに失敗しました: ${String(error)}`;
      throw new RecipeGenerationError("api_error", detail);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(raw));
    } catch {
      lastDetail = `JSON として読めませんでした: ${raw.slice(0, 200)}`;
      continue;
    }

    const result = generatedRecipeSchema.safeParse(parsed);
    if (result.success) return result.data;

    lastDetail = `スキーマ検証に失敗しました: ${result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(" / ")}`;
  }

  throw new RecipeGenerationError("invalid_output", lastDetail);
}

/* ---------- 保存用の変換 ---------- */

export type RecipeInsert = {
  household_id: string;
  name: string;
  category: GeneratedRecipe["category"];
  dish_type: GeneratedRecipe["dish_type"];
  main_protein: GeneratedRecipe["main_protein"];
  method: GeneratedRecipe["method"];
  cook_time_min: number;
  servings: number;
  food_groups: number[];
  tags: string[];
  steps: string[];
  memo: string;
  source: "ai";
  status: "draft";
};

export function toRecipeInsert(
  recipe: GeneratedRecipe,
  householdId: string,
): RecipeInsert {
  return {
    household_id: householdId,
    name: recipe.name,
    category: recipe.category,
    dish_type: recipe.dish_type,
    main_protein: recipe.main_protein,
    method: recipe.method,
    cook_time_min: recipe.cook_time_min,
    servings: recipe.servings,
    food_groups: [...new Set(recipe.food_groups)].sort((a, b) => a - b),
    tags: recipe.tags,
    steps: recipe.steps,
    memo: recipe.memo,
    source: "ai",
    /* AI の出力を直接 active にしてはならない（仕様書 2.2-6 / 8.4）。 */
    status: "draft",
  };
}

export type IngredientInsert = {
  recipe_id: string;
  name: string;
  qty: number | null;
  unit: string | null;
  shop_category: ShopCategory;
  sort_order: number;
};

export function toIngredientInserts(
  recipe: GeneratedRecipe,
  recipeId: string,
): IngredientInsert[] {
  return recipe.ingredients.map((ing, index) => ({
    recipe_id: recipeId,
    name: ing.name,
    qty: ing.qty ?? null,
    unit: ing.unit ?? null,
    shop_category: ing.shop_category,
    sort_order: index,
  }));
}
