import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { fetchAppConfig } from "@/api/appConfigApi";
import { APP_CONFIG_QUERY_KEY } from "@/api/appConfigQueryKey";
import { APP_CONFIG_STALE_TIME_MS } from "@/lib/appConfigRefresh";
import { toAppConfigSnapshot } from "@/lib/appConfigSnapshot";
import type { AppConfigSnapshot } from "@/lib/appConfigSnapshot";

/**
 * `/app-config` のサーバー状態を TanStack Query で保持する（**論点1の結論**: 保持場所は
 * **TanStack Query**。Zustand には複製しない。`docs/folder-structure.md`
 * 「サーバー由来のデータは `src/store/` に置かない」と ADR-002 の「サーバー状態 = TanStack Query」に
 * 従う。`/app-config` は未認証でも叩けるので、`AuthGate` の `loading` 中でも取得を開始できる＝
 * Zustand にする理由が無い）。
 *
 * `useQuery` / `prefetchQuery` / `getQueryState` で共有するオプション。
 */
export function appConfigQueryOptions() {
  return {
    queryKey: APP_CONFIG_QUERY_KEY,
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchAppConfig({ signal }),
    staleTime: APP_CONFIG_STALE_TIME_MS,
    // 一度取れた値は捨てない（再マウント時に「全 OFF」へ落ちてチラつかせないため）。
    gcTime: Number.POSITIVE_INFINITY,
    // `customFetch` の transientRetry（429/5xx/通信断を GET に限り最大3試行）に加えて、
    // TanStack 側でも 2 回まで（指数バックオフ）。起動直後の一時的な失敗から
    // アプリを再起動せずに回復させるため。
    retry: 2,
    // 画面遷移のたびに叩かない。更新の取り込みは staleTime とフォアグラウンド復帰に任せる。
    refetchOnMount: false,
  } as const;
}

/** 任意のコンポーネントから呼んでよい（同じ queryKey なので通信は重複しない）。 */
export function useAppConfig(): AppConfigSnapshot {
  const query = useQuery(appConfigQueryOptions());
  return useMemo(
    () => toAppConfigSnapshot({ data: query.data, isError: query.isError }),
    [query.data, query.isError],
  );
}

/**
 * 診断表示専用。`config_source`（値の出どころ）は ADR-008 追補 D1 により
 * **プロダクトの分岐に使ってはいけない**。`__DEV__` の画面（`/dev-screens`）だけが呼ぶこと。
 * 通常のプロダクトコードは `useAppConfig()` を使う（`AppConfigSnapshot` には
 * `config_source` が存在しないので、型の上で誤用できない）。
 */
export function useAppConfigDiagnostics(): { configSource: string | null } {
  const query = useQuery(appConfigQueryOptions());
  return useMemo(() => ({ configSource: query.data?.config_source ?? null }), [query.data?.config_source]);
}
