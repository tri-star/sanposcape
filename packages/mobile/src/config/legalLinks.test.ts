import { describe, expect, it } from "vitest";

import { PRIVACY_POLICY_LABEL, PRIVACY_POLICY_URL } from "@/config/legalLinks";
import { isOpenableExternalUrl } from "@/lib/externalUrl";

describe("PRIVACY_POLICY_URL", () => {
  const url = new URL(PRIVACY_POLICY_URL);

  it("アプリから開いてよい URL である", () => {
    expect(isOpenableExternalUrl(PRIVACY_POLICY_URL)).toBe(true);
  });

  it("https である", () => {
    expect(url.protocol).toBe("https:");
  });

  it("本番 LP のホスト（dev. や www. ではない）である", () => {
    expect(url.hostname).toBe("sanposcape.com");
  });

  it("末尾スラッシュ付きの /privacy/ である", () => {
    expect(url.pathname).toBe("/privacy/");
  });

  it("クエリ・ハッシュを持たない", () => {
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
  });
});

describe("PRIVACY_POLICY_LABEL", () => {
  it("「プライバシーポリシー」である", () => {
    expect(PRIVACY_POLICY_LABEL).toBe("プライバシーポリシー");
  });
});
