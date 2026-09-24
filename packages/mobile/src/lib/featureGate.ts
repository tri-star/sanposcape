import type { AppConfigStatus } from "@/lib/appConfigSnapshot";

export type FeatureGateDecision = "pending" | "enabled" | "disabled";

/**
 * 「ロード中は判断を保留したい」呼び出し側のための判定を1関数に閉じる（純粋関数）。
 *
 * `enabled` は `isFeatureEnabled()` の結果（ロード中は必ず false）。
 * - enabled === true                 → "enabled"
 * - status === "loading"             → "pending"（まだ OFF と断定しない。画面側は skeleton / 何も出さない）
 * - それ以外（ready/unavailable の OFF）→ "disabled"（確定。リダイレクトしてよい）
 *
 * **なぜ分けるか**: 画面（`app/` のルート）ごとフラグで隠す場合、`loading` の間に
 * `<Redirect>` してしまうと「フラグ ON なのに起動直後は必ず弾かれる」という不具合になる。
 * `pending` を明示的に持つことでその誤りを構造的に防ぐ。
 */
export function resolveFeatureGateDecision(input: {
  status: AppConfigStatus;
  enabled: boolean;
}): FeatureGateDecision {
  if (input.enabled) return "enabled";
  if (input.status === "loading") return "pending";
  return "disabled";
}
