import { describe, expect, it } from "vitest";

import {
  PRIVACY_POLICY_LABEL,
  PRIVACY_POLICY_URL,
  TERMS_LABEL,
  TERMS_URL,
} from "@/config/legalLinks";
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

describe("TERMS_URL", () => {
  const url = new URL(TERMS_URL);

  it("アプリから開いてよい URL である", () => {
    expect(isOpenableExternalUrl(TERMS_URL)).toBe(true);
  });

  it("本番 LP のホスト（dev. や www. ではない）の https である", () => {
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("sanposcape.com");
  });

  it("末尾スラッシュ付きの /terms/ で、クエリ・ハッシュを持たない", () => {
    expect(url.pathname).toBe("/terms/");
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
  });
});

describe("TERMS_LABEL", () => {
  it("「利用規約」である", () => {
    expect(TERMS_LABEL).toBe("利用規約");
  });
});
