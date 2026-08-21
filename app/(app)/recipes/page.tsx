"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  CATEGORY_LABEL,
  DISH_TYPE_LABEL,
  PROTEIN_BG,
  PROTEIN_LABEL,
} from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";
import type {
  DishType,
  MainProtein,
  RecipeCategory,
} from "@/lib/supabase/types";

import { BackLink } from "@/app/(app)/back-link";

import { RecipeForm } from "./recipe-form";
import { SeedButton } from "./seed-button";

/* レシピ管理（仕様書 5.2-8）。

   ブラウザから直接 Supabase を読む。世帯の絞り込みは書かない。
   RLS が行うため（仕様書 3.3）。 */

type RecipeRow = {
  id: string;
  name: string;
  category: RecipeCategory;
  dish_type: DishType;
  main_protein: MainProtein;
  cook_time_min: number;
};

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<RecipeRow[] | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();

    const [{ data: profile }, { data: rows, error: loadError }] =
      await Promise.all([
        supabase.from("profiles").select("household_id").maybeSingle(),
        supabase
          .from("recipes")
          .select("id, name, category, dish_type, main_protein, cook_time_min")
          .eq("status", "active")
          .order("created_at", { ascending: false }),
      ]);

    if (loadError) {
      setError("レシピを取得できませんでした。時間を置いて開き直してください。");
      return;
    }
    setHouseholdId(profile?.household_id ?? null);
    setRecipes(rows ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto w-full max-w-[430px] px-5 pb-20">
      <BackLink href="/">今日の献立</BackLink>

      <header className="pb-[18px]">
        <p className="font-mono text-[9.5px] tracking-[0.2em] text-ink-3">
          RECIPES{recipes ? ` · ${recipes.length}件` : ""}
        </p>
        <h1 className="mt-[7px] font-mincho text-[24px] font-bold tracking-[0.02em]">
          レシピ
        </h1>
      </header>

      {householdId ? (
        <>
          <RecipeForm householdId={householdId} onSaved={load} />
          {recipes ? (
            <SeedButton
              existingNames={recipes.map((r) => r.name)}
              householdId={householdId}
              onSeeded={load}
            />
          ) : null}
        </>
      ) : null}

      {error ? (
        <p className="mt-4 text-[12.5px] text-meat" role="alert">
          {error}
        </p>
      ) : null}

      <section className="mt-[26px]">
        <h2 className="font-mono text-[9.5px] tracking-[0.2em] text-ink-3">
          登録済み
        </h2>

        {recipes === null ? (
          <p className="mt-3 text-[12.5px] text-ink-3">読み込んでいます</p>
        ) : recipes.length === 0 ? (
          <p className="mt-3 text-[12.5px] leading-[1.9] text-ink-2">
            レシピはまだありません。
            <br />
            登録すると献立を組めるようになります。
          </p>
        ) : (
          <ul>
            {recipes.map((recipe) => (
              <li key={recipe.id}>
                <Link
                  className="flex items-center gap-3 border-b border-line py-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
                  href={`/recipe/?id=${recipe.id}`}
                >
                  <span
                    className={`flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-[9px] font-mono text-[10px] text-white ${PROTEIN_BG[recipe.main_protein]}`}
                  >
                    {PROTEIN_LABEL[recipe.main_protein]}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14.5px] font-medium">
                      {recipe.name}
                    </span>
                    <span className="mt-[3px] block font-mono text-[10.5px] text-ink-3">
                      {CATEGORY_LABEL[recipe.category]} ·{" "}
                      {DISH_TYPE_LABEL[recipe.dish_type]} ·{" "}
                      {recipe.cook_time_min}分
                    </span>
                  </span>
                  <span className="ml-auto pl-2 text-[17px] text-line">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
