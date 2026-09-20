import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppState } from "react-native";
import type { AppStateStatus } from "react-native";

import { APP_CONFIG_QUERY_KEY } from "@/api/appConfigQueryKey";
import { appConfigQueryOptions } from "@/hooks/useAppConfig";
import { shouldRefreshOnForeground } from "@/lib/appConfigRefresh";

/**
 * アプリの生存中ずっと `/app-config` の observer を1つ維持し、フォアグラウンド復帰で
 * 再取得する。**呼ぶのは `AppConfigBootstrap` の1箇所だけ**
 * （`useAuthSessionBootstrap` が `AuthGate` からのみ呼ばれるのと同じ形）。
 *
 * 注意:
 * - `AppState` の購読はここ1箇所に閉じる。`useAppConfig()` 側に置くと、呼び出し元の数だけ購読が増える。
 * - TanStack Query の `refetchOnWindowFocus` はこのリポジトリで `focusManager` を配線していないため
 *   RN では効かない。**グローバルに `focusManager` を配線しない**（履歴・統計など他の全クエリの
 *   挙動まで変わり、SS-100 のスコープを超えるため）。
 * - この hook はレンダリングテストが書けない層。判定は `shouldRefreshOnForeground` に切り出し済み。
 *   `hooks/` は vitest 対象外（`architecture-guideline.md`）。
 */
export function useAppConfigBootstrap(): void {
  const queryClient = useQueryClient();

  // 起動直後に取得を開始する。この observer が常駐することで、
  // 画面側の useAppConfig() は常にキャッシュ済みの値から始まる。
  useQuery(appConfigQueryOptions());

  useEffect(() => {
    let previousState: AppStateStatus = AppState.currentState;
    const subscription = AppState.addEventListener("change", (nextState) => {
      const dataUpdatedAt = queryClient.getQueryState(APP_CONFIG_QUERY_KEY)?.dataUpdatedAt ?? 0;
      if (
        shouldRefreshOnForeground({ previousState, nextState, dataUpdatedAt, nowMs: Date.now() })
      ) {
        void queryClient.invalidateQueries({ queryKey: APP_CONFIG_QUERY_KEY });
      }
      previousState = nextState;
    });
    return () => subscription.remove();
  }, [queryClient]);
}
