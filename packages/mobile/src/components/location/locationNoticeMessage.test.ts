import { describe, expect, it } from "vitest";

import {
  type LocationNoticeContext,
  locationNoticeMessage,
} from "@/components/location/locationNoticeMessage";
import { locationErrorMessage } from "@/services/location/locationError";
import type { LocationErrorCode } from "@/services/location/types";

const CONTEXTS: LocationNoticeContext[] = ["explore", "tracking", "map"];

describe("locationNoticeMessage: permission_denied", () => {
  it("3つの文脈で非空かつ互いに異なる", () => {
    const messages = CONTEXTS.map((c) => locationNoticeMessage("permission_denied", c));
    for (const m of messages) expect(m.length).toBeGreaterThan(0);
    expect(new Set(messages).size).toBe(CONTEXTS.length);
  });

  it("map は長押しでの登録（代替手段）を案内する", () => {
    expect(locationNoticeMessage("permission_denied", "map")).toContain("長押し");
  });

  it("explore・tracking は設定アプリで変えられることを案内する", () => {
    expect(locationNoticeMessage("permission_denied", "explore")).toContain("設定アプリ");
    expect(locationNoticeMessage("permission_denied", "tracking")).toContain("設定アプリ");
  });

  it("許可を迫る「してください」を含まない（誘導しない文言の回帰防止）", () => {
    for (const c of CONTEXTS) {
      expect(locationNoticeMessage("permission_denied", c)).not.toContain("してください");
    }
  });
});

describe("locationNoticeMessage: その他のコード", () => {
  const OTHERS: LocationErrorCode[] = ["services_disabled", "timeout", "unavailable", "unknown"];
  it.each(OTHERS)("%s は文脈によらず共通文言", (code) => {
    for (const c of CONTEXTS) {
      expect(locationNoticeMessage(code, c)).toBe(locationErrorMessage(code));
    }
  });
});
