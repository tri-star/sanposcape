/**
 * SS-118 で `features/history/lib/walkDateLabel.ts` から昇格（`features/pin` の詳細画面
 * （登録日時）でも使うため2機能ルールに従う。`features/history` 由来の関数名は
 * 汎用名（`formatDateLabel` / `formatTimeLabel` / `formatTimeRangeLabel`）へ変更した。
 */

/**
 * 曜日の日本語表記（`Date.getDay()` の 0=日曜 始まりと対応）。
 * `features/history/lib/periodChartLabel.ts`（週バケットの曜日ラベル生成）とも共有するため export する。
 */
export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * ISO 文字列を Date にする。不正なら null。
 * `Intl.DateTimeFormat` は Hermes での挙動差・ロケール依存を避けるため使わず、
 * 日付・時刻の整形は自前の関数（`formatDateLabel` 等）で行う。
 */
export function parseIsoDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * 「8月2日(日)」形式。`now` と年が異なる場合は「2025年8月2日(土)」のように年を前置する。
 * `now` は既定 `new Date()` だが、テストを決定的にするため必ず引数で受け取れるようにする。
 */
export function formatDateLabel(date: Date, now: Date = new Date()): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = WEEKDAYS[date.getDay()];
  const body = `${month}月${day}日(${weekday})`;

  return date.getFullYear() === now.getFullYear() ? body : `${date.getFullYear()}年${body}`;
}

/** 「14:30」形式（ゼロ埋め）。 */
export function formatTimeLabel(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** 「14:30 – 15:02」形式（en dash + 前後スペースで区切る）。 */
export function formatTimeRangeLabel(start: Date, end: Date): string {
  return `${formatTimeLabel(start)} – ${formatTimeLabel(end)}`;
}
