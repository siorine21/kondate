import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "./types";

import { requireSupabaseEnv } from "./env";

const LOGIN_PATH = "/login";

/* セッションを更新し、ログイン画面以外を保護する（仕様書 4.2）。

   Server Component は Cookie を書き込めないため、トークンのリフレッシュは
   ここで行い、更新後の Cookie をレスポンスに載せる。 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const { url, anonKey } = requireSupabaseEnv();

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        supabaseResponse = NextResponse.next({ request });

        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() を呼ぶとトークンが検証・更新される。この呼び出しは省略しない。
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLoginPath = pathname === LOGIN_PATH;

  /* API はリダイレクトしない。呼び出し側は JSON を期待しているので、
     ログイン画面への 307 を返すと 401 を受け取れなくなる。
     未認証の判定は各 Route Handler が行い 401 を返す（仕様書 4.2）。 */
  if (pathname.startsWith("/api/")) {
    return supabaseResponse;
  }

  if (!user && !isLoginPath) {
    return redirectTo(LOGIN_PATH, request, supabaseResponse);
  }

  if (user && isLoginPath) {
    return redirectTo("/", request, supabaseResponse);
  }

  return supabaseResponse;
}

/* リダイレクトしても、更新されたセッション Cookie は落とさない。 */
function redirectTo(
  pathname: string,
  request: NextRequest,
  sessionResponse: NextResponse,
) {
  const target = request.nextUrl.clone();
  target.pathname = pathname;
  target.search = "";

  const response = NextResponse.redirect(target);

  for (const cookie of sessionResponse.cookies.getAll()) {
    response.cookies.set(cookie);
  }

  return response;
}
