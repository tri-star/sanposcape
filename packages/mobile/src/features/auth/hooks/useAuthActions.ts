import { useRouter } from "expo-router";
import { useCallback, useState } from "react";

import { getPostSignInDestination } from "@/features/auth/lib/postSignInDestination";
import { useActiveWalkStore } from "@/features/walk/store/useActiveWalkStore";
import { useFinishedWalkStore } from "@/features/walk/store/useFinishedWalkStore";
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
 * UI からロジックを分離し、成功後の遷移先は `getPostSignInDestination`（`features/auth/lib/`）が
 * 進行中の散歩の有無と、保存待ちドラフトかつサマリ画面の CTA から来た意思表示
 * （`useFinishedWalkStore.signInForSaveRequested`）の有無から、遷移方法（`replace`/`dismissTo`）
 * 込みで決める。
 * `AuthService.signIn("google")` を real/dev/mock いずれのモードでも同じ形で呼ぶ
 * （`docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md` 決定5: signIn/signUp は区別しない）。
 * キャンセル（`AuthError("cancelled")`）はユーザー操作なのでトーストを出さない。
 *
 * ゲスト導線（`continueAsGuest`）は SS-13 で一旦外し、SS-57 で復活した（SS-49 で `/explore/*` が
 * 任意認証になったため）。`POST /walks`（散歩の保存）は未認証では 401 になり保存できないが、
 * **サマリ画面の CTA（`walk-summary-save-sign-in`）を押したことで `signInForSaveRequested` が
 * true になっている場合に限り**、サインイン後にサマリ画面（`/walk-summary`）へ戻して自動再送
 * させる（SS-37。SS-37 ローカルレビュー Security High 対応で、CTA を経由しない無関係なサインイン
 * （設定画面など）では発火しないように起点を限定した。共有端末で「ゲストが保存に失敗して放置した
 * 軌跡」が、全く無関係な後続のサインインへ無確認で紐付くのを防ぐため）。
 *
 * **散歩中に設定画面経由でサインインするケースへの対応（SS-57 ローカルレビュー対応）**:
 * ゲスト散歩の解禁により、「散歩中タブの歯車 → 設定 → guest向けサインイン導線 → Google サインイン
 * 成功」という経路が生まれた。無条件に `/walk-start` へ `replace` すると、進行中の散歩が見えない
 * 画面に飛ばされ、気づかず「散歩を始める」を押すと進行中の散歩が無警告で上書きされてしまう。
 * `useActiveWalkStore` の `activeWalk` を見て遷移先を分岐する（保存待ちドラフトより優先）。
 */
export function useAuthActions(): UseAuthActionsResult {
  const router = useRouter();
  const toast = useToast();
  const { show } = toast;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasActiveWalk = useActiveWalkStore((state) => state.activeWalk !== null);
  // セレクタはプリミティブを返す（zustand v5 の再レンダー対策）。
  // `signInForSaveRequested` を条件に含めるのが SS-37 ローカルレビュー対応の要点。
  // 保存待ちドラフトがあるだけでは true にせず、サマリ画面の CTA を押した意思表示があるときだけ
  // true にすることで、無関係なサインインでサマリへ強制的に連れて行かれないようにする。
  const wantsToSaveFinishedWalk = useFinishedWalkStore(
    (state) => state.finishedWalk !== null && !state.saved && state.signInForSaveRequested,
  );

  const runSignIn = useCallback(
    (failureMessage: string) => {
      if (isSubmitting) {
        // 多重タップ防止。
        return;
      }
      setIsSubmitting(true);
      authService
        .signIn("google")
        .then(() => {
          // 保存の再送はこの遷移に依存しない（多重防御）。`authService.signIn()` の中で
          // `setSession(user)` が走った瞬間にサマリ画面（スタック下で mount 済み）の
          // `isSignedIn` が true になり `useWalkSave` の effect が再発火する。ここでの
          // `dismissTo` はユーザーを保存中の画面へ戻すだけで、遷移が失敗しても保存自体は走る。
          const destination = getPostSignInDestination({ hasActiveWalk, wantsToSaveFinishedWalk });
          if (destination.type === "dismissTo") {
            router.dismissTo(destination.href);
            return;
          }
          router.replace(destination.href);
        })
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
    [isSubmitting, router, show, hasActiveWalk, wantsToSaveFinishedWalk],
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
