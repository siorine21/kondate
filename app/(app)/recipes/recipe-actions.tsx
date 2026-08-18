"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/* レシピ管理画面の操作部分。
   生成と承認はサーバーを叩くだけなので、状態はこの中に閉じる。 */

type GenerateResponse = { id?: string; error?: string };

export function GenerateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setMessage("");
    const response = await fetch("/api/recipes/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });

    const body: GenerateResponse = await response.json().catch(() => ({}));

    if (!response.ok) {
      setMessage(body.error ?? "レシピを作れませんでした。");
      return;
    }

    setName("");
    setMessage("下書きに追加しました。内容を確認してください。");
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={submit}>
      <label
        className="mb-1.5 block font-mono text-[9.5px] tracking-[0.14em] text-ink-3"
        htmlFor="recipe-name"
      >
        品名からレシピを作る
      </label>
      <input
        className="w-full rounded-[10px] border border-line bg-card px-[13px] py-3 text-[14px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
        id="recipe-name"
        onChange={(event) => setName(event.target.value)}
        placeholder="鶏肉のトマト煮込み"
        value={name}
      />
      <button
        className="mt-2.5 w-full rounded-[9px] bg-ai py-2.5 text-[12.5px] font-medium tracking-[0.03em] text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
        disabled={pending || name.trim().length === 0}
        type="submit"
      >
        {pending ? "作成しています" : "AIでレシピを生成"}
      </button>

      {message ? (
        <p className="mt-3 text-[12px] leading-[1.7] text-ink-2" role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}

export function ApproveButton({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function approve() {
    setPending(true);
    setError("");
    const response = await fetch(`/api/recipes/${recipeId}/approve`, {
      method: "POST",
    });
    setPending(false);

    if (!response.ok) {
      setError("承認できませんでした。時間を置いて試してください。");
      return;
    }
    router.refresh();
  }

  return (
    <>
      <button
        className="flex-1 rounded-[9px] bg-ai py-2.5 text-[12.5px] font-medium text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
        disabled={pending}
        onClick={approve}
        type="button"
      >
        {pending ? "承認しています" : "承認して使う"}
      </button>
      {error ? (
        <p className="mt-2 w-full text-[12px] text-meat" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
