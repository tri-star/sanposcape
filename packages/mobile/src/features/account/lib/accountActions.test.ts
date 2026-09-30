import { describe, expect, it } from "vitest";

import { ACCOUNT_ACTION_BAR_TEST_ID, resolveAccountActions } from "./accountActions";

describe("resolveAccountActions", () => {
  it("画面カタログを出さないときは「設定」だけ", () => {
    const actions = resolveAccountActions({ showScreenCatalog: false });
    expect(actions.map((a) => a.key)).toEqual(["settings"]);
  });

  it("画面カタログを出すときは「設定」→「画面カタログ」の順", () => {
    const actions = resolveAccountActions({ showScreenCatalog: true });
    expect(actions.map((a) => a.key)).toEqual(["settings", "screen-catalog"]);
  });

  it("href が固定されている", () => {
    const actions = resolveAccountActions({ showScreenCatalog: true });
    expect(actions.map((a) => a.href)).toEqual(["/settings", "/dev-screens"]);
  });

  it("testID が固定されている（E2E が依存する）", () => {
    const actions = resolveAccountActions({ showScreenCatalog: true });
    expect(actions.map((a) => a.testID)).toEqual([
      "account-open-settings",
      "account-open-screen-catalog",
    ]);
    expect(ACCOUNT_ACTION_BAR_TEST_ID).toBe("account-action-bar");
  });

  it("testID が重複しない", () => {
    const ids = resolveAccountActions({ showScreenCatalog: true }).map((a) => a.testID);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ラベルとアイコンが空でない", () => {
    for (const a of resolveAccountActions({ showScreenCatalog: true })) {
      expect(a.label).not.toBe("");
      expect(a.icon).not.toBe("");
    }
  });
});
