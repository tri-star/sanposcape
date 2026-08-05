import type { Href } from "expo-router";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import { BackHandler } from "react-native";

import { resolveBackAction } from "@/lib/backNavigation";

export type UseScreenBackOptions = {
  /**
   * スタックに戻り先が無いときの遷移先。`router.replace()` する。
   * 例: 散歩開始画面 → "/(tabs)"、履歴一覧/詳細 → "/(tabs)/history"
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
  const navigatingRef = useRef(false);
  // レンダー中の ref 代入は既存 `features/walk/hooks/useWalkTracking.ts`（pausedRef）と同じ手法。
  // BackHandler の購読を毎レンダー貼り直さずに最新の値を読むため。
  const interceptRef = useRef(onIntercept);
  interceptRef.current = onIntercept;
  const fallbackRef = useRef(fallbackHref);
  fallbackRef.current = fallbackHref;

  const goBack = useCallback(() => {
    const action = resolveBackAction({
      intercepted: interceptRef.current?.() === true,
      navigating: navigatingRef.current,
      canGoBack: router.canGoBack(),
    });

    // switch + default の never アサーションで網羅性を保証する。`BackAction` に
    // バリアントが増えたときに黙って既存の分岐へ吸い込まれる（if/else の落とし穴）のを防ぐ。
    switch (action) {
      case "intercepted":
      case "ignored":
        return;
      case "pop":
        navigatingRef.current = true;
        try {
          router.back();
        } catch {
          // 遷移の発行自体が失敗した場合はラッチを戻す。フォーカス復帰でも解除されるが、
          // フォーカスが変わらないまま失敗するケースに備えた保険。失敗の詳細は握りつぶし、
          // ユーザーはもう一度戻る操作をやり直せる状態に戻すことだけを保証する。
          navigatingRef.current = false;
        }
        return;
      case "replace-fallback":
        navigatingRef.current = true;
        try {
          router.replace(fallbackRef.current);
        } catch {
          navigatingRef.current = false;
        }
        return;
      default: {
        const exhaustiveCheck: never = action;
        return exhaustiveCheck;
      }
    }
  }, [router]);

  const runOnce = useCallback((navigate: () => void) => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    try {
      navigate();
    } catch {
      // 遷移の発行自体が失敗した場合、同じ画面からの以後の戻る・離脱操作を
      // 不必要にブロックしないようラッチを復旧する。
      navigatingRef.current = false;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      // 画面にフォーカスが戻ったらラッチを解除する。遷移が実際には起きなかった場合
      // （replace の失敗など）に、その画面から二度と出られなくなるのを防ぐ。
      navigatingRef.current = false;

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
