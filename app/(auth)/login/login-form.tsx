"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { withBasePath } from "@/lib/config";
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
        className="mt-2 min-h-[48px] w-full rounded-[11px] bg-ai text-[14px] font-medium tracking-[0.03em] text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
        disabled={pending}
        type="submit"
      >
        {pending ? "確認しています" : "ログイン"}
      </button>

      <ForgotPassword email={email} />
    </form>
  );
}

/* パスワードの再設定。宛先が登録済みかどうかは返さない。
   誰が使っているかを外から確かめられないようにするため。 */
function ForgotPassword({ email }: { email: string }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    const address = email.trim();
    if (!address) {
      setError("メールアドレスを入力してから押してください");
      return;
    }

    setSending(true);
    setError("");

    const supabase = createClient();
    const { error: sendError } = await supabase.auth.resetPasswordForEmail(
      address,
      { redirectTo: `${window.location.origin}${withBasePath("/reset/")}` },
    );

    setSending(false);
    if (sendError) {
      setError("送れませんでした。時間を置いてもう一度試してください。");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <p className="mt-5 text-center text-[12px] leading-[1.9] text-ink-2">
        再設定のリンクを送りました。
        <br />
        メールを開いてパスワードを決め直してください。
      </p>
    );
  }

  return (
    <div className="mt-4 text-center">
      <button
        className="min-h-[44px] px-3 text-[12px] text-ink-3 underline underline-offset-4 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
        disabled={sending}
        onClick={send}
        type="button"
      >
        {sending ? "送っています" : "パスワードを忘れた場合"}
      </button>
      {error ? (
        <p className="mt-1 text-[12px] text-meat" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
