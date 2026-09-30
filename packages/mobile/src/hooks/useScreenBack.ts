import type { Href } from "expo-router";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import { BackHandler } from "react-native";

import { useNavigateOnce } from "@/hooks/useNavigateOnce";
import { resolveBackAction } from "@/lib/backNavigation";

export type UseScreenBackOptions = {
  /**
   * スタックに戻り先が無いときの遷移先。`router.replace()` する。
   * 例: 散歩開始画面 → "/(tabs)"、履歴一覧/詳細 → "/(tabs)/account"
   */
  fallbackHref: Href;
  /**
   * 戻る操作を画面側で消費したいときに true を返す（例: 開いている BottomSheet を閉じる）。
   * 毎レンダー最新の関数を ref に載せるため、useCallback で包む必要はない。
   */
  onIntercept?: () => boolean;
};

export type UseScreenBackResult = {
  /** 画面上の戻る/キャンセルボタンの onPress。Android のシステムバックからも呼ばれる。 */
  goBack: () => void;
  /**
   * この画面から出る他の遷移を、goBack と同じラッチで1回だけ通す。
   * 例: WalkStartView の「散歩を始める」。戻る連打・戻る＋開始の同時押しでも遷移は1回。
   */
  runOnce: (navigate: () => void) => void;
};

/**
 * 「画面から出る」操作を1箇所にまとめる hook。画面上の戻るボタン・Android のシステムバック・
 * その他の離脱遷移（例:「散歩を始める」）が同じラッチを共有するようにする。
 *
 * 機能非依存の汎用 hook なので `src/hooks/` に置く（`useToast.ts` と同じ扱い）。
 * `react-native`（`BackHandler`）を値 import するため Vitest の対象にしない
 * （`.test.ts` を作らない・`.test.ts` から import しない）。判定ロジックは
 * `src/lib/backNavigation.ts` の `resolveBackAction`（純粋関数）に切り出してテストする。
 *
 * 前提: `app.json` の `expo.android.predictiveBackGestureEnabled` が `false` であること。
 * true にすると Android の predictive back に切り替わり、`hardwareBackPress` で `true` を
 * 返す方式が効かなくなるため、その場合はこの hook の見直しが必要。
 */
export function useScreenBack({
  fallbackHref,
  onIntercept,
}: UseScreenBackOptions): UseScreenBackResult {
  const router = useRouter();
  // 遷移の二重発火ラッチ（フォーカスで解除）は BackHandler を購読しない `useNavigateOnce` に任せる。
  const { runOnce, isNavigating } = useNavigateOnce();
  // レンダー中の ref 代入は既存 `features/walk/hooks/useWalkTracking.ts`（pausedRef）と同じ手法。
  // BackHandler の購読を毎レンダー貼り直さずに最新の値を読むため。
  const interceptRef = useRef(onIntercept);
  interceptRef.current = onIntercept;
  const fallbackRef = useRef(fallbackHref);
  fallbackRef.current = fallbackHref;

  const goBack = useCallback(() => {
    const action = resolveBackAction({
      intercepted: interceptRef.current?.() === true,
      navigating: isNavigating(),
      canGoBack: router.canGoBack(),
    });

    // switch + default の never アサーションで網羅性を保証する。`BackAction` に
    // バリアントが増えたときに黙って既存の分岐へ吸い込まれる（if/else の落とし穴）のを防ぐ。
    switch (action) {
      case "intercepted":
      case "ignored":
        return;
      case "pop":
        // 遷移の発行に失敗した場合のラッチ復旧は runOnce が行う（ユーザーはもう一度戻る操作をやり直せる）。
        runOnce(() => router.back());
        return;
      case "replace-fallback":
        runOnce(() => router.replace(fallbackRef.current));
        return;
      default: {
        const exhaustiveCheck: never = action;
        return exhaustiveCheck;
      }
    }
  }, [router, runOnce, isNavigating]);

  useFocusEffect(
    useCallback(() => {
      // Android のシステムバックを画面上の戻ると同じ経路に一本化する。
      // true を返して既定の pop / アプリ終了を止める。
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        goBack();
        return true;
      });
      return () => subscription.remove();
    }, [goBack]),
  );

  // 呼び出し側（画面）が useEffect の依存配列に含めても毎レンダー発火しないよう、
  // 戻り値のオブジェクト自体を安定させる。
  return useMemo(() => ({ goBack, runOnce }), [goBack, runOnce]);
}
