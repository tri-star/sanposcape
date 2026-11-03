import type { PinListFilterParams } from "@/features/pin/lib/pinMapFilter";
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
 * 地図表示の取得（bbox）の key。`filter` は `GET /pins` に送る絞り込み（`toPinListFilterParams` の結果）を
 * そのまま入れる（SS-174）。画面の選択肢ではなく送る条件で作るので、同じ条件になる選び方はキャッシュを共有する。
 */
export function pinListQueryKey(
  sanpoMapId: string,
  bounds: GeoBounds,
  filter: PinListFilterParams,
) {
  return ["pins", "list", { sanpoMapId, bounds, filter }] as const;
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
 * 地図のメンバー（SS-249）。`SANPO_MAPS_QUERY_KEY`（`["sanpo-maps", "list"]`）とは別の枝にし、
 * 地図一覧の invalidate でメンバーまで取り直さない。
 */
export function sanpoMapMembersQueryKey(sanpoMapId: string) {
  return ["sanpo-maps", "members", sanpoMapId] as const;
}

/** 地図の有効な招待リンク（owner。SS-250）。メンバーと同じ `["sanpo-maps", ...]` の枝。 */
export function sanpoMapInvitationsQueryKey(sanpoMapId: string) {
  return ["sanpo-maps", "invitations", sanpoMapId] as const;
}

/**
 * 招待の中身（SS-250）。トークンはメモリのキャッシュのキーにだけ使い、端末のストレージには残さない。
 * サインインの前後で応答（`membership`）が変わるので、呼び出し側でサインインの状態もキーに含める。
 */
export function invitationPreviewQueryKey(token: string, signedIn: boolean) {
  return ["invitations", "preview", token, signedIn] as const;
}

/**
 * 地図詳細のピン一覧（SS-121）。`["pins", ...]` 始まりにして、ピン保存成功時の
 * `invalidateQueries({ queryKey: PINS_QUERY_ROOT })`（`usePinSave`）と SS-119 の編集・削除後の
 * invalidate で取り直されるようにする。
 */
export function sanpoMapPinsQueryKey(sanpoMapId: string) {
  return ["pins", "by-sanpo-map", sanpoMapId] as const;
}

/**
 * ピンの位置の住所（ピン詳細に表示する。SS-212）。送る座標（小数6桁に丸めた値）で作るので、
 * 同じ位置のピンは住所を共有する。
 * ピンの保存で変わるものではないので `["pins"]` 配下に置かない（保存成功時の invalidate の対象外）。
 */
export function pinAddressQueryKey(latitude: number, longitude: number) {
  return ["pin-address", latitude, longitude] as const;
}

/**
 * ピンの位置の最寄り駅（登録画面でタグを最初から入れておく。SS-225）。送る座標（小数6桁に丸めた値）で作る。
 * 駅のデータはピンの保存で変わらないので `["pins"]` 配下に置かない（保存成功時の invalidate の対象外）。
 */
export function pinNearestStationQueryKey(latitude: number, longitude: number) {
  return ["pin-nearest-station", latitude, longitude] as const;
}
