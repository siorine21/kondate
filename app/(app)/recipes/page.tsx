"use client";

import { useCallback, useEffect, useState } from "react";

import { BackLink } from "@/app/(app)/back-link";
import { createClient } from "@/lib/supabase/client";

import { RecipeForm } from "./recipe-form";
import { RecipeGroups, type RecipeRow } from "./recipe-groups";
import { SeedButton } from "./seed-button";

/* レシピ管理（仕様書 5.2-8）。

   ブラウザから直接 Supabase を読む。世帯の絞り込みは書かない。
   RLS が行うため（仕様書 3.3）。 */

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<RecipeRow[] | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [unlinked, setUnlinked] = useState(false);
  /* 状態を問わない品名。はじめの20品の残りを数えるのに使う。 */
  const [knownNames, setKnownNames] = useState<string[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();

    /* profiles には世帯の全員が並ぶ。自分の行を指定しないと、
       2人目が増えた時点で maybeSingle が「1行に絞れない」で落ちる。 */
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user.id ?? "";

    const [
      { data: profile },
      { data: rows, error: loadError },
      { data: allNames },
    ] = await Promise.all([
        supabase
          .from("profiles")
          .select("household_id")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("recipes")
          .select("id, name, category, dish_type, main_protein, cook_time_min")
          .eq("status", "active")
          .order("created_at", { ascending: false }),
        /* 「もう作らない」にした品も含めた品名。はじめの20品の残りを
           数えるのに使う。一覧は active しか読まないので、これが無いと
           アーカイブした品を「まだ登録していない」と数えてしまう
           （変更記録 3.30）。 */
        supabase.from("recipes").select("name"),
      ]);

    if (loadError) {
      setError("レシピを取得できませんでした。時間を置いて開き直してください。");
      return;
    }

    /* 世帯に紐付いていない利用者は RLS が1行も返さない。
       「レシピがない」と見分けがつかないので、ここで分けて伝える。 */
    setUnlinked(!profile);
    setHouseholdId(profile?.household_id ?? null);
    setRecipes(rows ?? []);
    setKnownNames((allNames ?? []).map((row) => row.name));
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

      {unlinked ? (
        <section className="mt-4 rounded-card border border-line bg-card p-4">
          <p className="text-[13px] leading-[1.95] text-ink-2">
            このアカウントはまだ世帯に紐付いていません。
            <br />
            紐付けるまで、レシピや献立は表示されません。
          </p>
          <p className="mt-2.5 text-[11.5px] leading-[1.85] text-ink-3">
            はじめに設定した方に、このメールアドレスの紐付けを頼んでください。
          </p>
        </section>
      ) : null}

      {householdId ? (
        <>
          <RecipeForm householdId={householdId} onSaved={load} />
          {knownNames ? (
            <SeedButton
              existingNames={knownNames}
              householdId={householdId}
              onSeeded={load}
            />
          ) : null}
        </>
      ) : null}

      {error ? (
        <p className="mt-4 text-[12.5px] text-danger" role="alert">
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
            {unlinked
              ? "世帯に紐付くと、登録済みのレシピが並びます。"
              : "レシピはまだありません。登録すると献立を組めるようになります。"}
          </p>
        ) : (
          <RecipeGroups recipes={recipes} />
        )}
      </section>
    </main>
  );
}
