import { useRouter } from "expo-router";
import { useCallback } from "react";

import type { SignInReturnTo } from "@/features/auth/lib/signInReturnTo";
import { useNavigateOnce, type UseNavigateOnceResult } from "@/hooks/useNavigateOnce";

/**
 * ゲスト向けサインイン案内（ピンタブ・アカウントタブ）から、サインイン画面を開く遷移。
 * push にするのは、replace だと `(tabs)` ごと置き換わってタブバーが消え、サインイン後の
 * `dismissTo` で戻れなくなるため（`getPostSignInDestination`）。二重に発火しないよう `runOnce` に通す。
 *
 * `runOnce` を渡すと、その画面の他の遷移（設定・画面カタログなど）と同じラッチを共有する
 * （サインインを押した直後に別の遷移も通ってしまうのを防ぐ）。省略時はこの hook 専用のラッチを持つ。
 * `returnTo` を渡すと、サインイン後にその呼び出し元（アカウントタブ）へ戻す（SS-151。判定は
 * `getPostSignInDestination`）。渡さない入口（ピンタブなど）は従来どおりピンタブへ着地する。
 * 遷移先は固定値で判定ロジックが無い（純粋関数に切り出せる部分が無い）ので、テストは持たない。
 * `expo-router` に依存するため Vitest の対象にしない（`useNavigateOnce` と同じ扱い）。
 */
export function useSignInNavigation(
  runOnce?: UseNavigateOnceResult["runOnce"],
  returnTo?: SignInReturnTo,
): () => void {
  const router = useRouter();
  // 呼び出し側のラッチが無いときのための自前ラッチ（hook の呼び出し順を固定するため常に呼ぶ）。
  const own = useNavigateOnce();
  const run = runOnce ?? own.runOnce;
  return useCallback(
    () =>
      run(() =>
        returnTo
          ? router.push({ pathname: "/(auth)/sign-in", params: { returnTo } })
          : router.push("/(auth)/sign-in"),
      ),
    [run, router, returnTo],
  );
}
