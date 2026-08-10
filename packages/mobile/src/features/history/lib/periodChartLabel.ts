import { WEEKDAYS } from "@/features/history/lib/walkDateLabel";

/**
 * `GET /walks/stats` のバケット `start_date`（`YYYY-MM-DD`、JST 暦日）からチャートのラベルを作る。
 *
 * **重要**: `new Date("2026-08-03")` は UTC 深夜としてパースされ、端末 TZ によって曜日が
 * 1日ずれることがある。サーバーが返す `start_date` は既にJSTの暦日なので、これ以上の
 * タイムゾーン変換をしてはいけない。文字列を y/m/d に分解し `Date.UTC` + `getUTCDay()` で
 * 曜日を求めることで、端末TZに依存せず入力の暦日をそのまま解釈する。
 */
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseIsoDateParts(isoDate: string): { year: number; month: number; day: number } | null {
  const match = ISO_DATE_PATTERN.exec(isoDate);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const utcDate = new Date(Date.UTC(year, month - 1, day));
  // 「2026-13-45」のような桁数は合うが値として不正な日付を弾く（UTC roll-over 検知）。
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

/** 「2026-08-03」→「月」。パース不能なら空文字。 */
export function weekdayLabelFromIsoDate(isoDate: string): string {
  const parts = parseIsoDateParts(isoDate);
  if (!parts) return "";

  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return WEEKDAYS[utcDate.getUTCDay()];
}

/** 週バケットの通し番号ラベル。index 0 起点で「第1週」。 */
export function weekBucketLabel(index: number): string {
  return `第${index + 1}週`;
}
