import type { NextConfig } from "next";

/* GitHub Pages への静的配信。

   サーバーを持たない構成にしたため、Route Handler・ミドルウェア・
   Server Component は使わない。ブラウザが直接 Supabase を叩き、
   世帯のデータは RLS が守る（仕様書 3.3）。

   basePath は公開先が https://<user>.github.io/kondate/ になるため。
   独自ドメインを当てる場合はここを外す。 */
const nextConfig: NextConfig = {
  output: "export",
  basePath: "/kondate",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
