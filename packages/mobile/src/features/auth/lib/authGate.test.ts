import { describe, expect, it } from "vitest";

import {
  canEnterProtectedRoutes,
  resolveAuthGateDecision,
  shouldEvacuateOnSessionEnd,
} from "@/features/auth/lib/authGate";

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

  it("guest は walk-start を許可する（SS-57 でゲスト散歩を解禁）", () => {
    expect(resolveAuthGateDecision({ status: "guest", segments: ["walk-start"] })).toEqual({
      type: "allow",
    });
  });

  it("guest は (tabs) / (tabs)/history を許可する（SS-57）", () => {
    expect(resolveAuthGateDecision({ status: "guest", segments: ["(tabs)"] })).toEqual({
      type: "allow",
    });
    expect(resolveAuthGateDecision({ status: "guest", segments: ["(tabs)", "history"] })).toEqual({
      type: "allow",
    });
  });

  it("guest は walk-history/[walkId] を許可する（SS-57）", () => {
    expect(
      resolveAuthGateDecision({ status: "guest", segments: ["walk-history", "[walkId]"] }),
    ).toEqual({ type: "allow" });
  });

  it("guest は settings を許可する（SS-57）", () => {
    expect(resolveAuthGateDecision({ status: "guest", segments: ["settings"] })).toEqual({
      type: "allow",
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
  it("guest は true（SS-57 でゲスト散歩を解禁）", () => {
    expect(canEnterProtectedRoutes("guest")).toBe(true);
  });

  it("authenticated は true", () => {
    expect(canEnterProtectedRoutes("authenticated")).toBe(true);
  });
});

describe("shouldEvacuateOnSessionEnd", () => {
  it("authenticated → guest かつ保護ルート上では退避する（サインアウト / 401 失効）", () => {
    expect(
      shouldEvacuateOnSessionEnd({
        previousStatus: "authenticated",
        status: "guest",
        isPublicRoute: false,
      }),
    ).toBe(true);
  });

  it("authenticated → guest でも公開ルート上では退避しない（移動先が現在地と同じ）", () => {
    expect(
      shouldEvacuateOnSessionEnd({
        previousStatus: "authenticated",
        status: "guest",
        isPublicRoute: true,
      }),
    ).toBe(false);
  });

  it("loading → guest では退避しない（起動時にゲストのままディープリンクで入る正規導線）", () => {
    expect(
      shouldEvacuateOnSessionEnd({
        previousStatus: "loading",
        status: "guest",
        isPublicRoute: false,
      }),
    ).toBe(false);
  });

  it("guest → guest では退避しない（暴発しない）", () => {
    expect(
      shouldEvacuateOnSessionEnd({
        previousStatus: "guest",
        status: "guest",
        isPublicRoute: false,
      }),
    ).toBe(false);
  });

  it("guest → authenticated では退避しない（サインイン直後に飛ばさない）", () => {
    expect(
      shouldEvacuateOnSessionEnd({
        previousStatus: "guest",
        status: "authenticated",
        isPublicRoute: false,
      }),
    ).toBe(false);
  });

  it("authenticated → authenticated では退避しない", () => {
    expect(
      shouldEvacuateOnSessionEnd({
        previousStatus: "authenticated",
        status: "authenticated",
        isPublicRoute: false,
      }),
    ).toBe(false);
  });
});
