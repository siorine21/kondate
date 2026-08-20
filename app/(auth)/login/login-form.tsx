"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

const labelClass =
  "mb-1.5 block font-mono text-[9.5px] tracking-[0.14em] text-ink-3";

const inputClass =
  "w-full rounded-[10px] border border-line bg-card px-[13px] py-3 text-[14px] text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  /* すでにログイン済みならトップへ戻す。 */
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace("/");
    });
  }, [router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setMessage("メールアドレスとパスワードを入力してください");
      return;
    }

    setPending(true);
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setPending(false);
      /* どちらが誤りかは示さない（仕様書 5.2-1）。
         通信不良まで同じ文言にすると原因を誤らせるため、そこは分ける。 */
      setMessage(
        error.status === 400
          ? "メールアドレスまたはパスワードが違います"
          : "ログインできませんでした。時間を置いてもう一度試してください。",
      );
      return;
    }

    router.replace("/");
  }

  return (
    <form noValidate onSubmit={submit}>
      <div className="mb-[13px]">
        <label className={labelClass} htmlFor="email">
          MAIL
        </label>
        <input
          autoComplete="email"
          className={inputClass}
          id="email"
          inputMode="email"
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          value={email}
        />
      </div>

      <div className="mb-[13px]">
        <label className={labelClass} htmlFor="password">
          PASSWORD
        </label>
        <input
          autoComplete="current-password"
          className={inputClass}
          id="password"
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
      </div>

      {message ? (
        <p className="mt-3 text-[12.5px] leading-[1.7] text-meat" role="alert">
          {message}
        </p>
      ) : null}

      <button
        className="mt-2 w-full rounded-[11px] bg-ai py-3.5 text-[14px] font-medium tracking-[0.03em] text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
        disabled={pending}
        type="submit"
      >
        {pending ? "確認しています" : "ログイン"}
      </button>
    </form>
  );
}
