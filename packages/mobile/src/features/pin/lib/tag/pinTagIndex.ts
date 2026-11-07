import { isTagLabelWithinMaxLength, normalizeTagLabel, tagKey } from "@/features/pin/lib/pinTags";
import { matchesNameQuery, normalizeNameQuery } from "@/features/pin/lib/sanpoMapSearch";
import type { PinListEntry, SanpoMap, SanpoMapIconKey } from "@/features/pin/types";

/**
 * タグ一覧・タグ詳細（SS-245）の集計。自分がメンバーの全地図のピン（地図詳細と同じ全件取得。上限 1000 件/地図）を
 * 端末でタグの正規化キー（`tagKey`。backend の `tag_key` と同じ）ごとにまとめる。
 * 地図をまたいで同じキーのタグは1つにまとめ、どの地図で使われているかを持つ。
 */

/** 1つの地図と、その地図のピン（取得できた分）。 */
export type SanpoMapPinGroup = {
  sanpoMap: SanpoMap;
  pins: readonly PinListEntry[];
};

/** タグの行・ピンの行に出す地図（見分けるためのアイコンと名前）。 */
export type TagSanpoMapRef = { id: string; name: string; icon: SanpoMapIconKey };

export type TagSummary = {
  /** 正規化キー（`tagKey`）。 */
  key: string;
  /** 表示する表記。同じキーのタグのうち、いちばん新しいピンに付いているもの。 */
  label: string;
  /** このタグが付いたピンの数（全地図の合計）。 */
  pinCount: number;
  /** このタグが使われている地図（地図一覧の順）。 */
  sanpoMaps: TagSanpoMapRef[];
};

/** タグ詳細の1行（ピンと、そのピンの地図）。 */
export type TaggedPin = {
  pin: PinListEntry;
  sanpoMap: TagSanpoMapRef;
};

function toSanpoMapRef(map: SanpoMap): TagSanpoMapRef {
  return { id: map.id, name: map.name, icon: map.icon };
}

function createdAtMs(pin: PinListEntry): number {
  const ms = Date.parse(pin.createdAt);
  return Number.isNaN(ms) ? 0 : ms;
}

/** 作成日時の新しい順（同時刻は id の昇順で決める）。 */
function compareByCreatedAtDesc(a: PinListEntry, b: PinListEntry): number {
  const diff = createdAtMs(b) - createdAtMs(a);
  if (diff !== 0) return diff;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

type TagAccumulator = {
  key: string;
  label: string;
  labelAtMs: number;
  pinCount: number;
  sanpoMaps: TagSanpoMapRef[];
};

/**
 * 全地図のピンからタグの一覧を作る。並びはピン数の多い順 → キーの昇順
 * （backend の `GET /sanpo-maps/{id}/tags` の第1・第3キーと同じ。最後に使われた日時は端末では持たないので使わない）。
 * 1つのピンに同じキーのタグが重なっていても1件と数える（backend が重複を除くので通常は起きない）。
 */
export function buildTagSummaries(groups: readonly SanpoMapPinGroup[]): TagSummary[] {
  const byKey = new Map<string, TagAccumulator>();
  for (const group of groups) {
    const mapRef = toSanpoMapRef(group.sanpoMap);
    for (const pin of group.pins) {
      const atMs = createdAtMs(pin);
      const seenInPin = new Set<string>();
      for (const tag of pin.tags) {
        const key = tagKey(tag.label);
        if (key === "" || seenInPin.has(key)) continue;
        seenInPin.add(key);
        const entry = byKey.get(key);
        if (entry === undefined) {
          byKey.set(key, {
            key,
            label: normalizeTagLabel(tag.label),
            labelAtMs: atMs,
            pinCount: 1,
            sanpoMaps: [mapRef],
          });
          continue;
        }
        entry.pinCount += 1;
        if (atMs > entry.labelAtMs) {
          entry.label = normalizeTagLabel(tag.label);
          entry.labelAtMs = atMs;
        }
        if (!entry.sanpoMaps.some((map) => map.id === mapRef.id)) entry.sanpoMaps.push(mapRef);
      }
    }
  }
  return Array.from(byKey.values(), ({ key, label, pinCount, sanpoMaps }) => ({
    key,
    label,
    pinCount,
    sanpoMaps,
  })).sort((a, b) => {
    if (a.pinCount !== b.pinCount) return b.pinCount - a.pinCount;
    if (a.key === b.key) return 0;
    return a.key < b.key ? -1 : 1;
  });
}

/**
 * タグを表記で絞る（地図名・ピン名と同じ照合規則。`sanpoMapSearch.ts`）。順序は保つ。
 * query が空なら入力をそのまま返す（同じ参照）。
 */
export function filterTagSummariesByLabel(
  tags: readonly TagSummary[],
  query: string,
): readonly TagSummary[] {
  const normalized = normalizeNameQuery(query);
  if (normalized === "") return tags;
  return tags.filter((tag) => matchesNameQuery(tag.label, normalized));
}

/** 指定したキーのタグが付いたピンを全地図から集める。並びは作成日時の新しい順（地図詳細のピン一覧と同じ）。 */
export function selectPinsWithTag(groups: readonly SanpoMapPinGroup[], key: string): TaggedPin[] {
  const result: TaggedPin[] = [];
  for (const group of groups) {
    const mapRef = toSanpoMapRef(group.sanpoMap);
    for (const pin of group.pins) {
      if (pin.tags.some((tag) => tagKey(tag.label) === key)) result.push({ pin, sanpoMap: mapRef });
    }
  }
  return result.sort((a, b) => compareByCreatedAtDesc(a.pin, b.pin));
}

/**
 * タグ詳細のルートの `label` パラメータを検証して正規化した表記を返す。配列（同じキーの重複）・空・
 * 正規化後に空・最大長超えは null（ディープリンクの不正値。画面は「見つからない」を出す）。
 */
export function parseTagLabelParam(raw: string | string[] | undefined): string | null {
  if (typeof raw !== "string") return null;
  const label = normalizeTagLabel(raw);
  if (label === "" || !isTagLabelWithinMaxLength(label)) return null;
  return label;
}
