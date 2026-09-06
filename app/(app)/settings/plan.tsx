"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { Household } from "@/lib/supabase/types";

import { Note, PrimaryButton, Row, Section, fieldClass, labelClass } from "./ui";

/* 世帯・食の条件・献立の方針（仕様書 5.2-9）。

   ここで決めた値は献立生成のハード制約とスコアリングに効く（7.1 / 7.2）。
   重み付けそのものは仕様書の値であり、画面からは変えられない（0.3）。 */

type Draft = {
  servings: number;
  repeat_gap_days: number;
  ratio_washoku: number;
  ratio_yoshoku: number;
  ratio_chuka: number;
  weekday_max_minutes: number;
  weekend_max_minutes: number | null;
  include_seasoning_in_shopping: boolean;
  allergies: string[];
  disliked: string[];
};

export function PlanSection({
  household,
  onSaved,
}: {
  household: Household;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>({
    servings: household.servings,
    repeat_gap_days: household.repeat_gap_days,
    ratio_washoku: household.ratio_washoku,
    ratio_yoshoku: household.ratio_yoshoku,
    ratio_chuka: household.ratio_chuka,
    weekday_max_minutes: household.weekday_max_minutes,
    weekend_max_minutes: household.weekend_max_minutes,
    include_seasoning_in_shopping: household.include_seasoning_in_shopping,
    allergies: household.allergies,
    disliked: household.disliked,
  });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage("");
  }

  async function save() {
    setPending(true);
    setError("");
    setMessage("");

    const supabase = createClient();
    const { error: saveError } = await supabase
      .from("households")
      .update(draft)
      .eq("id", household.id);

    setPending(false);
    if (saveError) {
      setError("保存できませんでした。時間を置いて試してください。");
      return;
    }
    setMessage("保存しました");
    onSaved();
  }

  return (
    <>
      <Section title="世帯">
        <Row label="人数">
          <NumberField
            max={8}
            min={1}
            onChange={(value) => set("servings", value)}
            suffix="人"
            value={draft.servings}
          />
        </Row>
        <Row label="調味料を買い物リストに出す">
          <Toggle
            checked={draft.include_seasoning_in_shopping}
            label="調味料を買い物リストに出す"
            onChange={(value) => set("include_seasoning_in_shopping", value)}
          />
        </Row>
      </Section>

      <Section
        note="ここで決めた値が週の組み方に効きます。"
        title="献立の方針"
      >
        <Row label="同じ主菜を空ける日数">
          <NumberField
            max={60}
            min={1}
            onChange={(value) => set("repeat_gap_days", value)}
            suffix="日"
            value={draft.repeat_gap_days}
          />
        </Row>
        <Row label="平日の調理時間の上限">
          <NumberField
            max={180}
            min={5}
            onChange={(value) => set("weekday_max_minutes", value)}
            suffix="分"
            value={draft.weekday_max_minutes}
          />
        </Row>
        <Row label="休日の調理時間の上限">
          <NullableMinutes
            onChange={(value) => set("weekend_max_minutes", value)}
            value={draft.weekend_max_minutes}
          />
        </Row>
        <div className="border-b border-line/60 py-3 last:border-0">
          <span className="text-[13.5px] text-ink">和洋中の比率</span>
          <p className="mt-1 text-[11.5px] leading-[1.8] text-ink-3">
            7日をこの比で割り振ります。既定は{" "}
            <span className="whitespace-nowrap">和4・洋1・中2 です。</span>
          </p>
          <div className="mt-2.5 flex gap-2">
            <RatioField
              label="和"
              onChange={(value) => set("ratio_washoku", value)}
              value={draft.ratio_washoku}
            />
            <RatioField
              label="洋"
              onChange={(value) => set("ratio_yoshoku", value)}
              value={draft.ratio_yoshoku}
            />
            <RatioField
              label="中"
              onChange={(value) => set("ratio_chuka", value)}
              value={draft.ratio_chuka}
            />
          </div>
        </div>
      </Section>

      <Section
        note="ここに入れた食材を含むレシピは、献立に選ばれません。"
        title="食の条件"
      >
        <ChipList
          label="アレルギー"
          onChange={(value) => set("allergies", value)}
          placeholder="えび"
          values={draft.allergies}
        />
        <ChipList
          label="苦手な食材"
          onChange={(value) => set("disliked", value)}
          placeholder="セロリ"
          values={draft.disliked}
        />
      </Section>

      <div className="mt-5">
        <PrimaryButton disabled={pending} onClick={save}>
          {pending ? "保存しています" : "この内容で保存"}
        </PrimaryButton>
        {message ? <Note tone="ok">{message}</Note> : null}
        {error ? <Note tone="error">{error}</Note> : null}
      </div>
    </>
  );
}

function NumberField({
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <input
        className="w-[68px] rounded-[9px] border border-line bg-card px-2.5 py-2 text-right text-[14px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
        inputMode="numeric"
        max={max}
        min={min}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        type="number"
        value={value}
      />
      <span className="text-[12px] text-ink-3">{suffix}</span>
    </span>
  );
}

function NullableMinutes({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  if (value === null) {
    return (
      <button
        className="min-h-[38px] rounded-[9px] border border-line px-3 text-[12.5px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
        onClick={() => onChange(60)}
        type="button"
      >
        制限なし
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1.5">
      <NumberField
        max={300}
        min={5}
        onChange={onChange}
        suffix="分"
        value={value}
      />
      <button
        className="min-h-[38px] whitespace-nowrap px-1.5 font-mono text-[10px] tracking-[0.1em] text-ai focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
        onClick={() => onChange(null)}
        type="button"
      >
        制限なしにする
      </button>
    </span>
  );
}

function RatioField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-1 items-center gap-1.5">
      <span className="font-mincho text-[15px] text-ink">{label}</span>
      <input
        className="w-full rounded-[9px] border border-line bg-card px-2.5 py-2 text-right text-[14px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
        inputMode="numeric"
        min={0}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next) && next >= 0) onChange(next);
        }}
        type="number"
        value={value}
      />
    </label>
  );
}

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={checked}
      className={`h-[30px] w-[52px] rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai ${
        checked ? "border-ai bg-ai" : "border-line bg-chip"
      }`}
      onClick={() => onChange(!checked)}
      type="button"
    >
      <span
        className={`block h-[22px] w-[22px] rounded-full bg-white transition-transform ${
          checked ? "translate-x-[25px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}

function ChipList({
  label,
  values,
  placeholder,
  onChange,
}: {
  label: string;
  values: string[];
  placeholder: string;
  onChange: (values: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const inputId = `chip-${label}`;

  function add() {
    const value = input.trim();
    if (!value || values.includes(value)) {
      setInput("");
      return;
    }
    onChange([...values, value]);
    setInput("");
  }

  return (
    <div className="border-b border-line/60 py-3 last:border-0">
      <label className={labelClass} htmlFor={inputId}>
        {label}
      </label>

      {values.length > 0 ? (
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {values.map((value) => (
            <button
              aria-label={`${value} を外す`}
              className="min-h-[32px] rounded-[7px] bg-chip px-2.5 text-[12px] text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
              key={value}
              onClick={() => onChange(values.filter((v) => v !== value))}
              type="button"
            >
              {value} ×
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex gap-2">
        <input
          className={fieldClass}
          id={inputId}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          value={input}
        />
        <button
          className="min-h-[44px] shrink-0 rounded-[9px] border border-line px-4 text-[12.5px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          onClick={add}
          type="button"
        >
          追加
        </button>
      </div>
    </div>
  );
}
