"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

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
import type { Recipe, RecipeIngredient } from "@/lib/supabase/types";

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
  ingredients: RecipeIngredient[];
  servings: number;
  myScore: number | null;
};

function RecipeDetail() {
  const id = useSearchParams().get("id");
  const [data, setData] = useState<Loaded | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) {
      setNotFound(true);
      return;
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

      /* 4 本まとめて投げる。順に待つと、そのぶん表示が遅れる。 */
      const [
        { data: recipe },
        { data: ingredients },
        { data: ratings },
        { data: household },
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
      });
    })();

    return () => {
      active = false;
    };
  }, [id]);

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

  const { recipe, ingredients, servings, myScore } = data;

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

        {recipe.main_protein !== "none" ? (
          /* 食品群の名前は長い。横に並べると折り返して読めなくなるため、
             たんぱく源の下に置く。 */
          <div className="mt-[13px]">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-[7px] w-[7px] rounded-full ${PROTEIN_BG[recipe.main_protein]}`}
              />
              <span className="text-[11px] text-ink-3">
                たんぱく源：{PROTEIN_LABEL[recipe.main_protein]}
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
              className="flex items-center border-b border-[#EFF1EC] py-[11px] text-[14px] last:border-0"
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
          <p className="mt-[9px] rounded-[10px] bg-[#EDF0EA] px-[13px] py-3 text-[11.5px] leading-[1.8] text-ink-2">
            {recipe.memo}
          </p>
        </>
      ) : null}

      <div className="mt-6">
        <RatingStars initialScore={myScore} recipeId={recipe.id} />
      </div>

      <div className="mt-3.5 flex gap-[9px]">
        <ArchiveButton recipeId={recipe.id} />
      </div>
    </main>
  );
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
        accent ? "bg-ai-soft text-ai" : "bg-[#EDF0EA] text-ink-2"
      }`}
    >
      {children}
    </span>
  );
}
