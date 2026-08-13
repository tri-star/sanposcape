import type { AuthSessionStatus, ResolvedAuthSessionStatus } from "@/store/useAuthSessionStore";

/**
 * 保護ルートへの到達可否とセッション終了時の退避を判定する純粋関数群
 * （SS-13 / ADR-009。ゲスト散歩の解禁は SS-57 / ADR-009 SS-57 追補）。
 * `react-native` / `expo-router` を値 import しない（vitest 対象）。
 */

export type AuthGateRedirectHref = "/(auth)/sign-in";

export type AuthGateDecision = { type: "allow" } | { type: "redirect"; href: AuthGateRedirectHref };

/**
 * 未認証でも到達してよいルートの先頭セグメント。
 *
 * **運用ルール**: 未認証で到達させたい開発用ルートを新設したら、ここにも追加すること
 * （`pages-components-guideline.md`「開発確認用ルート」節も参照）。
 */
export const PUBLIC_ROOT_SEGMENTS: readonly string[] = [
  "(auth)", // サインイン / サインアップ
  "dev-screens", // 開発用の画面カタログ（__DEV__ でのみ描画される）
  "design-system", // 開発用のデザインシステム一覧
  // Expo Router が提供するルート一覧。`sitemap: false` を明示しない限り expo-router 57 は
  // 本番ビルドにも `/_sitemap` を含める＝「開発時のみ」ではなく本番でも到達可能（ADR-009 参照）。
  // 内容はルート一覧のみで、RN アプリはバンドル解析で同等の情報が得られるため MVP では許容する。
  "_sitemap",
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
 *
 * SS-57: ゲスト散歩を解禁した（SS-49 合意 / backend 実装は SS-56）。未認証でも `/explore/*` は
 * 呼べるため、探索・散歩の画面はトークン非保持でも成立する。`/walks`（保存・履歴・統計）は
 * 認証必須のままで、401 は各 feature 側のエラー分類が degrade する。
 * `status === "authenticated" || status === "guest"` と明示的に列挙し、`return true` にはしない
 * （どの状態を許可しているかをコードに残すため）。
 *
 * **注意**: この関数はゲート以外に `splashDestination.ts` からも参照され得るように見えるが、
 * SS-57 でスプラッシュはこの関数への委譲をやめている（詳細は `splashDestination.ts` の JSDoc /
 * ADR-009 SS-57 追補を参照）。この関数だけを変えれば安全、とは限らないことに注意すること。
 */
export function canEnterProtectedRoutes(status: ResolvedAuthSessionStatus): boolean {
  return status === "authenticated" || status === "guest";
}

/**
 * ゲートの判定本体。この順序で評価する:
 * 1. 復元中（loading）は絶対に弾かない。
 * 2. 公開ルートは常に許可する。
 * 3. 保護ルートは `canEnterProtectedRoutes` の結果に従う。
 *
 * 意図的にしないこと: 認証済みユーザーを `(auth)` から追い出さない（片方向ゲート）。
 * `/dev-screens` からサインイン画面を開けなくなる／遷移が往復するのを避けるため。
 * サインイン成功後の遷移先は `useAuthActions` が `getPostSignInDestination`（進行中の散歩の
 * 有無で `/walk-start` と `/(tabs)` を分岐する。SS-57 ローカルレビュー対応）を使って決め、
 * `router.replace` で遷移する。
 *
 * SS-57 で `canEnterProtectedRoutes` が guest も許可するようになったため、現状この関数が
 * `redirect` を返す経路は無い（`loading` は 1. で allow、`guest`/`authenticated` は 3. で allow）。
 * それでも `resolveAuthGateDecision` と `AuthGateDecision` 型はそのまま残す。
 * 「保護ルートに誰が入れるか」の判断を1箇所に閉じる器（ADR-009 決定3）を壊さないため、また
 * 将来「ゲストは入れないルート」（例: アカウント設定）が必要になったとき、追加場所をここに
 * 固定するためである。
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

/**
 * サインアウト / refresh token 失効（401 → refresh 失敗）で
 * `authenticated → guest` に落ちたとき、保護ルートから退避すべきかを判定する（SS-57）。
 *
 * SS-50 までは `resolveAuthGateDecision` が guest を保護ルートで弾くことでこの退避が成立していたが、
 * SS-57 で guest も保護ルートに入れるようになったため、判定を「状態そのもの」から
 * 「authenticated → guest という遷移」へ移す（ADR-009 決定6 の狙い＝退避を AuthGate 1箇所に
 * 集約する、はそのまま維持する）。
 *
 * - `loading → guest`（起動時に復元できなかった）では退避しない。ゲストのままディープリンクで
 *   保護ルートに入る正規の導線を壊さないため。
 * - 公開ルート上（サインイン画面など）にいるときは退避しない。移動先が現在地と同じになるため。
 */
export function shouldEvacuateOnSessionEnd(input: {
  previousStatus: AuthSessionStatus;
  status: AuthSessionStatus;
  isPublicRoute: boolean;
}): boolean {
  return (
    input.previousStatus === "authenticated" && input.status === "guest" && !input.isPublicRoute
  );
}
