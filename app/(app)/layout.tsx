"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

/* ログイン必須の画面をまとめて守る。

   静的配信なのでミドルウェアが使えない。ブラウザ側で判定して
   未ログインならログイン画面へ送る。

   ただしこれは「見せない」だけの措置であり、防壁ではない。
   世帯のデータを守っているのは RLS で、ここを迂回されても
   DB からは1行も返らない（仕様書 3.3）。 */

type Phase = "checking" | "signed-in";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      if (data.user) setPhase("signed-in");
      else router.replace("/login");
    });

    /* ログアウトや別端末での失効に追従する。 */
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!active) return;
        if (session) setPhase("signed-in");
        else router.replace("/login");
      },
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  if (phase === "checking") {
    /* 判定中に中身を見せない。一瞬の空白で済むよう文言は置かない。 */
    return <div className="min-h-dvh" />;
  }

  return <>{children}</>;
}
