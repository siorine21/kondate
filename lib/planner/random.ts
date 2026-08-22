/* 種を渡せる乱数（仕様書 13 章「同一シードで同一結果になること」）。

   Math.random を直に使うと、同じ条件で組み直しても結果が変わり、
   不具合を追えなくなる。生成のたびに種を1つ決め、そこから引く。 */

export type Random = () => number;

/* mulberry32。短くて分布が素直なので、この用途には十分。 */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
