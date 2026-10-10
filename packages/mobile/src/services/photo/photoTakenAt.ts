/**
 * ピッカーが返す EXIF から撮影日時を取り出す純粋関数（SS-163）。
 * `react-native` も `expo-*` も import しない（vitest から直接テストする）。
 *
 * ★ 引数の EXIF には GPS などの位置情報が含まれうる。ここでは日付と時差のキーしか読まず、
 *   受け取ったオブジェクトを保持・返却・ログ出力しない。
 */

/** 送ってよい撮影日時の範囲（backend と共有する静的な範囲。上端は含まない）。 */
export const TAKEN_AT_MIN_EPOCH_MS = Date.UTC(1900, 0, 1);
export const TAKEN_AT_MAX_EPOCH_MS = Date.UTC(2100, 0, 1);
/** 端末時刻よりこれ以上未来の値は送らない（mobile だけの判定。backend は実行時刻に依存する検証をしない）。 */
export const TAKEN_AT_FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

/** EXIF の時計の値（現地時刻。月は 1 始まり）。 */
export type ExifLocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export type ExtractTakenAtOptions = {
  /** 未来判定の基準。既定 new Date()。 */
  now?: Date;
  /**
   * オフセットが EXIF に無いときに使う「その現地時刻における端末のUTCオフセット（分。東が正）」。
   * 既定は `-new Date(y, m - 1, d, h, mi, s).getTimezoneOffset()`。テストでは固定値の関数を渡す。
   */
  localOffsetMinutes?: (local: ExifLocalDateTime) => number;
};

const DATE_TIME_PATTERN = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;
const OFFSET_PATTERN = /^([+-])(\d{2}):(\d{2})$/;
const MAX_OFFSET_MINUTES = 14 * 60;

/** "YYYY:MM:DD HH:MM:SS"（後ろのサブ秒・空白・NUL は無視）を解釈する。不正・暦にない日付は null。 */
export function parseExifDateTime(value: unknown): ExifLocalDateTime | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = DATE_TIME_PATTERN.exec(value.trim());
  if (match === null) {
    return null;
  }
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (year === 0 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  // 暦にない日付（2月30日など）は Date.UTC の繰り上がりで一致しなくなる。
  const probe = new Date(Date.UTC(year, month - 1, day));
  probe.setUTCFullYear(year);
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day, hour, minute, second };
}

/** "+09:00" / "-05:30" を分に。形式不正・±14:00 超は null。 */
export function parseExifOffset(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = OFFSET_PATTERN.exec(value.trim());
  if (match === null) {
    return null;
  }
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (minutes > 59) {
    return null;
  }
  const total = hours * 60 + minutes;
  if (total > MAX_OFFSET_MINUTES) {
    return null;
  }
  return match[1] === "-" ? -total : total;
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** "2026-07-02T09:14:05+09:00" 形式に整形する（ゼロ埋め。オフセット 0 は "+00:00"）。 */
export function formatTakenAt(local: ExifLocalDateTime, offsetMinutes: number): string {
  return (
    `${pad(local.year, 4)}-${pad(local.month)}-${pad(local.day)}` +
    `T${pad(local.hour)}:${pad(local.minute)}:${pad(local.second)}${formatOffset(offsetMinutes)}`
  );
}

function defaultLocalOffsetMinutes(local: ExifLocalDateTime): number {
  const date = new Date(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );
  return -date.getTimezoneOffset();
}

function readString(exif: Record<string, unknown>, key: string): unknown {
  return exif[key];
}

/**
 * EXIF から撮影日時を取り出す。取れなければ null。
 * 優先順: (DateTimeOriginal, OffsetTimeOriginal) → (DateTimeDigitized, OffsetTimeDigitized)。
 * TIFF の DateTime は使わない（編集アプリで書き換わる更新日時のため）。
 */
export function extractTakenAtFromExif(
  exif: unknown,
  options: ExtractTakenAtOptions = {},
): string | null {
  if (typeof exif !== "object" || exif === null || Array.isArray(exif)) {
    return null;
  }
  const record = exif as Record<string, unknown>;
  const now = options.now ?? new Date();
  const localOffset = options.localOffsetMinutes ?? defaultLocalOffsetMinutes;

  const candidates: [string, string][] = [
    ["DateTimeOriginal", "OffsetTimeOriginal"],
    ["DateTimeDigitized", "OffsetTimeDigitized"],
  ];
  for (const [dateKey, offsetKey] of candidates) {
    const local = parseExifDateTime(readString(record, dateKey));
    if (local === null) {
      continue;
    }
    const offset = parseExifOffset(readString(record, offsetKey)) ?? localOffset(local);
    const epoch =
      Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second) -
      offset * 60_000;
    if (epoch < TAKEN_AT_MIN_EPOCH_MS || epoch >= TAKEN_AT_MAX_EPOCH_MS) {
      continue;
    }
    if (epoch > now.getTime() + TAKEN_AT_FUTURE_TOLERANCE_MS) {
      continue;
    }
    return formatTakenAt(local, offset);
  }
  return null;
}

/** 端末時刻の Date を、端末のオフセット付きの同じ形式にする（カメラで EXIF が取れなかったときの代わり）。 */
export function takenAtFromDate(date: Date): string {
  return formatTakenAt(
    {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
    },
    -date.getTimezoneOffset(),
  );
}
