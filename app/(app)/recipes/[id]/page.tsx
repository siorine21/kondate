import Link from "next/link";
import { notFound } from "next/navigation";

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
import { createClient } from "@/lib/supabase/server";

import { ArchiveButton, RatingStars } from "./detail-actions";

/* レシピ詳細（仕様書 5.2-4）。
   材料は世帯人数に換算して表示する。 */

type Params = { params: Promise<{ id: string }> };

export default async function RecipeDetailPage({ params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: recipe } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!recipe) notFound();

  const [{ data: ingredients }, { data: ratings }, { data: household }] =
    await Promise.all([
      supabase
        .from("recipe_ingredients")
        .select("id, name, qty, unit")
        .eq("recipe_id", id)
        .order("sort_order"),
      supabase.from("recipe_ratings").select("user_id, score").eq("recipe_id", id),
      supabase.from("households").select("servings").maybeSingle(),
    ]);

  const servings = household?.servings ?? recipe.servings;
  const myScore =
    ratings?.find((r) => r.user_id === user?.id)?.score ?? null;

  return (
    <main className="mx-auto w-full max-w-[430px] px-5 pb-20">
      <Link
        className="inline-flex items-center gap-[7px] py-2.5 font-mono text-[10px] tracking-[0.14em] text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
        href="/recipes"
      >
        ‹ &nbsp;もどる
      </Link>

      <header className="pb-[18px]">
        <p className="font-mono text-[9.5px] tracking-[0.2em] text-ink-3">
          {DISH_TYPE_LABEL[recipe.dish_type]}
          {recipe.status === "draft" ? " · 承認待ち" : ""}
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
          <div className="mt-[13px] flex items-center gap-2">
            <span
              className={`inline-block h-[7px] w-[7px] rounded-full ${PROTEIN_BG[recipe.main_protein]}`}
            />
            <span className="text-[11px] text-ink-3">
              たんぱく源：{PROTEIN_LABEL[recipe.main_protein]}
            </span>
            <span className="ml-auto text-[10.5px] text-ink-3">
              {recipe.food_groups
                .map((g) => FOOD_GROUP_LABEL[g] ?? `${g}群`)
                .join(" · ")}
            </span>
          </div>
        ) : null}
      </header>

      <h2 className="font-mono text-[9.5px] tracking-[0.2em] text-ink-3">
        INGREDIENTS / {servings}人分
      </h2>
      <div className="mt-[9px] rounded-card border border-line bg-card px-4">
        {(ingredients ?? []).length === 0 ? (
          <p className="py-3.5 text-[13px] text-ink-2">材料は登録されていません。</p>
        ) : (
          (ingredients ?? []).map((ing) => (
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
