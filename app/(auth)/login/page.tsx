import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "ログイン｜献立",
};

/* 新規登録の画面・導線は置かない（仕様書 2.2-1）。 */
export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col justify-center px-5 pb-14">
      <div className="text-center">
        <p className="font-mincho text-[38px] font-bold tracking-[0.08em] text-ink">
          献立
        </p>
        <p className="mt-3 font-mono text-[9.5px] tracking-[0.24em] text-ink-3">
          KONDATE
        </p>
      </div>

      <div className="mt-14">
        <LoginForm />
      </div>

      <p className="mt-7 text-center text-[11.5px] leading-[1.9] text-ink-3">
        このアプリは招待された2名のみが利用できます。
        <br />
        新規登録の受付は行っていません。
      </p>
    </main>
  );
}
