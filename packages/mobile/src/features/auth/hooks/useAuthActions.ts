import { useRouter } from "expo-router";
import { useCallback } from "react";

import { useToast } from "@/hooks/useToast";
import { authService } from "@/services/auth";

export type UseAuthActionsResult = {
  signInWithGoogle: () => void;
  signUpWithGoogle: () => void;
  continueAsGuest: () => void;
  /** 失敗時のフィードバック用トースト状態（呼び出し側の画面で描画する）。 */
  toast: { visible: boolean; message: string };
};

/**
 * 認証アクション（静的スタブ）と遷移を1箇所にまとめる hook。
 * UI からロジックを分離し、成功後は常に散歩開始画面へ遷移する。
 * `authService` は real 実装だと意図的に throw する（別タスクで OAuth 実装するまでの TODO）ため、
 * 失敗時は「押せるのに無反応」を避けるためトーストでフィードバックする。
 * 判定ロジックは持たない（純粋関数化する対象なし）。実 OAuth は `src/services/auth` の
 * real 実装として別タスクで差し替える。
 */
export function useAuthActions(): UseAuthActionsResult {
  const router = useRouter();
  const toast = useToast();
  const { show } = toast;

  const signInWithGoogle = useCallback(() => {
    authService
      .signIn("google")
      .then(() => router.replace("/walk-start"))
      .catch(() => show("サインインに失敗しました。もう一度お試しください。"));
  }, [router, show]);

  const signUpWithGoogle = useCallback(() => {
    authService
      .signUp("google")
      .then(() => router.replace("/walk-start"))
      .catch(() => show("登録に失敗しました。もう一度お試しください。"));
  }, [router, show]);

  const continueAsGuest = useCallback(() => {
    authService
      .signIn("guest")
      .then(() => router.replace("/walk-start"))
      .catch(() => show("サインインに失敗しました。もう一度お試しください。"));
  }, [router, show]);

  return {
    signInWithGoogle,
    signUpWithGoogle,
    continueAsGuest,
    toast: { visible: toast.visible, message: toast.message },
  };
}
