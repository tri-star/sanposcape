/**
 * ログイン直後の着地点（SS-145 / ADR-M-009 SS-145 追補）。
 * - DEFAULT_LANDING_HREF: スプラッシュ（authenticated）・サインイン成功・ゲスト開始の既定＝ピンタブ。
 * - ACTIVE_WALK_LANDING_HREF: 進行中の散歩があるとき＝ナビタブ（WalkActiveView を隠さない）。
 */
export const DEFAULT_LANDING_HREF = "/(tabs)/pins" as const;
export const ACTIVE_WALK_LANDING_HREF = "/(tabs)" as const;
