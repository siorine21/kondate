import type { Metadata } from "next";

import { ResetForm } from "./reset-form";

export const metadata: Metadata = {
  title: "パスワードの再設定｜献立",
};

/* メールのリンクから来る画面。新規登録の導線ではない（仕様書 2.2-1）。 */
export default function ResetPage() {
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

      <div className="mt-12">
        <ResetForm />
      </div>
    </main>
  );
}
