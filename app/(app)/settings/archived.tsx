"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

import { Note, Section } from "./ui";

/* もう作らない料理の一覧（仕様書 5.2-9）。
   削除ではなくアーカイブなので、いつでも候補に戻せる。 */

export function ArchivedSection({
  recipes,
  onRestored,
}: {
  recipes: readonly { id: string; name: string }[];
  onRestored: () => void;
}) {
  const [pendingId, setPendingId] = useState("");
  const [error, setError] = useState("");

  async function restore(id: string) {
    setPendingId(id);
    setError("");

    const supabase = createClient();
    const { error: saveError } = await supabase
      .from("recipes")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", id);

    setPendingId("");
    if (saveError) {
      setError("戻せませんでした。時間を置いて試してください。");
      return;
    }
    onRestored();
  }

  return (
    <Section title="もう作らない料理">
      {recipes.length === 0 ? (
        <p className="text-[12.5px] leading-[1.9] text-ink-2">
          候補から外した料理はありません。
          <br />
          レシピの詳細から外すと、ここに並びます。
        </p>
      ) : (
        <ul>
          {recipes.map((recipe) => (
            <li
              className="flex items-center gap-3 border-b border-line/60 py-2.5 last:border-0"
              key={recipe.id}
            >
              <span className="text-[13.5px] text-ink">{recipe.name}</span>
              <button
                className="ml-auto min-h-[38px] rounded-[9px] border border-line px-3 text-[12px] text-ink disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
                disabled={pendingId === recipe.id}
                onClick={() => restore(recipe.id)}
                type="button"
              >
                {pendingId === recipe.id ? "戻しています" : "候補に戻す"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? <Note tone="error">{error}</Note> : null}
    </Section>
  );
}
