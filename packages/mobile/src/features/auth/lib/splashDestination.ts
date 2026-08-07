import { canEnterProtectedRoutes } from "@/features/auth/lib/authGate";
import type { ResolvedAuthSessionStatus } from "@/store/useAuthSessionStore";

export type SplashDestination = "/walk-start" | "/(auth)/sign-in";

/**
 * 復元後の認証状態（`loading` を含まない）から起動直後の遷移先を決める。
 *
 * 遷移先の判定を `canEnterProtectedRoutes`（`AuthGate` と共有）に委ねることで、
 * 「スプラッシュは通したのにゲートが弾く」という食い違いを構造的に防ぐ（SS-13 / ADR-009）。
 */
export function getSplashDestination(status: ResolvedAuthSessionStatus): SplashDestination {
  return canEnterProtectedRoutes(status) ? "/walk-start" : "/(auth)/sign-in";
}
