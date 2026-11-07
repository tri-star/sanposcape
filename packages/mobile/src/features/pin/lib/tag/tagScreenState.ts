import { toPinReadErrorCode, type PinReadErrorCode } from "@/features/pin/lib/pinReadError";
import {
  SANPO_MAP_PIN_MAX_PAGES,
  SANPO_MAP_PIN_PAGE_SIZE,
} from "@/features/pin/lib/sanpoMapPinList";
import type { SanpoMapPinGroup, TagSummary } from "@/features/pin/lib/tag/pinTagIndex";
import type { PinListEntry, SanpoMap } from "@/features/pin/types";

type LoadStatus = "loading" | "ready" | "error";

/** 地図ごとのピンの取得結果（`useQueries` の結果の必要部分）。 */
export type SanpoMapPinsQueryResult = {
  data: { pins: PinListEntry[]; truncated: boolean } | undefined;
  error: unknown;
  isPending: boolean;
  isError: boolean;
};

export type CombinedSanpoMapPins = {
  status: LoadStatus;
  errorCode: PinReadErrorCode | null;
  /** 取得できた地図のピン（地図一覧の順）。 */
  groups: SanpoMapPinGroup[];
  /** いずれかの地図が上限（1000 件）で打ち切られた。 */
  truncated: boolean;
};

/**
 * 地図一覧と、地図ごとのピンの取得結果をまとめる（SS-245）。判定順: 地図一覧の error → 地図一覧の loading →
 * 地図のピンの error → 地図のピンの loading → ready。
 * - 地図のピンが 404（取得の間に地図が消えた・外された）の地図は飛ばす（地図一覧の取り直しで消える）。
 * - データがある地図の再取得の失敗は error にしない（一覧を消さない。`useSanpoMapPins` と同じ）。
 * - `results` は `maps` と同じ順・同じ長さ（`useQueries` に渡した順）。
 */
export function combineSanpoMapPins(input: {
  mapsStatus: LoadStatus;
  mapsErrorCode: PinReadErrorCode | null;
  maps: readonly SanpoMap[];
  results: readonly SanpoMapPinsQueryResult[];
}): CombinedSanpoMapPins {
  const groups: SanpoMapPinGroup[] = [];
  let truncated = false;
  let errorCode: PinReadErrorCode | null = null;
  let pending = false;
  input.maps.forEach((sanpoMap, index) => {
    const result = input.results[index];
    if (result === undefined) {
      pending = true;
      return;
    }
    if (result.data !== undefined) {
      groups.push({ sanpoMap, pins: result.data.pins });
      if (result.data.truncated) truncated = true;
      return;
    }
    if (result.isError) {
      const code = toPinReadErrorCode(result.error);
      if (code !== "not_found" && errorCode === null) errorCode = code;
      return;
    }
    if (result.isPending) pending = true;
  });

  if (input.mapsStatus === "error") {
    return { status: "error", errorCode: input.mapsErrorCode, groups, truncated };
  }
  if (input.mapsStatus === "loading") {
    return { status: "loading", errorCode: null, groups, truncated };
  }
  if (errorCode !== null) return { status: "error", errorCode, groups, truncated };
  if (pending) return { status: "loading", errorCode: null, groups, truncated };
  return { status: "ready", errorCode: null, groups, truncated };
}

export type TagListBodyState =
  | "sign-in-required"
  | "loading"
  | "error"
  | "empty"
  | "no-match"
  | "ready";

/**
 * タグ一覧の「今どれを描くか」。判定順: sign-in-required → error → loading → empty（タグ0件）→
 * no-match → ready（地図一覧の `resolveSanpoMapListBodyState` と同じ順）。
 */
export function resolveTagListBodyState(input: {
  isSignedIn: boolean;
  status: LoadStatus;
  tagCount: number;
  matchedCount: number;
}): TagListBodyState {
  if (!input.isSignedIn) return "sign-in-required";
  if (input.status === "error") return "error";
  if (input.status === "loading") return "loading";
  if (input.tagCount === 0) return "empty";
  if (input.matchedCount === 0) return "no-match";
  return "ready";
}

export type TagDetailBodyState =
  | "invalid-label"
  | "sign-in-required"
  | "loading"
  | "error"
  | "empty"
  | "ready";

/** タグ詳細の状態。判定順: invalid-label → sign-in-required → error → loading → empty（該当ピン0件）→ ready。 */
export function resolveTagDetailBodyState(input: {
  hasLabel: boolean;
  isSignedIn: boolean;
  status: LoadStatus;
  pinCount: number;
}): TagDetailBodyState {
  if (!input.hasLabel) return "invalid-label";
  if (!input.isSignedIn) return "sign-in-required";
  if (input.status === "error") return "error";
  if (input.status === "loading") return "loading";
  if (input.pinCount === 0) return "empty";
  return "ready";
}

/** 「ピン 3件」。 */
export function formatTagPinCount(count: number): string {
  return `ピン ${count}件`;
}

/** タグ一覧の該当なしの文言（query は trim 値を出す）。 */
export function tagNoMatchTitle(query: string): string {
  return `「${query.trim()}」に一致するタグがありません`;
}

/** タグの行に名前を出す地図の数。残りは「ほかN件」にまとめる。 */
export const TAG_ROW_MAX_SANPO_MAPS = 3;

/**
 * タグ一覧の行の読み上げ。行全体を1つのボタンにするので、件数・地図名をここに合成する。
 * 「タグ「桜」、ピン 3件、地図 散歩、カフェ」。
 */
export function tagRowAccessibilityLabel(tag: TagSummary): string {
  const names = tag.sanpoMaps.slice(0, TAG_ROW_MAX_SANPO_MAPS).map((map) => map.name);
  const hidden = tag.sanpoMaps.length - names.length;
  const mapsLabel = `地図 ${names.join("、")}${hidden > 0 ? `、ほか${hidden}件` : ""}`;
  return [`タグ「${tag.label}」`, formatTagPinCount(tag.pinCount), mapsLabel].join("、");
}

/** いずれかの地図が上限で打ち切られたときの案内（地図詳細の打ち切りの案内と同じ上限）。 */
export const TAG_PINS_TRUNCATED_NOTICE = `ピンが多い地図は、新しい順に${SANPO_MAP_PIN_PAGE_SIZE * SANPO_MAP_PIN_MAX_PAGES}件までのピンから集めています`;
