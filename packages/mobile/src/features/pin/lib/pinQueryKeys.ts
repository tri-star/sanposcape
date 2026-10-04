import type { GeoBounds } from "@/features/pin/types";

/**
 * ピン閲覧系の TanStack Query の queryKey を1か所に集める（SS-118）。
 * すべて `PINS_QUERY_ROOT`（`["pins"]`）で始まる。`usePinSave` は保存成功時に
 * `invalidateQueries({ queryKey: PINS_QUERY_ROOT })` を呼び、一覧・詳細・写真ページ・タグ候補を
 * まとめて再検証する（`docs/folder-structure.md`「queryKey はドメイン名で始める」）。
 *
 * SS-119（編集・削除）も `PINS_QUERY_ROOT` の invalidate を使う（編集の成功時は `pinDetailQueryKey` を
 * PATCH の応答で先に置き換える）。ADR-M-017 D7。
 */
export const PINS_QUERY_ROOT = ["pins"] as const;

/**
 * 地図一覧（`GET /sanpo-maps?expand=pin_count`）。ピン系と違い `["pins"]` 配下ではない
 * （`usePinSave` は保存成功時に、`usePinDelete`（SS-119）はピン削除成功時に個別に invalidate する）。
 * 一覧画面・ピン登録画面・ピンタブで同じキャッシュを共有する。
 */
export const SANPO_MAPS_QUERY_KEY = ["sanpo-maps", "list"] as const;

/**
 * 地図表示の取得（bbox）の key。今は取得条件が常に同じ（`archived: false` 固定）なのでフィルターを含めていない。
 * SS-174 で `buildListPinsParams` にフィルター引数を足すときは、この key にも含めること。
 */
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
