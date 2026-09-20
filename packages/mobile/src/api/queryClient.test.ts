import { describe, expect, it } from "vitest";

import { queryClient } from "@/api/queryClient";
import { runSessionCleanup } from "@/lib/sessionCleanup";

// `queryClient.ts` は import された時点（モジュール読み込み時の副作用）で
// `registerSessionCleanup(...)` を実行済みである。vitest はテストファイルごとに
// モジュールを隔離して読み込むため、このファイル内では他のテストファイルの登録と
// 混ざらない（`sessionCleanup.test.ts` のように `resetSessionCleanupForTest()` を
// 呼ぶ必要は無い。呼ぶと `queryClient.ts` の実際の登録まで消えてしまうため使わない）。

describe("queryClient のサインアウト時クリア", () => {
  it("walks系のキャッシュは消え、app-config は残る", () => {
    queryClient.setQueryData(["walks", "list"], { items: [] });
    queryClient.setQueryData(["app-config"], { flags: { app_config_probe: true } });

    runSessionCleanup();

    expect(queryClient.getQueryData(["walks", "list"])).toBeUndefined();
    expect(queryClient.getQueryData(["app-config"])).toEqual({
      flags: { app_config_probe: true },
    });
  });

  it("ミューテーションキャッシュは空になる", () => {
    const mutationCache = queryClient.getMutationCache();
    mutationCache.build(queryClient, {
      mutationFn: async () => null,
    });
    expect(mutationCache.getAll().length).toBeGreaterThan(0);

    runSessionCleanup();

    expect(mutationCache.getAll().length).toBe(0);
  });
});
