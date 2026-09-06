"use client";

import { useCallback, useEffect, useState } from "react";

import { BackLink } from "@/app/(app)/back-link";
import { createClient } from "@/lib/supabase/client";
import type { Household } from "@/lib/supabase/types";

import { AccountSection } from "./account";
import { ArchivedSection } from "./archived";
import { InstallSection } from "./install";
import { PlanSection } from "./plan";
import { RecomputeSection } from "./recompute";

/* 設定（仕様書 5.2-9）。

   仕様書 12章では Phase 7 の作業だが、依頼者の指示により先に作る。
   世帯の値は献立生成に効くため、Phase 3 に入る前に触れる形にしておく。 */

type Loaded = {
  household: Household;
  email: string;
  displayName: string;
  archived: { id: string; name: string }[];
};

export default function SettingsPage() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    /* 画面に出すメールアドレスを取るだけ。手元のセッションで足りる。 */
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const [
      { data: household, error: householdError },
      { data: profile },
      { data: archived },
    ] = await Promise.all([
      supabase.from("households").select("*").maybeSingle(),
      /* 世帯の全員が並ぶので、自分の行を指定する。
         指定しないと2人目が増えた時点で1行に絞れず落ちる。 */
      supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", session?.user.id ?? "")
        .maybeSingle(),
      supabase
        .from("recipes")
        .select("id, name")
        .eq("status", "archived")
        .order("updated_at", { ascending: false }),
    ]);

    if (householdError) {
      setError("設定を読み込めませんでした。開き直してください。");
      return;
    }

    /* 世帯に紐付いていないと RLS が1行も返さない。
       読み込みの失敗と区別して伝える。 */
    if (!household) {
      setError(
        "このアカウントはまだ世帯に紐付いていません。はじめに設定した方に、このメールアドレスの紐付けを頼んでください。",
      );
      return;
    }

    setData({
      household,
      email: session?.user.email ?? "",
      displayName: profile?.display_name ?? "",
      archived: archived ?? [],
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto w-full max-w-[430px] px-5 pb-20">
      <BackLink fallback="today" />

      <header className="pb-[6px]">
        <p className="font-mono text-[9.5px] tracking-[0.2em] text-ink-3">
          SETTINGS
        </p>
        <h1 className="mt-[7px] font-mincho text-[24px] font-bold tracking-[0.02em]">
          設定
        </h1>
      </header>

      {error ? (
        <p className="mt-4 text-[12.5px] text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {data === null ? (
        <p className="mt-6 text-[12.5px] text-ink-3">読み込んでいます</p>
      ) : (
        <>
          <AccountSection
            displayName={data.displayName}
            email={data.email}
            onRenamed={load}
          />
          <PlanSection household={data.household} onSaved={load} />
          <ArchivedSection onRestored={load} recipes={data.archived} />
          <RecomputeSection onDone={load} />
          <InstallSection />
        </>
      )}
    </main>
  );
}
