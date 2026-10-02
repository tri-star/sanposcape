import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { ConfigContext } from "expo/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import appConfig from "../../app.config";

/**
 * 位置情報プラグインの契約テスト（SS-156 / ADR-M-018）。
 * ネイティブ設定は E2E でも単体テストでも動かないので、「常に」権限を誤って宣言する・
 * background mode を落とす、といった事故をここで防ぐ。
 */
type LocationPluginOptions = Record<string, unknown>;
type ExpoConfig = ConfigContext["config"];

const appJson = JSON.parse(readFileSync(path.resolve(__dirname, "../../app.json"), "utf8")) as {
  expo: ExpoConfig;
};

function findLocationOptions(config: ExpoConfig): LocationPluginOptions {
  const entry = (config.plugins ?? []).find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-location",
  );
  if (!Array.isArray(entry)) throw new Error("expo-location プラグインがオプション付きで無い");
  return entry[1] as LocationPluginOptions;
}

function evaluateAppConfig(): ExpoConfig {
  return appConfig({
    config: appJson.expo,
    projectRoot: "",
    staticConfigPath: null,
    packageJsonPath: null,
  } as unknown as ConfigContext) as ExpoConfig;
}

describe("expo-location プラグインの設定", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function expectBackgroundContract(options: LocationPluginOptions) {
    // iOS: UIBackgroundModes に location が入る
    expect(options.isIosBackgroundLocationEnabled).toBe(true);
    // Android: フォアグラウンドサービス（FGS_LOCATION）が入る
    expect(options.isAndroidForegroundServiceEnabled).toBe(true);
    // 「常に許可」（ACCESS_BACKGROUND_LOCATION）は宣言しない
    expect(options.isAndroidBackgroundLocationEnabled).not.toBe(true);
  }

  it("app.json: iOS の background mode と Android の FGS が有効", () => {
    const options = findLocationOptions(appJson.expo);
    expect(options.isIosBackgroundLocationEnabled).toBe(true);
    expect(options.isAndroidForegroundServiceEnabled).toBe(true);
  });

  it("app.json: ACCESS_BACKGROUND_LOCATION を宣言しない", () => {
    expect(findLocationOptions(appJson.expo).isAndroidBackgroundLocationEnabled).not.toBe(true);
  });

  it("app.json: 「常に」の権限文言を独自に設定しない（SS-157 で設定するならこのテストも見直す）", () => {
    const options = findLocationOptions(appJson.expo);
    expect(options.locationAlwaysPermission).toBeUndefined();
    expect(options.locationAlwaysAndWhenInUsePermission).toBeUndefined();
  });

  it("app.json: androidForegroundServiceIcon のファイルが存在する", () => {
    const icon = findLocationOptions(appJson.expo).androidForegroundServiceIcon;
    expect(typeof icon).toBe("string");
    expect(existsSync(path.resolve(__dirname, "../..", icon as string))).toBe(true);
  });

  it("APP_VARIANT=production で app.config を評価しても同じ契約を保つ", () => {
    vi.stubEnv("APP_VARIANT", "production");
    const options = findLocationOptions(evaluateAppConfig());
    expectBackgroundContract(options);
    expect(options).toEqual(findLocationOptions(appJson.expo));
  });
});
