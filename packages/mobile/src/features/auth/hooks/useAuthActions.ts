import { useRouter } from "expo-router";
import { useCallback, useState } from "react";

import { useToast } from "@/hooks/useToast";
import { authService, isAuthError } from "@/services/auth";

export type UseAuthActionsResult = {
  signInWithGoogle: () => void;
  signUpWithGoogle: () => void;
  /** ゲストのまま散歩開始画面へ進む。認証状態は変えない＝トークン非保持のまま（ADR-002 決定6）。 */
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
 *
 * ゲスト導線（`continueAsGuest`）は SS-13 で一旦外し、SS-57 で復活した（SS-49 で `/explore/*` が
 * 任意認証になったため）。`POST /walks`（散歩の保存）は未認証では 401 になり保存できない
 * （サインイン誘導 CTA は SS-37 で対応）。
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

  // authService は呼ばない。ゲストは「トークン非保持状態」であって AuthService のメソッドでは
  // ない（ADR-002 決定6）。起動時の復元失敗で useAuthSessionStore は既に guest になっているため、
  // ストアへの書き込みも不要（ストアの書き込み経路は2つだけ、という ADR-009 決定2 を守る）。
  // push ではなく replace を使う（スプラッシュ→サインイン→walk-start は replace 連鎖で、
  // /walk-start 到達時に canGoBack() === false になる設計。ここだけ push にすると
  // スタックの性質が変わる）。isSubmitting によるガードは持たない（サインイン処理中の多重操作
  // 防止はサインインボタン専用。ゲストボタン側は View 側で disabled={isSubmitting} を付ける）。
  const continueAsGuest = useCallback(() => {
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
