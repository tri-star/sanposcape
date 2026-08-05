import type { AuthSessionStatus, ResolvedAuthSessionStatus } from "@/store/useAuthSessionStore";

/**
 * 未認証を弾く判定だけを持つ純粋関数群（SS-13 / ADR-009）。
 * `react-native` / `expo-router` を値 import しない（vitest 対象）。
 */

export type AuthGateRedirectHref = "/(auth)/sign-in";

export type AuthGateDecision = { type: "allow" } | { type: "redirect"; href: AuthGateRedirectHref };

/** 未認証でも到達してよいルートの先頭セグメント。 */
export const PUBLIC_ROOT_SEGMENTS: readonly string[] = [
  "(auth)", // サインイン / サインアップ
  "dev-screens", // 開発用の画面カタログ（__DEV__ でのみ描画される）
  "design-system", // 開発用のデザインシステム一覧
  "_sitemap", // Expo Router が開発時に提供するルート一覧
];

/**
 * `useSegments()` の戻り値からそのルートが公開ルートかどうかを判定する。
 * `segments.length === 0` は `/`（スプラッシュ）＝公開。
 */
export function isPublicRoute(segments: readonly string[]): boolean {
  if (segments.length === 0) return true;
  return PUBLIC_ROOT_SEGMENTS.includes(segments[0]);
}

/**
 * 保護ルート（散歩・履歴・設定など）に入ってよい状態か。
 * **将来ゲスト散歩を許可するときに変えるのはこの関数だけ**（"guest" を許可側に足す）。
 */
export function canEnterProtectedRoutes(status: ResolvedAuthSessionStatus): boolean {
  // MVP: 未認証（＝トークン非保持のゲスト）は弾く（ADR-002 決定6 / ADR-009）。
  // 将来のゲスト散歩を有効にするときは、ここに "guest" を許可として足すのが唯一の変更点
  // （併せて SignInView / SignUpView のゲスト導線を復活させる）。
  return status === "authenticated";
}

/**
 * ゲートの判定本体。この順序で評価する:
 * 1. 復元中（loading）は絶対に弾かない。
 * 2. 公開ルートは常に許可する。
 * 3. 保護ルートは `canEnterProtectedRoutes` の結果に従う。
 *
 * 意図的にしないこと: 認証済みユーザーを `(auth)` から追い出さない（片方向ゲート）。
 * `/dev-screens` からサインイン画面を開けなくなる／遷移が往復するのを避けるため。
 * サインイン成功後の遷移は `useAuthActions` が `router.replace("/walk-start")` で行う。
 */
export function resolveAuthGateDecision(input: {
  status: AuthSessionStatus;
  segments: readonly string[];
}): AuthGateDecision {
  if (input.status === "loading") {
    return { type: "allow" };
  }
  if (isPublicRoute(input.segments)) {
    return { type: "allow" };
  }
  if (canEnterProtectedRoutes(input.status)) {
    return { type: "allow" };
  }
  return { type: "redirect", href: "/(auth)/sign-in" };
}
