"use client";

import { useState } from "react";

import { guessFoodGroups } from "@/lib/food-groups";
import { FOOD_GROUP_LABEL } from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";

import { Note, PrimaryButton, Section } from "./ui";

/* 登録済みレシピの食品群を、材料からまとめて計算し直す（変更記録 3.27）。

   自動判定（3.21）は登録・編集のときにしか効かない。それ以前に手で入れた
   レシピは古い値のままで、栄養サマリ（10章）がその値を読む。

   21件を書き換えるので、押したらすぐ直すのではなく、
   何がどう変わるかを先に出してから確かめる。 */

type Change = {
  id: string;
  name: string;
  before: number[];
  after: number[];
};

const show = (groups: readonly number[]) =>
  groups.length === 0
    ? "なし"
    : groups.map((g) => FOOD_GROUP_LABEL[g]?.split(" ")[0] ?? g).join("・");

export function RecomputeSection({ onDone }: { onDone: () => void }) {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [checked, setChecked] = useState(0);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState("");

  async function preview() {
    setPending(true);
    setError("");
    setDone(0);

    const supabase = createClient();
    /* もう作らない料理も直しておく。戻したときに古い値が残らないように。 */
    const [{ data: recipes, error: recipeError }, { data: ingredients }] =
      await Promise.all([
        supabase.from("recipes").select("id, name, food_groups"),
        supabase.from("recipe_ingredients").select("recipe_id, name"),
      ]);

    setPending(false);
    if (recipeError || !recipes) {
      setError("レシピを読み込めませんでした。開き直してください。");
      return;
    }

    const names = new Map<string, string[]>();
    for (const row of ingredients ?? []) {
      names.set(row.recipe_id, [...(names.get(row.recipe_id) ?? []), row.name]);
    }

    const found: Change[] = [];
    for (const recipe of recipes) {
      const after = guessFoodGroups(names.get(recipe.id) ?? []);
      const before = [...recipe.food_groups].sort((a, b) => a - b);
      if (before.join(",") !== after.join(",")) {
        found.push({ id: recipe.id, name: recipe.name, before, after });
      }
    }

    setChecked(recipes.length);
    setChanges(found);
  }

  async function apply() {
    if (!changes) return;
    setPending(true);
    setError("");

    const supabase = createClient();
    let saved = 0;
    for (const change of changes) {
      const { error: saveError } = await supabase
        .from("recipes")
        .update({
          food_groups: change.after,
          updated_at: new Date().toISOString(),
        })
        .eq("id", change.id);
      if (saveError) {
        setPending(false);
        /* どこまで直したかを伝える。全部やり直しても結果は同じ。 */
        setError(
          `${saved} 件まで直したところで保存できませんでした。もう一度押すと続きから直せます。`,
        );
        setChanges(null);
        return;
      }
      saved += 1;
    }

    setPending(false);
    setDone(saved);
    setChanges(null);
    onDone();
  }

  return (
    <Section
      note="材料から食品群を計算し直します。自動判定を入れる前に登録したレシピは古い値のままで、栄養サマリがその値を読んでいます。"
      title="食品群の計算し直し"
    >
      {changes === null ? (
        <>
          <PrimaryButton disabled={pending} onClick={() => void preview()}>
            {pending ? "調べています" : "変わるところを調べる"}
          </PrimaryButton>
          <p className="mt-2 text-[11.5px] leading-[1.7] text-ink-3">
            調べるだけでは何も書き換えません。
          </p>
          {done > 0 ? <Note tone="ok">{done} 件を直しました。</Note> : null}
        </>
      ) : changes.length === 0 ? (
        <>
          <p className="text-[13px] leading-[1.8] text-ink">
            {checked} 件を調べました。直すところはありません。
          </p>
          <button
            className="mt-3 w-full rounded-[11px] border border-line py-3 text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
            onClick={() => setChanges(null)}
            type="button"
          >
            閉じる
          </button>
        </>
      ) : (
        <>
          <p className="text-[13px] leading-[1.8] text-ink">
            {checked} 件のうち {changes.length} 件が変わります。
          </p>
          <ul className="mt-2.5 flex flex-col gap-2.5">
            {changes.map((change) => (
              <li className="border-b border-line/60 pb-2.5 last:border-0" key={change.id}>
                <p className="text-[13px] text-ink">{change.name}</p>
                <p className="mt-[3px] text-[11.5px] leading-[1.7] text-ink-2">
                  <span className="text-ink-3">{show(change.before)}</span>
                  {" → "}
                  <span className="text-ink">{show(change.after)}</span>
                </p>
              </li>
            ))}
          </ul>

          <div className="mt-3.5">
            <PrimaryButton disabled={pending} onClick={() => void apply()}>
              {pending ? "直しています" : `この ${changes.length} 件を直す`}
            </PrimaryButton>
          </div>
          <button
            className="mt-2 w-full rounded-[11px] border border-line py-3 text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
            disabled={pending}
            onClick={() => setChanges(null)}
            type="button"
          >
            やめる
          </button>
        </>
      )}

      {error ? <Note tone="error">{error}</Note> : null}
    </Section>
  );
}
