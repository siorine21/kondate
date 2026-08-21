"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

import { Note, PrimaryButton, Row, Section, fieldClass, labelClass } from "./ui";

/* アカウント（仕様書 5.2-9 の「世帯：メンバー」に対応する部分）。

   新規メンバーの追加は仕様書 2.2-1 により実装しない。
   停止中であることを画面に出す。 */

export function AccountSection({
  email,
  displayName,
  onRenamed,
}: {
  email: string;
  displayName: string;
  onRenamed: () => void;
}) {
  return (
    <>
      <Section title="アカウント">
        <Row label="メールアドレス">
          <span className="text-[12.5px] text-ink-2">{email}</span>
        </Row>
        <DisplayName current={displayName} onRenamed={onRenamed} />
        <Row label="新規メンバーの追加">
          <span className="rounded-[5px] bg-[#EDF0EA] px-2 py-[3px] font-mono text-[9.5px] tracking-[0.1em] text-ink-2">
            停止中
          </span>
        </Row>
      </Section>

      <PasswordChange />
      <SignOut />
    </>
  );
}

function DisplayName({
  current,
  onRenamed,
}: {
  current: string;
  onRenamed: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const name = value.trim();
    if (!name) {
      setError("表示名を入力してください");
      return;
    }
    setPending(true);
    setError("");

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setPending(false);
      setError("ログインが切れています。開き直してください。");
      return;
    }

    const { error: saveError } = await supabase
      .from("profiles")
      .update({ display_name: name })
      .eq("user_id", user.id);

    setPending(false);
    if (saveError) {
      setError("変更できませんでした。時間を置いて試してください。");
      return;
    }
    setEditing(false);
    onRenamed();
  }

  if (!editing) {
    return (
      <Row label="表示名">
        <span className="text-[12.5px] text-ink-2">{current}</span>
        <button
          className="min-h-[38px] px-2 font-mono text-[10px] tracking-[0.12em] text-ai focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          onClick={() => {
            setValue(current);
            setEditing(true);
          }}
          type="button"
        >
          変更
        </button>
      </Row>
    );
  }

  return (
    <div className="border-b border-[#EFF1EC] py-3 last:border-0">
      <label className={labelClass} htmlFor="display-name">
        表示名
      </label>
      <input
        className={fieldClass}
        id="display-name"
        onChange={(event) => setValue(event.target.value)}
        value={value}
      />
      <div className="mt-2.5 flex gap-[9px]">
        <button
          className="min-h-[44px] flex-1 rounded-[9px] border border-line text-[12.5px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          onClick={() => setEditing(false)}
          type="button"
        >
          やめる
        </button>
        <button
          className="min-h-[44px] flex-1 rounded-[9px] bg-ai text-[12.5px] font-medium text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          disabled={pending}
          onClick={save}
          type="button"
        >
          {pending ? "変更しています" : "この名前にする"}
        </button>
      </div>
      {error ? <Note tone="error">{error}</Note> : null}
    </div>
  );
}

function PasswordChange() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function save() {
    if (password.length < 8) {
      setError("パスワードは8文字以上にしてください");
      return;
    }
    if (password !== confirm) {
      setError("確認用のパスワードが一致しません");
      return;
    }

    setPending(true);
    setError("");

    const supabase = createClient();
    const { error: saveError } = await supabase.auth.updateUser({ password });

    setPending(false);
    if (saveError) {
      setError(
        saveError.status === 422
          ? "このパスワードは使えません。別のものにしてください。"
          : "変更できませんでした。時間を置いて試してください。",
      );
      return;
    }

    setPassword("");
    setConfirm("");
    setOpen(false);
    setDone(true);
  }

  return (
    <Section title="パスワード">
      {done ? <Note tone="ok">パスワードを変更しました</Note> : null}

      {!open ? (
        <PrimaryButton onClick={() => setOpen(true)}>
          パスワードを変更する
        </PrimaryButton>
      ) : (
        <div>
          <div className="mb-[13px]">
            <label className={labelClass} htmlFor="new-password">
              あたらしいパスワード
            </label>
            <input
              autoComplete="new-password"
              className={fieldClass}
              id="new-password"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </div>
          <div className="mb-[13px]">
            <label className={labelClass} htmlFor="confirm-password">
              確認のためもう一度
            </label>
            <input
              autoComplete="new-password"
              className={fieldClass}
              id="confirm-password"
              onChange={(event) => setConfirm(event.target.value)}
              type="password"
              value={confirm}
            />
          </div>
          <div className="flex gap-[9px]">
            <button
              className="min-h-[44px] flex-1 rounded-[9px] border border-line text-[12.5px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
              onClick={() => {
                setOpen(false);
                setError("");
              }}
              type="button"
            >
              やめる
            </button>
            <button
              className="min-h-[44px] flex-1 rounded-[9px] bg-ai text-[12.5px] font-medium text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
              disabled={pending}
              onClick={save}
              type="button"
            >
              {pending ? "変更しています" : "このパスワードにする"}
            </button>
          </div>
          {error ? <Note tone="error">{error}</Note> : null}
        </div>
      )}
    </Section>
  );
}

function SignOut() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <Section title="ログアウト" note="この端末からログアウトします。">
      <button
        className="min-h-[44px] w-full rounded-[11px] border border-line text-[13.5px] text-ink disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
        disabled={pending}
        onClick={signOut}
        type="button"
      >
        {pending ? "ログアウトしています" : "ログアウト"}
      </button>
    </Section>
  );
}
