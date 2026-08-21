"use client";

import { useEffect, useState } from "react";

import { Section } from "./ui";

/* ホーム画面への追加（アプリとして開く）。

   Android の Chrome は beforeinstallprompt を投げてくるので、その場で
   出せる。iOS の Safari は投げてこないため、手順を文章で示す。 */

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
};

function isInstallPrompt(event: Event): event is InstallPrompt {
  return "prompt" in event && typeof Reflect.get(event, "prompt") === "function";
}

export function InstallSection() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);

    function onBeforeInstall(event: Event) {
      if (!isInstallPrompt(event)) return;
      event.preventDefault(); // 既定のバナーを止めて、この画面から出す
      setPrompt(event);
    }
    function onInstalled() {
      setInstalled(true);
      setPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <Section title="ホーム画面">
        <p className="text-[12.5px] leading-[1.9] text-ink-2">
          ホーム画面のアイコンから開いています。
        </p>
      </Section>
    );
  }

  return (
    <Section
      note="アドレスバーのないアプリとして開けるようになります。"
      title="ホーム画面に追加"
    >
      {prompt ? (
        <button
          className="min-h-[44px] w-full rounded-[11px] bg-ai text-[13.5px] font-medium tracking-[0.03em] text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          onClick={() => {
            void prompt.prompt();
            setPrompt(null);
          }}
          type="button"
        >
          ホーム画面に追加する
        </button>
      ) : (
        <div className="text-[12.5px] leading-[1.95] text-ink-2">
          <p className="font-medium text-ink">iPhone（Safari）</p>
          <p className="mt-1">
            画面下の共有ボタン（□に↑）を押し、「ホーム画面に追加」を選びます。
          </p>
          <p className="mt-3 font-medium text-ink">Android（Chrome）</p>
          <p className="mt-1">
            右上のメニュー（︙）を押し、「アプリをインストール」または
            「ホーム画面に追加」を選びます。
          </p>
        </div>
      )}
    </Section>
  );
}
