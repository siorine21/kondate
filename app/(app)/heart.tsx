"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { MealThanks } from "@/lib/supabase/types";

/* 今日のごはんにハートを贈る（変更記録 3.29）。

   作ってくれた人へ、特に美味しかったことを伝えるためのもの。
   レシピの★評価とは別で、献立の選ばれやすさには効かない。
   贈り物が組み立ての材料になると、素直に押せなくなる。

   1日ひとり1回。連打できると「特に」が伝わらない。 */

const NEEDS_TABLE =
  "この機能を使うには supabase/setup/13_meal_thanks.sql を実行してください。";

export function HeartButton({
  householdId,
  date,
  recipeId,
  mine,
  received,
  names,
  onChanged,
}: {
  householdId: string;
  date: string;
  recipeId: string | null;
  /* 自分が贈ったもの。まだなら null。 */
  mine: MealThanks | null;
  /* 相手から届いたもの。 */
  received: MealThanks[];
  names: Record<string, string>;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const describe = (message: string) =>
    message.includes("meal_thanks") ? NEEDS_TABLE : message;

  async function send() {
    setPending(true);
    setError("");
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const { error: saveError } = await supabase.from("meal_thanks").insert({
      household_id: householdId,
      date,
      recipe_id: recipeId,
      note: note.trim() === "" ? null : note.trim(),
      created_by: session?.user.id ?? "",
    });

    setPending(false);
    if (saveError) {
      setError(describe(saveError.message));
      return;
    }
    setOpen(false);
    setNote("");
    onChanged();
  }

  /* 押し間違いは取り消せる。取り消したことは相手に知らせない。 */
  async function undo() {
    if (!mine) return;
    setPending(true);
    setError("");
    const supabase = createClient();
    const { error: saveError } = await supabase
      .from("meal_thanks")
      .delete()
      .eq("id", mine.id);
    setPending(false);
    if (saveError) {
      setError(describe(saveError.message));
      return;
    }
    onChanged();
  }

  return (
    <section className="mt-3 rounded-card border border-line bg-card p-4">
      {/* 届いているハート。相手からのものだけを出す。 */}
      {received.length > 0 ? (
        <ul className="mb-3 flex flex-col gap-2">
          {received.map((thanks) => (
            <li className="flex items-start gap-2.5" key={thanks.id}>
              <Heart filled />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-[1.6] text-ink">
                  {names[thanks.created_by] ?? "相手"}
                  からハートが届いています
                </p>
                {thanks.note ? (
                  <p className="mt-[3px] text-[12.5px] leading-[1.8] text-ink-2">
                    「{thanks.note}」
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {mine ? (
        <div className="flex items-center gap-2.5">
          <Heart filled />
          <p className="min-w-0 flex-1 text-[13px] leading-[1.6] text-ink">
            ハートを贈りました
            {mine.note ? (
              <span className="mt-[3px] block text-[12.5px] leading-[1.8] text-ink-2">
                「{mine.note}」
              </span>
            ) : null}
          </p>
          <button
            className="min-h-[38px] flex-shrink-0 rounded-[8px] border border-line px-2.5 text-[11.5px] text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
            disabled={pending}
            onClick={() => void undo()}
            type="button"
          >
            取り消す
          </button>
        </div>
      ) : open ? (
        <>
          <label
            className="mb-1.5 block font-mono text-[9.5px] tracking-[0.14em] text-ink-3"
            htmlFor="heart-note"
          >
            ひとこと（なくてもかまいません）
          </label>
          <input
            className="w-full rounded-[9px] border border-line bg-card px-3 py-2.5 text-[14px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
            id="heart-note"
            maxLength={60}
            onChange={(event) => setNote(event.target.value)}
            placeholder="味がしみていました"
            value={note}
          />
          <div className="mt-2.5 flex gap-2">
            <button
              className="min-h-[44px] flex-1 rounded-[9px] border border-line text-[12.5px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                setNote("");
                setError("");
              }}
              type="button"
            >
              やめる
            </button>
            <button
              className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-[9px] bg-heart text-[12.5px] font-medium text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
              disabled={pending}
              onClick={() => void send()}
              type="button"
            >
              {pending ? "贈っています" : "ハートを贈る"}
            </button>
          </div>
        </>
      ) : (
        <>
          <button
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[9px] border border-heart text-[13px] text-heart focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
            onClick={() => {
              setOpen(true);
              setError("");
            }}
            type="button"
          >
            <Heart />
            今日のごはんにハートを贈る
          </button>
          <p className="mt-1.5 text-[11px] leading-[1.7] text-ink-3">
            特に美味しかった日に。1日に1回まで贈れます。
          </p>
        </>
      )}

      {error ? (
        <p className="mt-2 text-[11.5px] leading-[1.6] text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/* ハートの形。端末によって形も色も変わるので、絵文字は使わず自分で描く
   （鍵のアイコンと同じ判断・変更記録 3.12）。 */
export function Heart({ filled, size = 16 }: { filled?: boolean; size?: number }) {
  return (
    <svg
      aria-hidden
      className="flex-shrink-0 text-heart"
      fill={filled ? "currentColor" : "none"}
      height={size}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.8}
      viewBox="0 0 24 24"
      width={size}
    >
      <path d="M12 20.5 4.2 13a4.8 4.8 0 0 1 0-6.8 4.8 4.8 0 0 1 6.8 0l1 1 1-1a4.8 4.8 0 0 1 6.8 0 4.8 4.8 0 0 1 0 6.8Z" />
    </svg>
  );
}
