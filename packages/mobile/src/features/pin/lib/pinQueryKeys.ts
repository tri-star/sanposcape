import type { GeoBounds } from "@/features/pin/types";

/**
 * ピン閲覧系の TanStack Query の queryKey を1か所に集める（SS-118）。
 * すべて `PINS_QUERY_ROOT`（`["pins"]`）で始まる。`usePinSave` は保存成功時に
 * `invalidateQueries({ queryKey: PINS_QUERY_ROOT })` を呼び、一覧・詳細・写真ページ・タグ候補を
 * まとめて再検証する（`docs/folder-structure.md`「queryKey はドメイン名で始める」）。
 *
 * SS-119（編集・削除）は `pinDetailQueryKey` の置き換え・`PINS_QUERY_ROOT` の invalidate を使う。
 */
export const PINS_QUERY_ROOT = ["pins"] as const;

export function pinListQueryKey(sanpoMapId: string, bounds: GeoBounds) {
  return ["pins", "list", { sanpoMapId, bounds }] as const;
}

export function pinDetailQueryKey(pinId: string) {
  return ["pins", "detail", pinId] as const;
}

export function pinPhotosQueryKey(pinId: string) {
  return ["pins", "photos", pinId] as const;
}

/**
 * 地図のタグ候補（SS-136）。`["pins", ...]` 始まりにして、ピン保存成功時の
 * `invalidateQueries({ queryKey: PINS_QUERY_ROOT })`（`usePinSave`）と、SS-119 の編集・削除後の
 * invalidate で自動的に取り直されるようにする。
 */
export function pinTagSuggestionsQueryKey(sanpoMapId: string | null) {
  return ["pins", "tag-suggestions", sanpoMapId] as const;
}

/**
 * 地図詳細のピン一覧（SS-121）。`["pins", ...]` 始まりにして、ピン保存成功時の
 * `invalidateQueries({ queryKey: PINS_QUERY_ROOT })`（`usePinSave`）と SS-119 の編集・削除後の
 * invalidate で取り直されるようにする。
 */
export function sanpoMapPinsQueryKey(sanpoMapId: string) {
  return ["pins", "by-sanpo-map", sanpoMapId] as const;
}
