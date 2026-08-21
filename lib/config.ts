/* 公開先が https://siorine21.github.io/kondate/ のため basePath を持つ。
   独自ドメインを当てるときはここだけ変える。
   next.config.ts と マニフェスト・Service Worker の登録が同じ値を見る。 */
export const BASE_PATH = "/kondate";

export function withBasePath(path: string): string {
  return `${BASE_PATH}${path}`;
}
