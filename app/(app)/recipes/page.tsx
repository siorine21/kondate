import type { Metadata } from "next";
import Link from "next/link";

import {
  CATEGORY_LABEL,
  DISH_TYPE_LABEL,
  PROTEIN_BG,
  PROTEIN_LABEL,
} from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

import { ApproveButton, GenerateForm } from "./recipe-actions";

export const metadata: Metadata = { title: "レシピ｜献立" };

/* レシピ管理（仕様書 5.2-8）。
   承認待ちを最上部に強調表示し、その下に登録済みを並べる。 */

export default async function RecipesPage() {
  const supabase = await createClient();

  /* 世帯の絞り込みは書かない。RLS が行う（仕様書 3.3）。 */
  const { data: recipes } = await supabase
    .from("recipes")
    .select(
      "id, name, category, dish_type, main_protein, cook_time_min, source, status",
    )
    .in("status", ["draft", "active"])
    .order("created_at", { ascending: false });

  const all = recipes ?? [];
  const drafts = all.filter((r) => r.status === "draft");
  const actives = all.filter((r) => r.status === "active");

  return (
    <main className="mx-auto w-full max-w-[430px] px-5 pb-20">
      <header className="pt-6 pb-[18px]">
        <p className="font-mono text-[9.5px] tracking-[0.2em] text-ink-3">
          RECIPES · {actives.length}件
        </p>
        <h1 className="mt-[7px] font-mincho text-[24px] font-bold tracking-[0.02em]">
          レシピ
        </h1>
      </header>

      <GenerateForm />

      {drafts.length > 0 ? (
        <section className="mt-[26px]">
          <h2 className="font-mono text-[9.5px] tracking-[0.2em] text-ink-3">
            承認待ち · {drafts.length}件
          </h2>
          {drafts.map((recipe) => (
            <div
              className="mt-[9px] rounded-card border border-[#E2D3AE] bg-[#FCF9F1] p-4"
              key={recipe.id}
            >
              <div className="flex items-center gap-2.5">
                <div>
                  <p className="text-[14.5px] font-medium">{recipe.name}</p>
                  <p className="mt-1 font-mono text-[10.5px] text-ink-3">
                    {CATEGORY_LABEL[recipe.category]} ·{" "}
                    {DISH_TYPE_LABEL[recipe.dish_type]} · {recipe.cook_time_min}
                    分 · AI生成
                  </p>
                </div>
                <span className="ml-auto rounded-[5px] bg-[#F6ECD9] px-2 py-[3px] font-mono text-[9.5px] tracking-[0.1em] text-[#8A6212]">
                  未確認
                </span>
              </div>
              <div className="mt-3 flex gap-[9px]">
                <Link
                  className="flex-1 rounded-[9px] border border-line py-2.5 text-center text-[12.5px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
                  href={`/recipes/${recipe.id}`}
                >
                  内容を確認
                </Link>
                <ApproveButton recipeId={recipe.id} />
              </div>
            </div>
          ))}
          <p className="mt-3.5 rounded-[10px] bg-[#EDF0EA] px-[13px] py-3 text-[11.5px] leading-[1.8] text-ink-2">
            AI が作ったレシピは下書きとして保存されます。承認するまで献立には使われません。分量を確かめてから承認してください。
          </p>
        </section>
      ) : null}

      <section className="mt-[26px]">
        <h2 className="font-mono text-[9.5px] tracking-[0.2em] text-ink-3">
          登録済み
        </h2>

        {actives.length === 0 ? (
          <p className="mt-3 text-[12.5px] leading-[1.9] text-ink-2">
            レシピはまだありません。
            <br />
            品名を入れて作るか、手で登録すると献立に使えます。
          </p>
        ) : (
          <ul>
            {actives.map((recipe) => (
              <li key={recipe.id}>
                <Link
                  className="flex items-center gap-3 border-b border-line py-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
                  href={`/recipes/${recipe.id}`}
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
