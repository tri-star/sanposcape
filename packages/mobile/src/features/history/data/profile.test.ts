import { describe, expect, it } from "vitest";

import { STUB_USER_PROFILE } from "@/features/history/data/profile";

describe("STUB_USER_PROFILE", () => {
  it("displayName は非空文字列", () => {
    expect(STUB_USER_PROFILE.displayName.length).toBeGreaterThan(0);
  });
});
