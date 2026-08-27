"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { RecipeRequest } from "@/lib/supabase/types";

/* 「今度これが食べたい」を出すボタン（変更記録 3.20）。

   出したリクエストは週に紐づかない。献立に入って確定するまで効き続け、
   週間献立の上部と、主菜を選び直す一覧の先頭に出る。 */

const NEEDS_TABLE =
  "この機能を使うには supabase/setup/11_recipe_requests.sql を実行してください。";

export function RequestButton({
  recipeId,
  householdId,
  initial,
}: {
  recipeId: string;
  householdId: string;
  initial: RecipeRequest | null;
}) {
  const [request, setRequest] = useState<RecipeRequest | null>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  /* 表がまだ無い間は、何をすればよいかを出す。 */
  const describe = (message: string) =>
    message.includes("recipe_requests") ? NEEDS_TABLE : message;

  async function add() {
    setPending(true);
    setError("");
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const { data, error: saveError } = await supabase
      .from("recipe_requests")
      .insert({
        household_id: householdId,
        recipe_id: recipeId,
        requested_by: session?.user.id ?? null,
      })
      .select("*")
      .single();

    setPending(false);
    if (saveError || !data) {
      setError(describe(saveError?.message ?? "リクエストできませんでした。"));
      return;
    }
    setRequest(data);
  }

  async function cancel() {
    if (!request) return;
    const before = request;
    setRequest(null);
    setError("");

    const supabase = createClient();
    const { error: saveError } = await supabase
      .from("recipe_requests")
      .delete()
      .eq("id", before.id);

    if (saveError) {
      setRequest(before);
      setError(describe(saveError.message));
    }
  }

  return (
    <div>
      {request ? (
        <button
          className="min-h-[44px] w-full rounded-[9px] border border-ai bg-ai-soft text-[12.5px] text-ai focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          disabled={pending}
          onClick={() => void cancel()}
          type="button"
        >
          リクエスト中 — 取り消す
        </button>
      ) : (
        <button
          className="min-h-[44px] w-full rounded-[9px] border border-line text-[12.5px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          disabled={pending}
          onClick={() => void add()}
          type="button"
        >
          {pending ? "出しています" : "食べたいとリクエスト"}
        </button>
      )}

      <p className="mt-1.5 text-[11px] leading-[1.6] text-ink-3">
        {request
          ? "週間献立の上と、主菜を選び直す一覧の先頭に出ます。"
          : "出すと、次に週を組むときに優先して選ばれます。"}
      </p>

      {error ? (
        <p className="mt-1.5 text-[11.5px] leading-[1.6] text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
