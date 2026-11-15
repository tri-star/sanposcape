import { useCallback, useState } from "react";

/**
 * pull-to-refresh のスピナー表示用 state（SS-121）。
 * `isRefetching` を使うとバックグラウンドの再取得（invalidate 等）でもスピナーが出るので、
 * ユーザーが引っ張った取得の間だけ true にする。
 */
export function usePullToRefresh(refresh: () => Promise<void>): {
  refreshing: boolean;
  onRefresh: () => void;
} {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void refresh().finally(() => setRefreshing(false));
  }, [refresh]);
  return { refreshing, onRefresh };
}
