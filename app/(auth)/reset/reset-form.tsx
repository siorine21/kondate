"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

const labelClass =
  "mb-1.5 block font-mono text-[9.5px] tracking-[0.14em] text-ink-3";

const inputClass =
  "w-full rounded-[10px] border border-line bg-card px-[13px] py-3 text-[14px] text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai";

/* メールのリンクを開くと、Supabase のクライアントが URL からセッションを
   組み立てる。そのセッションがある間だけ、パスワードを入れ替えられる。 */

type Phase = "checking" | "ready" | "expired" | "done";

export function ResetForm() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setPhase(data.session ? "ready" : "expired");
    });

    /* URL の解釈が終わってからセッションが入ることがある。 */
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!active || !session) return;
        setPhase((current) => (current === "done" ? current : "ready"));
      },
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password.length < 8) {
      setError("パスワードは8文字以上にしてください");
      return;
    }
    if (password !== confirm) {
      setError("確認用のパスワードが一致しません");
      return;
    }

    setPending(true);
    setError("");

    const supabase = createClient();
    const { error: saveError } = await supabase.auth.updateUser({ password });

    setPending(false);
    if (saveError) {
      setError(
        saveError.status === 422
          ? "このパスワードは使えません。別のものにしてください。"
          : "再設定できませんでした。リンクを開き直してください。",
      );
      return;
    }
    setPhase("done");
  }

  if (phase === "checking") {
    return <div className="min-h-[200px]" />;
  }

  if (phase === "expired") {
    return (
      <div className="text-center">
        <p className="text-[13px] leading-[1.95] text-ink-2">
          このリンクは使えません。
          <br />
          期限が切れているか、すでに使われています。
        </p>
        <button
          className="mt-6 min-h-[48px] w-full rounded-[11px] border border-line text-[13.5px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          onClick={() => router.replace("/login")}
          type="button"
        >
          ログイン画面へ
        </button>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="text-center">
        <p className="text-[13px] leading-[1.95] text-ink-2">
          パスワードを再設定しました。
        </p>
        <button
          className="mt-6 min-h-[48px] w-full rounded-[11px] bg-ai text-[13.5px] font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          onClick={() => router.replace("/")}
          type="button"
        >
          献立をひらく
        </button>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={submit}>
      <p className="mb-5 text-[12.5px] leading-[1.9] text-ink-2">
        あたらしいパスワードを決めてください。
      </p>

      <div className="mb-[13px]">
        <label className={labelClass} htmlFor="new-password">
          あたらしいパスワード
        </label>
        <input
          autoComplete="new-password"
          className={inputClass}
          id="new-password"
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
      </div>

      <div className="mb-[13px]">
        <label className={labelClass} htmlFor="confirm-password">
          確認のためもう一度
        </label>
        <input
          autoComplete="new-password"
          className={inputClass}
          id="confirm-password"
          onChange={(event) => setConfirm(event.target.value)}
          type="password"
          value={confirm}
        />
      </div>

      {error ? (
        <p className="mt-3 text-[12.5px] leading-[1.7] text-meat" role="alert">
          {error}
        </p>
      ) : null}

      <button
        className="mt-2 min-h-[48px] w-full rounded-[11px] bg-ai text-[14px] font-medium tracking-[0.03em] text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
        disabled={pending}
        type="submit"
      >
        {pending ? "再設定しています" : "このパスワードにする"}
      </button>
    </form>
  );
}
