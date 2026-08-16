"use client";

import { useActionState } from "react";

import { initialLoginState, signIn } from "./actions";

const labelClass =
  "mb-1.5 block font-mono text-[9.5px] tracking-[0.14em] text-ink-3";

const inputClass =
  "w-full rounded-[10px] border border-line bg-card px-[13px] py-3 text-[14px] text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initialLoginState);

  return (
    <form action={formAction} noValidate>
      <div className="mb-[13px]">
        <label className={labelClass} htmlFor="email">
          MAIL
        </label>
        <input
          className={inputClass}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          aria-describedby={state.message ? "login-error" : undefined}
        />
      </div>

      <div className="mb-[13px]">
        <label className={labelClass} htmlFor="password">
          PASSWORD
        </label>
        <input
          className={inputClass}
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-describedby={state.message ? "login-error" : undefined}
        />
      </div>

      {state.message ? (
        <p
          className="mt-3 text-[12.5px] leading-[1.7] text-meat"
          id="login-error"
          role="alert"
        >
          {state.message}
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
