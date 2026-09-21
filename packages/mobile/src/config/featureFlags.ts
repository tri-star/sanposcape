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
 * 削除の手順: ADR-008 決定6 の「削除」段階で、分岐・この定数・関連テストを**同じ PR** で消す。
 *
 * 命名規約（ADR-008 追補 D7）: 値は `^[a-z][a-zA-Z\d_-]{0,63}$` の snake_case。
 * `_enabled` のような接尾辞は付けない（値が bool なので冗長）。
 */
export const FEATURE_FLAG_KEYS = {
  /**
   * ピン登録（SS-88）。散歩中画面の「この場所にピンを追加」と `/pins/new` を出し分ける。
   * OFF の間は従来どおり「準備中」トースト。dev は backend BK-1（template.yaml への S3 結線）後、
   * prod は BK-2（アカウント削除時の写真削除）後に ON にする。
   * 最初の実フラグとして `app_config_probe`（疎通確認用）を置き換えた。
   */
  pinRegistration: "pin_registration",
} as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[keyof typeof FEATURE_FLAG_KEYS];
