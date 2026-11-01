import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";

import {
  getGuestEntryDestination,
  getPostSignInDestination,
} from "@/features/auth/lib/postSignInDestination";
import { getSignInFailureFeedback } from "@/features/auth/lib/signInFailureFeedback";
import { buildSignInFailureLogDetail } from "@/features/auth/lib/signInFailureLog";
import { parseSignInReturnTo } from "@/features/auth/lib/signInReturnTo";
import { useActiveWalkStore } from "@/features/walk/store/useActiveWalkStore";
import { useFinishedWalkStore } from "@/features/walk/store/useFinishedWalkStore";
import { useToast } from "@/hooks/useToast";
import { logDiagnostic } from "@/lib/diagnosticLog";
import { authService, isAuthError, type AuthProvider } from "@/services/auth";

export type UseAuthActionsResult = {
  signInWithGoogle: () => void;
  signInWithApple: () => void;
  /** ゲストのまま着地点（ピンタブ。進行中の散歩があればナビタブ）へ進む。認証状態は変えない＝トークン非保持のまま（ADR-002 決定6）。 */
  continueAsGuest: () => void;
  /** いずれかのサインイン処理中か。全ボタンの `disabled` 制御に使う（多重タップ防止）。 */
  isSubmitting: boolean;
  /** 処理中のプロバイダ。「ログイン中...」の表示を押したボタンだけに出すために使う。 */
  submittingProvider: AuthProvider | null;
  /** 失敗時のフィードバック用トースト状態（呼び出し側の画面で描画する）。 */
  toast: { visible: boolean; message: string };
};

/**
 * 認証アクションと遷移を1箇所にまとめる hook。
 * UI からロジックを分離し、成功後の遷移先は `getPostSignInDestination`（`features/auth/lib/`）が
 * 進行中の散歩の有無と、保存待ちドラフトかつサマリ画面の CTA から来た意思表示
 * （`useFinishedWalkStore.signInForSaveRequested`）の有無から、遷移方法（`replace`/`dismissTo`）
 * 込みで決める。
 * `AuthService.signIn(provider)`（Google / Apple）を real/dev/mock いずれのモードでも同じ形で呼ぶ
 * （`docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md` 決定5: signIn/signUp は区別しない）。
 * 失敗のトーストの文言は `getSignInFailureFeedback`（`features/auth/lib/`）が決める。Google のキャンセルは
 * 1回目は無反応にし、続いたら案内を出す（OAuth の設定不備もキャンセルとして返るため。SS-82）。
 * 失敗はキャンセルも含めて `logDiagnostic` で端末のログに残す（汎用の文言からは原因が分からないため。SS-82）。
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
 * 成功」という経路が生まれた。無条件に `/walk-start` へ `replace` すると（SS-145 以降の既定の着地点はピンタブ）、進行中の散歩が見えない
 * 画面に飛ばされ、気づかず「散歩を始める」を押すと進行中の散歩が無警告で上書きされてしまう。
 * `useActiveWalkStore` の `activeWalk` を見て遷移先を分岐する（保存待ちドラフトより優先）。
 */
export function useAuthActions(): UseAuthActionsResult {
  const router = useRouter();
  // 呼び出し元の指定（SS-151）。ディープリンクからも書けるので許可リストで検証する。
  const { returnTo: returnToParam } = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo = parseSignInReturnTo(returnToParam);
  // 失敗の文言に「続く場合は…」まで含めると、既定の 1.9 秒では読み切れないため長めにする（SS-82）。
  const toast = useToast(3500);
  const { show } = toast;
  const [submittingProvider, setSubmittingProvider] = useState<AuthProvider | null>(null);
  const isSubmitting = submittingProvider !== null;
  // 二重押下の同期ロック。state は再 render まで古い値のままなので、連打の2回目を防げない（Google / Apple 共通）。
  const submittingRef = useRef(false);
  // Google のキャンセルの連続回数。表示に使わないので state にしない（SS-82）。
  const consecutiveGoogleCancelsRef = useRef(0);
  const hasActiveWalk = useActiveWalkStore((state) => state.activeWalk !== null);
  // セレクタはプリミティブを返す（zustand v5 の再レンダー対策）。
  // `signInForSaveRequested` を条件に含めるのが SS-37 ローカルレビュー対応の要点。
  // 保存待ちドラフトがあるだけでは true にせず、サマリ画面の CTA を押した意思表示があるときだけ
  // true にすることで、無関係なサインインでサマリへ強制的に連れて行かれないようにする。
  const wantsToSaveFinishedWalk = useFinishedWalkStore(
    (state) => state.finishedWalk !== null && !state.saved && state.signInForSaveRequested,
  );

  const runSignIn = useCallback(
    (provider: AuthProvider) => {
      if (submittingRef.current) {
        // 多重タップ防止。
        return;
      }
      submittingRef.current = true;
      setSubmittingProvider(provider);
      authService
        .signIn(provider)
        .then(() => {
          consecutiveGoogleCancelsRef.current = 0;
          // 保存の再送はこの遷移に依存しない（多重防御）。`authService.signIn()` の中で
          // `setSession(user)` が走った瞬間にサマリ画面（スタック下で mount 済み）の
          // `isSignedIn` が true になり `useWalkSave` の effect が再発火する。ここでの
          // `dismissTo` はユーザーを保存中の画面へ戻すだけで、遷移が失敗しても保存自体は走る。
          const destination = getPostSignInDestination({
            hasActiveWalk,
            wantsToSaveFinishedWalk,
            canGoBack: router.canGoBack(),
            returnTo,
          });
          if (destination.type === "back") {
            router.back();
            return;
          }
          if (destination.type === "dismissTo") {
            router.dismissTo(destination.href);
            return;
          }
          router.replace(destination.href);
        })
        .catch((error: unknown) => {
          const authError = isAuthError(error) ? error : null;
          // 載せる内容（トークン・メールアドレスを載せないこと）は buildSignInFailureLogDetail のテストで固定している。
          logDiagnostic(
            "auth.sign-in.failed",
            buildSignInFailureLogDetail({ provider, authError, error }),
          );
          const feedback = getSignInFailureFeedback({
            provider,
            code: authError?.code ?? null,
            consecutiveGoogleCancels: consecutiveGoogleCancelsRef.current,
          });
          consecutiveGoogleCancelsRef.current = feedback.consecutiveGoogleCancels;
          if (feedback.message !== null) {
            show(feedback.message);
          }
        })
        .finally(() => {
          submittingRef.current = false;
          setSubmittingProvider(null);
        });
    },
    [router, show, hasActiveWalk, wantsToSaveFinishedWalk, returnTo],
  );

  const signInWithGoogle = useCallback(() => {
    runSignIn("google");
  }, [runSignIn]);

  const signInWithApple = useCallback(() => {
    runSignIn("apple");
  }, [runSignIn]);

  // authService は呼ばない。ゲストは「トークン非保持状態」であって AuthService のメソッドでは
  // ない（ADR-002 決定6）。起動時の復元失敗で useAuthSessionStore は既に guest になっているため、
  // ストアへの書き込みも不要（ストアの書き込み経路は2つだけ、という ADR-M-009 決定2 を守る）。
  // スプラッシュから来た（下に戻れる画面が無い）ときは replace（スプラッシュ→サインイン→着地点は
  // replace 連鎖で、着地点到達時に canGoBack() === false になる設計）。ピンタブなど `(tabs)` の上に
  // サインイン画面が積まれている場合は、`(tabs)` が二重にならないよう dismissTo で既存の
  // `(tabs)` へ戻る（SS-146。判定は `getGuestEntryDestination`）。isSubmitting によるガードは持たない（サインイン処理中の多重操作
  // 防止はサインインボタン専用。ゲストボタン側は View 側で disabled={isSubmitting} を付ける）。
  const continueAsGuest = useCallback(() => {
    const destination = getGuestEntryDestination({
      hasActiveWalk,
      canGoBack: router.canGoBack(),
    });
    if (destination.type === "dismissTo") {
      router.dismissTo(destination.href);
      return;
    }
    router.replace(destination.href);
  }, [router, hasActiveWalk]);

  return {
    signInWithGoogle,
    signInWithApple,
    continueAsGuest,
    isSubmitting,
    submittingProvider,
    toast: { visible: toast.visible, message: toast.message },
  };
}
