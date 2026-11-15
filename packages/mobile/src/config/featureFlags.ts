/**
 * クライアントが参照するフィーチャーフラグのキー定数。
 *
 * `/app-config` の `flags` は固定キーのオブジェクトではなく map（`{[key: string]: boolean}`）で
 * 返るため（ADR-008 追補 D1。フラグの増減が OpenAPI の破壊的変更にならないようにするための決定）、
 * OpenAPI からはキーの型が得られない。その代償をここで埋める。
 *
 * **正典は backend のコード**（`packages/backend/src/sanposcape/core/feature_flags.py` の
 * `FEATURE_FLAGS` のうち `audience: "client"` のもの。ADR-008 追補 D9）。このファイルはその写しであり、
 * 機械的な同期はしない（mobile のテストからパッケージ境界を越えて Python を読むことはしない）。
 * ズレても壊れないよう、**未知キーは常に OFF** に倒す（`@/lib/appConfigSnapshot` の `isFeatureEnabled`）。
 *
 * 追加の手順: backend の登録簿に入って `/app-config` が返すようになってから、ここに1行足す
 *             （逆順にすると「常に OFF の分岐」が先に入る。害は無いが検証できない）。
 * 削除の手順: ADR-008 決定6 の「削除」段階で、分岐・この定数・関連テストを消す。本番で現在 ON のフラグなら、
 *             backend は同じ PR か先行の PR でキーを固定値 `true` に移し、`/app-config` は返し続ける（ADR-008 SS-233 追補 D40）。
 *             配布済みのアプリは未知キーを OFF に倒すので、キーが消えると公開済みの機能が消えるため。
 *             固定値は、分岐を消したコードを埋め込んだストアのバイナリまで最低サポートバージョンが上がり、
 *             上げてから1日経ってから消す（OTA で届けた版は数えない。`docs/compat-tracker.md`）。
 *
 * 命名規約（ADR-008 追補 D7）: 値は `^[a-z][a-zA-Z\d_-]{0,63}$` の snake_case。
 * `_enabled` のような接尾辞は付けない（値が bool なので冗長）。
 */
export const FEATURE_FLAG_KEYS = {
  // 今は出し分けているフラグが無い。SS-271 で pin_registration・pin_station_tag・map_invitation・
  // map_pin_visibility・display_name_edit を消した（backend は固定値 true を返し続ける。docs/compat-tracker.md）。
} as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[keyof typeof FEATURE_FLAG_KEYS];
