"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { BackLink } from "@/app/(app)/back-link";
import {
  CATEGORY_LABEL_LONG,
  DISH_TYPE_LABEL,
  FOOD_GROUP_LABEL,
  PROTEIN_BG,
  PROTEIN_LABEL,
  SOURCE_LABEL,
  formatQuantity,
  scaleQuantity,
} from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";
import type {
  Recipe,
  RecipeIngredient,
  RecipeRequest,
} from "@/lib/supabase/types";

import {
  RecipeForm,
  type RecipeDraft,
} from "@/app/(app)/recipes/recipe-form";
import { Heart } from "@/app/(app)/heart";
import { RequestButton } from "@/app/(app)/recipe/request-button";
import { proteinSourcesOf } from "@/lib/protein";

import { ArchiveButton, RatingStars } from "./detail-actions";

/* レシピ詳細（仕様書 5.2-4）。

   静的配信では動的セグメントを事前生成できないため、
   /recipe/?id=<uuid> の形でクエリから受け取る。 */

export default function RecipeDetailPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <RecipeDetail />
    </Suspense>
  );
}

type Loaded = {
  recipe: Recipe;
  request: RecipeRequest | null;
  /* この料理がこれまでにもらったハートの数（変更記録 3.29）。 */
  hearts: number;
  ingredients: RecipeIngredient[];
  servings: number;
  myScore: number | null;
};

function RecipeDetail() {
  const id = useSearchParams().get("id");
  const [data, setData] = useState<Loaded | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    if (!id) {
      setNotFound(true);
      return () => {};
    }
    let active = true;

    void (async () => {
      const supabase = createClient();

      /* getUser は毎回サーバーに問い合わせる。ここで要るのは自分の評価を
         見分けるための id だけで、行を絞るのは RLS の仕事なので、
         手元にあるセッションから読む（仕様書 3.3）。 */
      const {
        data: { session },
      } = await supabase.auth.getSession();

      /* まとめて投げる。順に待つと、そのぶん表示が遅れる。 */
      const [
        { data: recipe },
        { data: ingredients },
        { data: ratings },
        { data: household },
        { data: requests },
        { data: hearts },
      ] = await Promise.all([
        supabase.from("recipes").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("recipe_ingredients")
          .select("*")
          .eq("recipe_id", id)
          .order("sort_order"),
        supabase
          .from("recipe_ratings")
          .select("user_id, score")
          .eq("recipe_id", id),
        supabase.from("households").select("servings").maybeSingle(),
        /* 表がまだ無いうちは失敗する。詳細そのものは出せるので、
           ここで落とさず、リクエストの状態だけ無しとして扱う。 */
        supabase
          .from("recipe_requests")
          .select("*")
          .eq("recipe_id", id)
          .eq("status", "open"),
        /* 表がまだ無いうちは失敗する。詳細そのものは出せるので、
           ここで落とさず、0件として扱う。 */
        supabase.from("meal_thanks").select("id").eq("recipe_id", id),
      ]);

      if (!active) return;
      if (!recipe) {
        setNotFound(true);
        return;
      }

      setData({
        recipe,
        ingredients: ingredients ?? [],
        servings: household?.servings ?? recipe.servings,
        myScore:
          ratings?.find((r) => r.user_id === session?.user.id)?.score ?? null,
        request: requests?.[0] ?? null,
        hearts: (hearts ?? []).length,
      });
    })();

    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => load(), [load]);

  if (notFound) {
    return (
      <main className="mx-auto w-full max-w-[430px] px-5 pb-20">
        <BackLink href="/recipes/">レシピ</BackLink>
        <p className="mt-6 text-[13px] leading-[1.9] text-ink-2">
          レシピが見つかりません。一覧から選び直してください。
        </p>
      </main>
    );
  }

  if (!data) return <div className="min-h-dvh" />;

  const { recipe, ingredients, servings, myScore, request, hearts } = data;

  /* 材料に入っている、主役以外のたんぱく源（変更記録 3.34）。 */
  const others = proteinSourcesOf(ingredients.map((ing) => ing.name)).filter(
    (key) => key !== recipe.main_protein,
  );

  return (
    <main className="mx-auto w-full max-w-[430px] px-5 pb-20">
      <BackLink href="/recipes/">レシピ</BackLink>

      <header className="pb-[18px]">
        <p className="font-mono text-[9.5px] tracking-[0.2em] text-ink-3">
          {DISH_TYPE_LABEL[recipe.dish_type]}
        </p>
        <h1 className="mt-[7px] font-mincho text-[24px] font-bold tracking-[0.02em]">
          {recipe.name}
        </h1>

        <div className="mt-[11px] flex flex-wrap gap-1.5">
          <Tag>{CATEGORY_LABEL_LONG[recipe.category]}</Tag>
          <Tag>{recipe.cook_time_min}分</Tag>
          <Tag>{servings}人分</Tag>
          <Tag accent>{SOURCE_LABEL[recipe.source]}</Tag>
          {recipe.tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>

        {recipe.main_protein !== "none" || others.length > 0 ? (
          /* 食品群の名前は長い。横に並べると折り返して読めなくなるため、
             たんぱく源の下に置く。 */
          <div className="mt-[13px]">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-[7px] w-[7px] rounded-full ${
                  PROTEIN_BG[
                    recipe.main_protein === "none" && others[0]
                      ? others[0]
                      : recipe.main_protein
                  ]
                }`}
              />
              <span className="text-[11px] text-ink-3">
                {/* 主役のほかに入っているものも出す。魚週2回・大豆週2回は
                    こちらも数える（変更記録 3.34）。
                    主役が「なし」のときは、入っているものをそのまま書く。 */}
                {recipe.main_protein === "none"
                  ? `たんぱく源：${others.map((key) => PROTEIN_LABEL[key]).join("・")}`
                  : `たんぱく源：${PROTEIN_LABEL[recipe.main_protein]}${
                      others.length > 0
                        ? `（${others.map((key) => PROTEIN_LABEL[key]).join("・")}も使います）`
                        : ""
                    }`}
              </span>
            </div>
            <p className="mt-1.5 text-[10.5px] leading-[1.75] text-ink-3">
              {recipe.food_groups
                .map((g) => FOOD_GROUP_LABEL[g] ?? `${g}群`)
                .join(" · ")}
            </p>
          </div>
        ) : null}
      </header>

      <h2 className="font-mono text-[9.5px] tracking-[0.2em] text-ink-3">
        INGREDIENTS / {servings}人分
      </h2>
      <div className="mt-[9px] rounded-card border border-line bg-card px-4">
        {ingredients.length === 0 ? (
          <p className="py-3.5 text-[13px] text-ink-2">
            材料は登録されていません。
          </p>
        ) : (
          ingredients.map((ing) => (
            <div
              className="flex items-center border-b border-line/60 py-[11px] text-[14px] last:border-0"
              key={ing.id}
            >
              {ing.name}
              <span className="ml-auto font-mono text-[11.5px] text-ink-3">
                {formatQuantity(
                  scaleQuantity(ing.qty, recipe.servings, servings),
                  ing.unit,
                )}
              </span>
            </div>
          ))
        )}
      </div>

      {recipe.steps.length > 0 ? (
        <>
          <h2 className="mt-[22px] font-mono text-[9.5px] tracking-[0.2em] text-ink-3">
            STEPS
          </h2>
          <div className="mt-[9px] rounded-card border border-line bg-card p-4">
            {recipe.steps.map((step, index) => (
              <div
                className="flex gap-[11px] border-b border-line py-[11px] text-[13.5px] leading-[1.95] last:border-0"
                key={`${index}-${step.slice(0, 8)}`}
              >
                <span className="flex-shrink-0 pt-[3px] font-mono text-[11px] text-ai">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {recipe.memo ? (
        <>
          <h2 className="mt-[22px] font-mono text-[9.5px] tracking-[0.2em] text-ink-3">
            MEMO
          </h2>
          <p className="mt-[9px] rounded-[10px] bg-chip px-[13px] py-3 text-[11.5px] leading-[1.8] text-ink-2">
            {recipe.memo}
          </p>
        </>
      ) : null}

      {hearts > 0 ? (
        <p className="mt-5 flex items-center gap-2 text-[12.5px] text-ink-2">
          <Heart filled />
          この料理は、これまでに {hearts} 回ハートをもらっています
        </p>
      ) : null}

      <div className="mt-6">
        <RatingStars initialScore={myScore} recipeId={recipe.id} />
      </div>

      {recipe.dish_type === "main" ? (
        <div className="mt-3.5">
          <RequestButton
            householdId={recipe.household_id}
            initial={request}
            recipeId={recipe.id}
          />
        </div>
      ) : null}

      <div className="mt-3.5 flex gap-[9px]">
        <button
          className="min-h-[44px] flex-1 rounded-[9px] border border-line text-[12.5px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          onClick={() => setEditing(true)}
          type="button"
        >
          レシピを編集
        </button>
        <ArchiveButton recipeId={recipe.id} />
      </div>

      {editing ? (
        <div className="mt-4">
          <RecipeForm
            householdId={recipe.household_id}
            initial={toDraft(recipe, ingredients)}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              load();
            }}
          />
        </div>
      ) : null}
    </main>
  );
}

/* 画面の値を入力欄の形に直す。数値は文字列で持つ（空欄を表せるため）。 */
function toDraft(
  recipe: Recipe,
  ingredients: readonly RecipeIngredient[],
): RecipeDraft {
  return {
    id: recipe.id,
    name: recipe.name,
    category: recipe.category,
    dish_type: recipe.dish_type,
    main_protein: recipe.main_protein,
    method: recipe.method,
    cook_time_min: recipe.cook_time_min,
    food_groups: recipe.food_groups,
    steps: recipe.steps,
    memo: recipe.memo,
    ingredients: ingredients.map((ing) => ({
      name: ing.name,
      qty: ing.qty === null ? "" : String(ing.qty),
      unit: ing.unit ?? "",
      shop_category: ing.shop_category,
    })),
  };
}

function Tag({
  accent,
  children,
}: {
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`rounded-[5px] px-2 py-[3px] font-mono text-[9.5px] tracking-[0.1em] ${
        accent ? "bg-ai-soft text-ai" : "bg-chip text-ink-2"
      }`}
    >
      {children}
    </span>
  );
}
