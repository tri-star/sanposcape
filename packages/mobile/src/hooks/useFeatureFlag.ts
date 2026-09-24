import type { FeatureFlagKey } from "@/config/featureFlags";
import { useAppConfig } from "@/hooks/useAppConfig";
import { isFeatureEnabled } from "@/lib/appConfigSnapshot";

/**
 * フラグが ON か。取得中・取得失敗・未知キーはすべて false（ADR-008 決定9）。
 * 「まだ分からない」と「OFF」を区別したい画面は `useAppConfig().status` を併せて見るか、
 * `<FeatureGate>` の `pending` prop を使う。
 *
 * 引数の型を `FeatureFlagKey` に限定することで、文字列リテラルのタイポを型で弾く
 * （ADR-008 追補 D1 の狙い）。
 *
 * `src/features/walk/**` / `src/features/history/**` からこの hook を import しても
 * `.oxlintrc.json` の `no-restricted-imports`（対象は `@/services/auth*` と
 * `@/store/useAuthSessionStore`）には抵触しない。フラグは認証状態ではないため、
 * props で注入する必要も無い。
 */
export function useFeatureFlag(key: FeatureFlagKey): boolean {
  return isFeatureEnabled(useAppConfig(), key);
}
