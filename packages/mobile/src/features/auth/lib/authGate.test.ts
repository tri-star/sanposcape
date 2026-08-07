import { describe, expect, it } from "vitest";

import { canEnterProtectedRoutes, resolveAuthGateDecision } from "@/features/auth/lib/authGate";

describe("resolveAuthGateDecision", () => {
  it("loading 中は保護ルートでも弾かない（復元中は未認証扱いしない）", () => {
    expect(resolveAuthGateDecision({ status: "loading", segments: ["walk-start"] })).toEqual({
      type: "allow",
    });
  });

  it("loading 中はスプラッシュでも弾かない", () => {
    expect(resolveAuthGateDecision({ status: "loading", segments: [] })).toEqual({
      type: "allow",
    });
  });

  it("guest はスプラッシュ（segments: []）を許可する", () => {
    expect(resolveAuthGateDecision({ status: "guest", segments: [] })).toEqual({
      type: "allow",
    });
  });

  it("guest は (auth)/sign-in を許可する", () => {
    expect(resolveAuthGateDecision({ status: "guest", segments: ["(auth)", "sign-in"] })).toEqual({
      type: "allow",
    });
  });

  it("guest は dev-screens を許可する", () => {
    expect(resolveAuthGateDecision({ status: "guest", segments: ["dev-screens"] })).toEqual({
      type: "allow",
    });
  });

  it("guest は design-system を許可する", () => {
    expect(resolveAuthGateDecision({ status: "guest", segments: ["design-system"] })).toEqual({
      type: "allow",
    });
  });

  it("guest は _sitemap を許可する（本番でも到達可能。ADR-009 参照）", () => {
    expect(resolveAuthGateDecision({ status: "guest", segments: ["_sitemap"] })).toEqual({
      type: "allow",
    });
  });

  it("guest は walk-start を弾き、サインイン画面へ redirect する", () => {
    expect(resolveAuthGateDecision({ status: "guest", segments: ["walk-start"] })).toEqual({
      type: "redirect",
      href: "/(auth)/sign-in",
    });
  });

  it("guest は (tabs) / (tabs)/history を弾く", () => {
    expect(resolveAuthGateDecision({ status: "guest", segments: ["(tabs)"] })).toEqual({
      type: "redirect",
      href: "/(auth)/sign-in",
    });
    expect(resolveAuthGateDecision({ status: "guest", segments: ["(tabs)", "history"] })).toEqual({
      type: "redirect",
      href: "/(auth)/sign-in",
    });
  });

  it("guest は walk-history/[walkId] を弾く", () => {
    expect(
      resolveAuthGateDecision({ status: "guest", segments: ["walk-history", "[walkId]"] }),
    ).toEqual({ type: "redirect", href: "/(auth)/sign-in" });
  });

  it("guest は settings を弾く", () => {
    expect(resolveAuthGateDecision({ status: "guest", segments: ["settings"] })).toEqual({
      type: "redirect",
      href: "/(auth)/sign-in",
    });
  });

  it("authenticated は walk-start / settings を許可する", () => {
    expect(resolveAuthGateDecision({ status: "authenticated", segments: ["walk-start"] })).toEqual({
      type: "allow",
    });
    expect(resolveAuthGateDecision({ status: "authenticated", segments: ["settings"] })).toEqual({
      type: "allow",
    });
  });

  it("authenticated は (auth)/sign-in も許可する（追い出さない仕様の固定）", () => {
    expect(
      resolveAuthGateDecision({ status: "authenticated", segments: ["(auth)", "sign-in"] }),
    ).toEqual({ type: "allow" });
  });
});

describe("canEnterProtectedRoutes", () => {
  it("guest は false（将来のゲスト散歩で変える1箇所）", () => {
    expect(canEnterProtectedRoutes("guest")).toBe(false);
  });

  it("authenticated は true", () => {
    expect(canEnterProtectedRoutes("authenticated")).toBe(true);
  });
});
