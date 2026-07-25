import { useRouter } from "expo-router";
import { useCallback, useState } from "react";

import { useToast } from "@/hooks/useToast";
import { authService, isAuthError } from "@/services/auth";

export type UseAuthActionsResult = {
  signInWithGoogle: () => void;
  signUpWithGoogle: () => void;
  continueAsGuest: () => void;
  /** サインイン処理中かどうか。ボタンの `disabled` 制御に使う（多重タップ防止）。 */
  isSubmitting: boolean;
  /** 失敗時のフィードバック用トースト状態（呼び出し側の画面で描画する）。 */
  toast: { visible: boolean; message: string };
};

/**
 * 認証アクションと遷移を1箇所にまとめる hook。
 * UI からロジックを分離し、成功後は常に散歩開始画面へ遷移する。
 * `AuthService.signIn("google")` を real/dev/mock いずれのモードでも同じ形で呼ぶ
 * （`docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md` 決定5: signIn/signUp は区別しない）。
 * キャンセル（`AuthError("cancelled")`）はユーザー操作なのでトーストを出さない。
 * 判定ロジックは持たない（純粋関数化する対象なし）。
 */
export function useAuthActions(): UseAuthActionsResult {
  const router = useRouter();
  const toast = useToast();
  const { show } = toast;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const runSignIn = useCallback(
    (failureMessage: string) => {
      if (isSubmitting) {
        // 多重タップ防止。
        return;
      }
      setIsSubmitting(true);
      authService
        .signIn("google")
        .then(() => router.replace("/walk-start"))
        .catch((error: unknown) => {
          if (isAuthError(error)) {
            if (error.code === "cancelled") {
              // ユーザーがキャンセルしただけなので無反応にする。
              return;
            }
            if (error.code === "configuration") {
              show("サインインの設定が未完了です。しばらくしてから再度お試しください。");
              return;
            }
          }
          show(failureMessage);
        })
        .finally(() => setIsSubmitting(false));
    },
    [isSubmitting, router, show],
  );

  const signInWithGoogle = useCallback(() => {
    runSignIn("サインインに失敗しました。もう一度お試しください。");
  }, [runSignIn]);

  const signUpWithGoogle = useCallback(() => {
    runSignIn("登録に失敗しました。もう一度お試しください。");
  }, [runSignIn]);

  const continueAsGuest = useCallback(() => {
    // ゲストは「トークン非保持状態」として表現するため authService を呼ばない
    // （ADR-002 決定6）。TODO: SS-13（認証状態と探索ロジックの分離）で認証ゲートと統合する。
    router.replace("/walk-start");
  }, [router]);

  return {
    signInWithGoogle,
    signUpWithGoogle,
    continueAsGuest,
    isSubmitting,
    toast: { visible: toast.visible, message: toast.message },
  };
}
