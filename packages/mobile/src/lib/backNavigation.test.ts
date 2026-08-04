import { describe, expect, it } from "vitest";

import { resolveBackAction } from "@/lib/backNavigation";

describe("resolveBackAction", () => {
  it.each([
    { intercepted: true, navigating: false, canGoBack: false, expected: "intercepted" },
    { intercepted: true, navigating: false, canGoBack: true, expected: "intercepted" },
    // navigating より優先: 遷移ラッチが立っていてもシートは閉じられなければならない。
    { intercepted: true, navigating: true, canGoBack: false, expected: "intercepted" },
    { intercepted: true, navigating: true, canGoBack: true, expected: "intercepted" },
    // 連打時に pop を2回発行しない。
    { intercepted: false, navigating: true, canGoBack: true, expected: "ignored" },
    { intercepted: false, navigating: true, canGoBack: false, expected: "ignored" },
    { intercepted: false, navigating: false, canGoBack: true, expected: "pop" },
    { intercepted: false, navigating: false, canGoBack: false, expected: "replace-fallback" },
  ] as const)(
    "intercepted=$intercepted navigating=$navigating canGoBack=$canGoBack → $expected",
    ({ intercepted, navigating, canGoBack, expected }) => {
      expect(resolveBackAction({ intercepted, navigating, canGoBack })).toBe(expected);
    },
  );
});
