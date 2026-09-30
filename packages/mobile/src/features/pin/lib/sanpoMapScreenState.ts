import type { PinReadErrorCode } from "@/features/pin/lib/pinReadError";

type LoadStatus = "loading" | "ready" | "error";

export type SanpoMapListBodyState =
  | "sign-in-required"
  | "loading"
  | "error"
  | "empty"
  | "no-match"
  | "ready";

/**
 * 地図一覧の「今どれを描くか」。判定順（この順序が仕様）:
 * sign-in-required → error → loading → empty → no-match → ready。
 * - error を loading より先に見るのは `WalkHistoryListView` と同じ。
 * - empty は mapCount === 0（検索語の有無に関係なく「地図がまだ無い」を優先）。
 * - no-match は mapCount > 0 && matchedCount === 0。
 */
export function resolveSanpoMapListBodyState(input: {
  isSignedIn: boolean;
  status: LoadStatus;
  /** 絞り込み前の件数 */
  mapCount: number;
  /** 絞り込み後の件数 */
  matchedCount: number;
}): SanpoMapListBodyState {
  if (!input.isSignedIn) return "sign-in-required";
  if (input.status === "error") return "error";
  if (input.status === "loading") return "loading";
  if (input.mapCount === 0) return "empty";
  if (input.matchedCount === 0) return "no-match";
  return "ready";
}

export type SanpoMapDetailBodyState =
  | "invalid-id"
  | "sign-in-required"
  | "not-found"
  | "error"
  | "loading"
  | "ready";

/**
 * 地図詳細の画面全体の状態。判定順: invalid-id → sign-in-required → not-found → error → loading → ready。
 * - not-found: 地図一覧が ready で id が見つからない、またはピン一覧が 404（削除された・member でない）
 * - error: 地図一覧の取得失敗（ピン一覧の失敗は画面全体ではなくピン欄で出す）
 * - loading: 地図一覧の取得中（ピン一覧の取得中はピン欄で出す）
 */
export function resolveSanpoMapDetailBodyState(input: {
  hasSanpoMapId: boolean;
  isSignedIn: boolean;
  mapsStatus: LoadStatus;
  mapFound: boolean;
  pinsErrorCode: PinReadErrorCode | null;
}): SanpoMapDetailBodyState {
  if (!input.hasSanpoMapId) return "invalid-id";
  if (!input.isSignedIn) return "sign-in-required";
  if (input.pinsErrorCode === "not_found") return "not-found";
  if (input.mapsStatus === "ready" && !input.mapFound) return "not-found";
  if (input.mapsStatus === "error") return "error";
  if (input.mapsStatus === "loading") return "loading";
  return "ready";
}

export type SanpoMapPinSectionState = "loading" | "error" | "empty" | "no-match" | "ready";

/** ピン欄の状態。判定順: error → loading → empty（ピン0件）→ no-match → ready。 */
export function resolveSanpoMapPinSectionState(input: {
  status: LoadStatus;
  pinCount: number;
  matchedCount: number;
}): SanpoMapPinSectionState {
  if (input.status === "error") return "error";
  if (input.status === "loading") return "loading";
  if (input.pinCount === 0) return "empty";
  if (input.matchedCount === 0) return "no-match";
  return "ready";
}

/**
 * 詳細のヘッダーに出すピン件数。ピン一覧を読み終えて打ち切っていなければ読み込んだ件数
 * （一覧の pin_count が古くても食い違わないように）、それ以外は地図一覧の pinCount（null なら null）。
 */
export function resolveSanpoMapPinCount(input: {
  listPinCount: number | null;
  pinsStatus: LoadStatus;
  loadedCount: number;
  truncated: boolean;
}): number | null {
  if (input.pinsStatus === "ready" && !input.truncated) return input.loadedCount;
  return input.listPinCount;
}

/** 「ピン 12件」。null なら null（表示しない）。 */
export function formatSanpoMapPinCount(count: number | null): string | null {
  return count === null ? null : `ピン ${count}件`;
}

/** 絞り込み結果の見出し。query が空なら「12 件のピン」、あれば「「桜」に一致: 3 件」。 */
export function formatPinResultHeading(input: { matchedCount: number; query: string }): string {
  const query = input.query.trim();
  return query === ""
    ? `${input.matchedCount} 件のピン`
    : `「${query}」に一致: ${input.matchedCount} 件`;
}

/** 行に出すタグの要約。先頭 max 件（既定3）と、残りの件数。 */
export function summarizePinTags(
  tags: readonly { label: string }[],
  max = 3,
): { visible: string[]; hiddenCount: number } {
  const visible = tags.slice(0, max).map((tag) => tag.label);
  return { visible, hiddenCount: Math.max(0, tags.length - visible.length) };
}

/** 一覧の該当なしの文言（query は正規化前の trim 値を出す）。 */
export function sanpoMapNoMatchTitle(query: string): string {
  return `「${query.trim()}」に一致する地図がありません`;
}

/**
 * 地図一覧の行の読み上げ。行全体を1つのボタンにするので、子の Text（件数・バッジ）が読まれない分を
 * ここに合成する。「地図「桜」、ピン 3件、既定の地図」。
 */
export function sanpoMapRowAccessibilityLabel(map: {
  name: string;
  pinCount: number | null;
  isDefault: boolean;
  role: string;
}): string {
  const parts = [`地図「${map.name}」`];
  const pinCountLabel = formatSanpoMapPinCount(map.pinCount);
  if (pinCountLabel !== null) parts.push(pinCountLabel);
  if (map.isDefault) parts.push("既定の地図");
  if (map.role === "editor") parts.push("招待された地図");
  return parts.join("、");
}

/** 地図詳細のピン行の読み上げ。名前・日時・タグ（表示と同じ先頭3件＋残り件数）を合成する。 */
export function pinRowAccessibilityLabel(input: {
  displayName: string;
  createdAtLabel: string | null;
  tags: readonly { label: string }[];
}): string {
  const parts = [input.displayName];
  if (input.createdAtLabel !== null) parts.push(input.createdAtLabel);
  const { visible, hiddenCount } = summarizePinTags(input.tags);
  if (visible.length > 0) {
    parts.push(`タグ ${visible.join("、")}${hiddenCount > 0 ? `、ほか${hiddenCount}件` : ""}`);
  }
  return parts.join("、");
}
