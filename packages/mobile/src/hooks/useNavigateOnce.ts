import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef } from "react";

export type UseNavigateOnceResult = {
  /** 遷移を1回だけ通す。ラッチが立っている間は無視する。`navigate` が throw したらラッチを戻す。 */
  runOnce: (navigate: () => void) => void;
  /** ラッチが立っているか（遷移の発行後、フォーカスが戻るまで true）。 */
  isNavigating: () => boolean;
};

/**
 * 「画面から出る遷移」の二重発火を防ぐラッチ。フォーカスが戻るたびに解除する
 * （遷移が実際には起きなかった場合に、その画面から二度と出られなくなるのを防ぐ）。
 *
 * `BackHandler` は購読しない。戻る導線まで一本化したい画面は `useScreenBack`（内部でこの hook を使う）、
 * タブ画面のようにシステムバックの既定動作を変えたくない画面はこの hook を直接使う（ピンタブ。SS-146）。
 *
 * 機能非依存の汎用 hook なので `src/hooks/` に置く。`expo-router` の `useFocusEffect` に依存するため
 * Vitest の対象にしない（`useScreenBack` と同じ扱い）。
 */
export function useNavigateOnce(): UseNavigateOnceResult {
  const navigatingRef = useRef(false);

  const runOnce = useCallback((navigate: () => void) => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    try {
      navigate();
    } catch {
      // 遷移の発行自体が失敗した場合、以後の離脱操作を不必要にブロックしないようラッチを戻す。
      navigatingRef.current = false;
    }
  }, []);

  const isNavigating = useCallback(() => navigatingRef.current, []);

  useFocusEffect(
    useCallback(() => {
      navigatingRef.current = false;
    }, []),
  );

  // 呼び出し側が依存配列に含めても毎レンダー発火しないよう、戻り値を安定させる。
  return useMemo(() => ({ runOnce, isNavigating }), [runOnce, isNavigating]);
}
