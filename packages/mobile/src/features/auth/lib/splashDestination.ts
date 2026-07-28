import type { AuthUser } from "@/services/auth/types";

export type SplashDestination = "/walk-start" | "/(auth)/sign-in";

/**
 * セッション復元結果から起動直後の遷移先を決める。
 *
 * ルーティング判定を View から切り離し、React Native 非依存でテスト可能にする。
 */
export function getSplashDestination(user: AuthUser | null): SplashDestination {
  return user === null ? "/(auth)/sign-in" : "/walk-start";
}
