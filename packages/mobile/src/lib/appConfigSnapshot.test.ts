import { describe, expect, it } from "vitest";

import type { AppConfigRead } from "@/api/generated/model";
import { isFeatureEnabled, toAppConfigSnapshot } from "@/lib/appConfigSnapshot";

const BASE_DATA: AppConfigRead = {
  flags: { app_config_probe: true },
  minimum_supported_versions: { ios: "0.1.0", android: "0.2.0" },
  config_source: "stub",
};

describe("toAppConfigSnapshot", () => {
  it("data ありなら ready で flags と minimumSupportedVersions（camelCase）が反映される", () => {
    const snapshot = toAppConfigSnapshot({ data: BASE_DATA, isError: false });

    expect(snapshot).toEqual({
      status: "ready",
      flags: { app_config_probe: true },
      minimumSupportedVersions: { ios: "0.1.0", android: "0.2.0" },
    });
  });

  it("data があり isError も true なら ready（直近の成功値を捨てない）", () => {
    const snapshot = toAppConfigSnapshot({ data: BASE_DATA, isError: true });

    expect(snapshot.status).toBe("ready");
  });

  it("data が無く isError なら unavailable かつ flags は空", () => {
    const snapshot = toAppConfigSnapshot({ data: undefined, isError: true });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.flags).toEqual({});
    expect(snapshot.minimumSupportedVersions).toEqual({ ios: null, android: null });
  });

  it("data が無く error も無いなら loading", () => {
    const snapshot = toAppConfigSnapshot({ data: undefined, isError: false });

    expect(snapshot.status).toBe("loading");
    expect(snapshot.flags).toEqual({});
  });

  it("minimum_supported_versions の undefined / null / 欠落はすべて null に畳まれる", () => {
    const undefinedCase = toAppConfigSnapshot({
      data: { ...BASE_DATA, minimum_supported_versions: { ios: undefined, android: undefined } },
      isError: false,
    });
    expect(undefinedCase.minimumSupportedVersions).toEqual({ ios: null, android: null });

    const nullCase = toAppConfigSnapshot({
      data: { ...BASE_DATA, minimum_supported_versions: { ios: null, android: null } },
      isError: false,
    });
    expect(nullCase.minimumSupportedVersions).toEqual({ ios: null, android: null });

    const missingCase = toAppConfigSnapshot({
      data: { ...BASE_DATA, minimum_supported_versions: {} },
      isError: false,
    });
    expect(missingCase.minimumSupportedVersions).toEqual({ ios: null, android: null });
  });

  it("スナップショットのキー集合が [status, flags, minimumSupportedVersions] のみ（config_source混入防止の回帰テスト）", () => {
    const snapshot = toAppConfigSnapshot({ data: BASE_DATA, isError: false });

    expect(Object.keys(snapshot).sort()).toEqual(
      ["status", "flags", "minimumSupportedVersions"].sort(),
    );
  });
});

describe("isFeatureEnabled", () => {
  it("ON のフラグは true", () => {
    const snapshot = toAppConfigSnapshot({ data: BASE_DATA, isError: false });
    expect(isFeatureEnabled(snapshot, "app_config_probe")).toBe(true);
  });

  it("OFF のフラグは false", () => {
    const snapshot = toAppConfigSnapshot({
      data: { ...BASE_DATA, flags: { app_config_probe: false } },
      isError: false,
    });
    expect(isFeatureEnabled(snapshot, "app_config_probe")).toBe(false);
  });

  it("未知キーは false", () => {
    const snapshot = toAppConfigSnapshot({ data: BASE_DATA, isError: false });
    expect(isFeatureEnabled(snapshot, "unknown_flag")).toBe(false);
  });

  it("loading 中は false", () => {
    const snapshot = toAppConfigSnapshot({ data: undefined, isError: false });
    expect(isFeatureEnabled(snapshot, "app_config_probe")).toBe(false);
  });

  it("unavailable のときは false", () => {
    const snapshot = toAppConfigSnapshot({ data: undefined, isError: true });
    expect(isFeatureEnabled(snapshot, "app_config_probe")).toBe(false);
  });
});
