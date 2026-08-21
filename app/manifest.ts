import type { MetadataRoute } from "next";

import { BASE_PATH, withBasePath } from "@/lib/config";

export const dynamic = "force-static";

/* ホーム画面に置くための宣言。
   静的配信なので basePath を自分で付ける（省くと起動先を見失う）。 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "献立",
    short_name: "献立",
    description: "週間の夕食献立と買い物リストをまとめて用意します。",
    lang: "ja",
    start_url: `${BASE_PATH}/`,
    scope: `${BASE_PATH}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#F1F3EE",
    theme_color: "#F1F3EE",
    icons: [
      {
        src: withBasePath("/icon-192.png"),
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: withBasePath("/icon-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: withBasePath("/icon-maskable-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
