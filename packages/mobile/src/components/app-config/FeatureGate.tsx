import type { ReactNode } from "react";

import type { FeatureFlagKey } from "@/config/featureFlags";
import { useAppConfig } from "@/hooks/useAppConfig";
import { isFeatureEnabled } from "@/lib/appConfigSnapshot";
import { resolveFeatureGateDecision } from "@/lib/featureGate";

export type FeatureGateProps = {
  flag: FeatureFlagKey;
  children: ReactNode;
  /** フラグ OFF（確定）のときに代わりに描画する要素。既定は何も描画しない。 */
  fallback?: ReactNode;
  /**
   * 取得中に描画する要素。`undefined`（未指定）なら `fallback` と同じ
   * （= OFF と同じ扱い = フェイルセーフ）。`null` を明示的に渡すと、
   * ロード中は何も描画せず `fallback` にも倒さない（OFF 確定後に初めて `fallback` を出す）。
   */
  pending?: ReactNode;
};

/**
 * フラグで子要素の描画を出し分ける。**導線（ボタン・カード・タブの中身など）の出し分けに使う。**
 * 画面（`app/` のルート）ごと隠す場合は `packages/mobile/docs/architecture-guideline.md`
 * 「フィーチャーフラグ（`/app-config`）の扱い」の画面ガードレシピを参照。
 *
 * **論点5の結論**: hook（`useFeatureFlag`）とコンポーネント（`FeatureGate`）の**両方**を出す。
 * hook は「条件付きで props を変える」「配列をフィルタする」など JSX の外でも使うため、
 * コンポーネントは JSX の中で三項演算子を書かせないために必要。どちらも同じ純粋関数
 * （`isFeatureEnabled` / `resolveFeatureGateDecision`）に乗るので挙動は一致する。
 */
export function FeatureGate({ flag, children, fallback = null, pending }: FeatureGateProps) {
  const snapshot = useAppConfig();
  const decision = resolveFeatureGateDecision({
    status: snapshot.status,
    enabled: isFeatureEnabled(snapshot, flag),
  });
  if (decision === "enabled") return <>{children}</>;
  // `??` だと null と undefined を区別できず pending={null} が表現できないため、
  // undefined のときだけ fallback へ倒す。
  if (decision === "pending") return <>{pending === undefined ? fallback : pending}</>;
  return <>{fallback}</>;
}
