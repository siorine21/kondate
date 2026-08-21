"use client";

import { useEffect } from "react";

import { withBasePath } from "@/lib/config";

/* ホーム画面に追加できるようにするための登録。

   Android の Chrome は、マニフェストに加えて fetch を扱う Service Worker が
   ないとインストールを勧めない。iOS の Safari は「ホーム画面に追加」で
   入るため、これが無くても動く。 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register(withBasePath("/sw.js"), { scope: withBasePath("/") })
      .catch(() => {
        /* 登録できなくてもアプリは動く。ホーム画面に置けないだけ。 */
      });
  }, []);

  return null;
}
