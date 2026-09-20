/**
 * `/app-config` の TanStack Query クエリキー。
 *
 * `queryClient.ts`（サインアウト時のクリア対象から除外する）と `hooks/useAppConfig.ts`
 * （`useQuery` に渡す）の両方から参照されるため、`appConfigApi.ts`（Orval 生成物 →
 * `client.ts` → `expo-crypto` に到達する）とは別ファイルに分けている。**他モジュールへの
 * 依存はゼロ**（`react-native` / `expo-*` / 生成物を import しない。vitest でそのままテストできる）。
 */

/**
 * `/app-config` のクエリキー。ドメイン名始まりの規約に従う（`["walks", ...]` と同じ考え方。
 * `docs/folder-structure.md`「`queryKey` はドメイン名で始める」）。
 * `useWalkSave` / `useWalkDelete` の `invalidateQueries({ queryKey: ["walks"] })` とは
 * 前方一致しないため、散歩の保存・削除では再取得されない（意図通り）。
 */
export const APP_CONFIG_QUERY_KEY = ["app-config"] as const;

/** `queryKey` が `/app-config` のものか（サインアウト時の一括削除から除外するために使う）。 */
export function isAppConfigQueryKey(queryKey: readonly unknown[]): boolean {
  return queryKey[0] === APP_CONFIG_QUERY_KEY[0];
}
