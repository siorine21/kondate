"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  message: string;
};

export const initialLoginState: LoginState = { message: "" };

export async function signIn(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    return { message: "メールアドレスとパスワードを入力してください" };
  }
  if (!email || !password) {
    return { message: "メールアドレスとパスワードを入力してください" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    /* 認証の失敗は、どちらが誤りかを示さない（仕様書 5.2-1）。
       通信不良まで同じ文言にすると原因を誤らせるため、そこは分ける。 */
    if (error.status === 400) {
      return { message: "メールアドレスまたはパスワードが違います" };
    }
    return {
      message: "ログインできませんでした。時間を置いてもう一度試してください。",
    };
  }

  revalidatePath("/", "layout");
  redirect("/");
}
