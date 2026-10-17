import { readFileSync } from "node:fs";
import path from "node:path";

import type { ConfigContext } from "expo/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import appConfig from "../../../../app.config";
import {
  STORE_URLS,
  shouldShowUpdateRequired,
  storeOpenFailedMessage,
  toStorePlatform,
} from "@/features/app-update/lib/updateRequired";
import type { AppConfigSnapshot } from "@/lib/appConfigSnapshot";

type Snapshot = Pick<AppConfigSnapshot, "status" | "minimumSupportedVersions">;

const ready = (ios: string | null, android: string | null): Snapshot => ({
  status: "ready",
  minimumSupportedVersions: { ios, android },
});

describe("shouldShowUpdateRequired", () => {
  it("取得済みで、その OS の最低バージョンを下回っていれば出す", () => {
    expect(
      shouldShowUpdateRequired({
        snapshot: ready("0.2.0", null),
        platform: "ios",
        currentVersion: "0.1.0",
        walkInProgress: false,
      }),
    ).toBe(true);
    expect(
      shouldShowUpdateRequired({
        snapshot: ready(null, "0.2.0"),
        platform: "android",
        currentVersion: "0.1.0",
        walkInProgress: false,
      }),
    ).toBe(true);
  });

  it("別の OS の最低バージョンでは判定しない", () => {
    expect(
      shouldShowUpdateRequired({
        snapshot: ready("9.0.0", null),
        platform: "android",
        currentVersion: "0.1.0",
        walkInProgress: false,
      }),
    ).toBe(false);
  });

  it("最低バージョン以上なら出さない", () => {
    expect(
      shouldShowUpdateRequired({
        snapshot: ready("0.1.0", "0.1.0"),
        platform: "ios",
        currentVersion: "0.1.0",
        walkInProgress: false,
      }),
    ).toBe(false);
  });

  it.each(["loading", "unavailable"] as const)("%s のときは出さない", (status) => {
    expect(
      shouldShowUpdateRequired({
        snapshot: { status, minimumSupportedVersions: { ios: "9.0.0", android: "9.0.0" } },
        platform: "ios",
        currentVersion: "0.1.0",
        walkInProgress: false,
      }),
    ).toBe(false);
  });

  it("散歩中・保存されていない散歩があるときは出さない", () => {
    expect(
      shouldShowUpdateRequired({
        snapshot: ready("9.0.0", "9.0.0"),
        platform: "ios",
        currentVersion: "0.1.0",
        walkInProgress: true,
      }),
    ).toBe(false);
  });

  it("ストアを持たない OS では出さない", () => {
    expect(
      shouldShowUpdateRequired({
        snapshot: ready("9.0.0", "9.0.0"),
        platform: null,
        currentVersion: "0.1.0",
        walkInProgress: false,
      }),
    ).toBe(false);
  });
});

describe("toStorePlatform", () => {
  it("ios / android だけを通す", () => {
    expect(toStorePlatform("ios")).toBe("ios");
    expect(toStorePlatform("android")).toBe("android");
    expect(toStorePlatform("web")).toBeNull();
  });
});

describe("storeOpenFailedMessage", () => {
  it("URL を含める", () => {
    expect(storeOpenFailedMessage(STORE_URLS.ios)).toContain(STORE_URLS.ios);
  });
});

describe("STORE_URLS は本番のアプリ識別子と一致する", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("iOS は eas.json の submit.production.ios.ascAppId を指す", () => {
    const easJson = JSON.parse(
      readFileSync(path.resolve(__dirname, "../../../../eas.json"), "utf8"),
    ) as { submit: { production: { ios: { ascAppId: string } } } };
    expect(STORE_URLS.ios).toBe(
      `https://apps.apple.com/app/id${easJson.submit.production.ios.ascAppId}`,
    );
  });

  it("Android は APP_VARIANT=production のパッケージ名を指す", () => {
    const appJson = JSON.parse(
      readFileSync(path.resolve(__dirname, "../../../../app.json"), "utf8"),
    ) as { expo: ConfigContext["config"] };
    vi.stubEnv("APP_VARIANT", "production");
    const result = appConfig({
      config: appJson.expo,
      projectRoot: "",
      staticConfigPath: null,
      packageJsonPath: null,
    } as unknown as ConfigContext);
    expect(STORE_URLS.android).toBe(
      `https://play.google.com/store/apps/details?id=${result.android?.package}`,
    );
  });
});
