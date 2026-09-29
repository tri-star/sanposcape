import { DEFAULT_LANDING_HREF } from "@/features/auth/lib/landingHref";
import type { ResolvedAuthSessionStatus } from "@/store/useAuthSessionStore";

export type SplashDestination = typeof DEFAULT_LANDING_HREF | "/(auth)/sign-in";

/**
 * 復元後の認証状態（`loading` を含まない）から起動直後の遷移先を決める。
 *
 * SS-13 では `canEnterProtectedRoutes`（`AuthGate` と共有）に委譲することで
 * 「スプラッシュは通したのにゲートが弾く」という食い違いを防いでいたが、SS-57 で
 * `canEnterProtectedRoutes` が guest も保護ルートに許可するようになったため、
 * 委譲すると未サインインのコールドスタートが保護ルートに直行してしまう。
 * ゲスト導線（「ゲストで試す」）と Google サインインの入口はサインイン画面にしか無いため、
 * 自動で保護ルートに入れるとサインインする手段が実質失われる。
 * そのため SS-57 でゲートへの委譲をやめ、`authenticated` を直接見る形に変えた。
 *
 * SS-145: authenticated の着地点を `/walk-start` からピンタブへ変えた。起動直後は進行中の散歩が無い
 * （メモリのみで永続化していない）ため、散歩の有無では分岐しない。
 *
 * 委譲をやめても危険な食い違いは起きない。ADR-009 が防ぎたかったのは「スプラッシュが通した先で
 * ゲートが弾く」向きであり、サインイン画面は公開ルート（`PUBLIC_ROOT_SEGMENTS` の `(auth)`）なので
 * ゲートは決して弾かない（詳細は ADR-009 SS-57 追補を参照）。
 */
export function getSplashDestination(status: ResolvedAuthSessionStatus): SplashDestination {
  return status === "authenticated" ? DEFAULT_LANDING_HREF : "/(auth)/sign-in";
}
