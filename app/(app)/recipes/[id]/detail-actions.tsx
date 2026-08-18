"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/* 詳細画面の操作。★評価と「もう作らない」。 */

export function RatingStars({
  recipeId,
  initialScore,
}: {
  recipeId: string;
  initialScore: number | null;
}) {
  const [score, setScore] = useState(initialScore);
  const [error, setError] = useState("");

  async function rate(next: number) {
    const previous = score;
    setScore(next); // 押した感触を先に返す
    setError("");

    const response = await fetch(`/api/recipes/${recipeId}/rating`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score: next }),
    });

    if (!response.ok) {
      setScore(previous); // 保存できていないので見た目も戻す
      setError("評価を保存できませんでした。時間を置いて試してください。");
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-[9.5px] tracking-[0.2em] text-ink-3">
          この料理の評価
        </span>
        <div className="ml-auto flex gap-1">
          {[1, 2, 3].map((value) => (
            <button
              aria-label={`${value} をつける`}
              aria-pressed={score === value}
              className="text-[19px] leading-none text-yuzu focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
              key={value}
              onClick={() => rate(value)}
              type="button"
            >
              <span className={score !== null && value <= score ? "" : "text-line"}>
                ★
              </span>
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <p className="mt-2 text-[12px] text-meat" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ArchiveButton({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function archive() {
    setPending(true);
    setError("");
    const response = await fetch(`/api/recipes/${recipeId}/archive`, {
      method: "POST",
    });
    setPending(false);

    if (!response.ok) {
      setError("変更できませんでした。時間を置いて試してください。");
      return;
    }
    router.push("/recipes");
    router.refresh();
  }

  if (!confirming) {
    return (
      <button
        className="flex-1 rounded-[9px] border border-line py-2.5 text-[12.5px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
        onClick={() => setConfirming(true)}
        type="button"
      >
        もう作らない
      </button>
    );
  }

  return (
    <div className="w-full">
      <p className="text-[12.5px] leading-[1.8] text-ink-2">
        このレシピを献立の候補から外します。過去の献立には残ります。
      </p>
      <div className="mt-2.5 flex gap-[9px]">
        <button
          className="flex-1 rounded-[9px] border border-line py-2.5 text-[12.5px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          onClick={() => setConfirming(false)}
          type="button"
        >
          やめる
        </button>
        <button
          className="flex-1 rounded-[9px] bg-meat py-2.5 text-[12.5px] font-medium text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          disabled={pending}
          onClick={archive}
          type="button"
        >
          {pending ? "変更しています" : "候補から外す"}
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-[12px] text-meat" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
